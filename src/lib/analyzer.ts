import PDFParser from "pdf2json";
import type {
  JobDescription,
  ResumeData,
  SkillMatch,
  GapReport,
  AnalysisResult,
  AnalyzerOptions,
} from "./schema";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

const DEFAULT_WEIGHTS = {
  hardSkills: 0.5,
  softSkills: 0.2,
  experience: 0.3,
};

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "must", "it", "its", "you", "your", "we", "our", "they", "their",
  "he", "she", "him", "her", "this", "that", "these", "those", "not",
  "no", "nor", "so", "if", "then", "than", "too", "very", "just",
  "about", "above", "after", "again", "all", "also", "am", "any",
  "because", "before", "between", "both", "each", "few", "get",
  "here", "how", "into", "more", "most", "new", "now", "only",
  "other", "over", "own", "same", "some", "such", "there", "through",
  "under", "until", "up", "what", "when", "where", "which", "while",
  "who", "whom", "why", "work", "working", "role", "team", "able",
  "experience", "including", "using", "etc", "e.g", "i.e",
]);

// ─── 1. PDF Parsing ─────────────────────────────────────────────────────────

export async function parsePdf(pdfBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // pdf2json requires instantiation
    const pdfParser = new PDFParser(null, true);

    pdfParser.on("pdfParser_dataError", (errData: any) =>
      reject(new Error(errData.parserError?.message || errData.message || "Parse error"))
    );

    pdfParser.on("pdfParser_dataReady", () => {
      // getRawTextContent() returns the text. It contains some formatting like \r\n and page separators.
      const rawText = pdfParser.getRawTextContent();
      resolve(cleanText(rawText));
    });

    pdfParser.parseBuffer(pdfBuffer);
  });
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\x20-\x7E\n]/g, "")
    .trim();
}

// ─── 2. Resume Text → ResumeData ────────────────────────────────────────────

const SECTION_PATTERNS: { key: string; pattern: RegExp }[] = [
  { key: "summary",    pattern: /^[\s\p{Emoji}\W]*(summary|objective|profile|about me|about|professional summary)[\s\W]*$/ui },
  { key: "skills",     pattern: /^[\s\p{Emoji}\W]*(skills|technologies|tech stack|competencies|proficiencies|core competencies|technical skills)[\s\W]*$/ui },
  { key: "experience", pattern: /^[\s\p{Emoji}\W]*(experience|employment|work history|professional background|work experience|professional experience|relevant experience)[\s\W]*$/ui },
  { key: "education",  pattern: /^[\s\p{Emoji}\W]*(education|academic|degrees?|certifications?)[\s\W]*$/ui },
];

export function extractResumeData(text: string): ResumeData {
  const sections = splitIntoSections(text);
  return {
    name: extractName(text),
    summary: sections["summary"] ?? "",
    skills: extractSkillTokens(sections["skills"] ?? ""),
    experience: extractExperience(sections["experience"] ?? ""),
    education: extractEducation(sections["education"] ?? ""),
    totalYearsExperience: inferTotalYears(sections["experience"] ?? "") || inferTotalYears(text),
  };
}

function splitIntoSections(text: string): Record<string, string> {
  const lines = text.split("\n");
  const sections: Record<string, string> = {};
  let currentKey = "header";
  const buffer: string[] = [];

  for (const line of lines) {
    const matched = SECTION_PATTERNS.find((s) => s.pattern.test(line));
    if (matched && line.trim().length < 60) {
      sections[currentKey] = buffer.join("\n").trim();
      buffer.length = 0;
      currentKey = matched.key;
    } else {
      buffer.push(line);
    }
  }
  sections[currentKey] = buffer.join("\n").trim();
  return sections;
}

function extractName(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0);
  return firstLine?.trim() ?? "Unknown";
}

function extractSkillTokens(skillsText: string): string[] {
  if (!skillsText) return [];
  return skillsText
    .split(/[,|;•·\n]+/)
    .map((s) => s.replace(/^[-–—*]\s*/, "").trim().toLowerCase())
    .filter((s) => s.length > 1 && s.length < 60);
}

function extractExperience(
  expText: string
): { company: string; role: string; bulletPoints: string[] }[] {
  if (!expText) return [];

  const entries: { company: string; role: string; bulletPoints: string[] }[] = [];
  const lines = expText.split("\n").filter((l) => l.trim());
  const entryHeaderPattern = /^(.+?)\s+(?:at|@|-|—|–)\s+(.*)$/i;
  const dateLinePattern = /\b(19|20)\d{2}\b/;
  let currentEntry: { company: string; role: string; bulletPoints: string[] } | null = null;

  for (const line of lines) {
    const headerMatch = entryHeaderPattern.exec(line);
    if (headerMatch || (dateLinePattern.test(line) && line.trim().length < 100)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = headerMatch
        ? { role: headerMatch[1].trim(), company: headerMatch[2].replace(/(?:\s*[\(|,]\s*\d{4}.*)$/, "").trim(), bulletPoints: [] }
        : { role: line.trim(), company: "", bulletPoints: [] };
    } else if (currentEntry) {
      currentEntry.bulletPoints.push(line.replace(/^[-–—*•·]\s*/, "").trim());
    }
  }
  if (currentEntry) entries.push(currentEntry);
  return entries;
}

function extractEducation(eduText: string): string[] {
  if (!eduText) return [];
  return eduText.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
}

function inferTotalYears(expText: string): number {
  if (!expText) return 0;
  const currentYear = new Date().getFullYear();
  const rangePattern = /\b(19|20)(\d{2})\s*[-–—to]+\s*(?:(19|20)(\d{2})|present|current|now)\b/gi;
  let match: RegExpExecArray | null;
  const years = new Set<number>();

  while ((match = rangePattern.exec(expText)) !== null) {
    const startYear = parseInt(match[1] + match[2], 10);
    const endYear = match[3] && match[4] ? parseInt(match[3] + match[4], 10) : currentYear;
    if (endYear >= startYear && startYear > 1950 && endYear <= currentYear + 1) {
      for (let y = startYear; y <= endYear; y++) {
        years.add(y);
      }
    }
  }
  return years.size > 0 ? years.size - 1 : 0;
}

// ─── 3. Comparison Engine ────────────────────────────────────────────────────

function jaccardBigramSimilarity(a: string, b: string): number {
  const bigramsOf = (s: string): Set<string> => {
    const bg = new Set<string>();
    const norm = s.toLowerCase().trim();
    for (let i = 0; i < norm.length - 1; i++) {
      bg.add(norm.substring(i, i + 2));
    }
    return bg;
  };

  const setA = bigramsOf(a);
  const setB = bigramsOf(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function matchSkill(jdSkill: string, resumeSkills: string[], threshold: number): SkillMatch {
  let bestScore = 0;
  let bestMatch: string | undefined;
  const normJd = jdSkill.toLowerCase().trim();

  for (const rs of resumeSkills) {
    const normRs = rs.toLowerCase().trim();
    if (normRs.includes(normJd) || normJd.includes(normRs)) {
      let displayMatch = rs;
      if (displayMatch.length > 60) {
        const idx = normRs.indexOf(normJd);
        if (idx !== -1) {
          const start = Math.max(0, idx - 20);
          const end = Math.min(displayMatch.length, idx + normJd.length + 20);
          displayMatch = (start > 0 ? "..." : "") + displayMatch.substring(start, end).trim() + (end < displayMatch.length ? "..." : "");
        } else {
          displayMatch = displayMatch.substring(0, 60) + "...";
        }
      }
      return { skill: jdSkill, matched: true, similarity: 1.0, bestResumeMatch: displayMatch };
    }
    const sim = jaccardBigramSimilarity(normJd, normRs);
    if (sim > bestScore) { bestScore = sim; bestMatch = rs; }
  }

  if (bestMatch && bestMatch.length > 60) {
    bestMatch = bestMatch.substring(0, 60) + "...";
  }

  return {
    skill: jdSkill,
    matched: bestScore >= threshold,
    similarity: Math.round(bestScore * 1000) / 1000,
    bestResumeMatch: bestScore >= threshold ? bestMatch : undefined,
  };
}

function scoreSkillList(
  jdSkills: string[], resumeSkills: string[], threshold: number
): { matches: SkillMatch[]; score: number } {
  if (jdSkills.length === 0) return { matches: [], score: 1 };
  const matches = jdSkills.map((s) => matchSkill(s, resumeSkills, threshold));
  const score = matches.filter((m) => m.matched).length / matches.length;
  return { matches, score };
}

function scoreExperience(actual: number | undefined, required: number): number {
  if (required <= 0) return 1;
  if (actual === undefined || actual <= 0) return 0;
  return Math.min(actual / required, 1.0);
}

export function computeAlignment(
  resume: ResumeData,
  job: JobDescription,
  options?: AnalyzerOptions
): {
  hardSkillScore: number;
  softSkillScore: number;
  experienceScore: number;
  overallScore: number;
  matchedSkills: SkillMatch[];
} {
  const threshold = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const weights = {
    hardSkills: options?.weights?.hardSkills ?? DEFAULT_WEIGHTS.hardSkills,
    softSkills: options?.weights?.softSkills ?? DEFAULT_WEIGHTS.softSkills,
    experience: options?.weights?.experience ?? DEFAULT_WEIGHTS.experience,
  };

  const searchableTextArray = [
    ...resume.skills,
    ...resume.experience.flatMap(e => [e.company, e.role, ...e.bulletPoints]),
    resume.summary
  ].filter(s => s && s.trim().length > 0);

  const hard = scoreSkillList(job.requiredSkills, searchableTextArray, threshold);
  const soft = scoreSkillList(job.preferredSkills, searchableTextArray, threshold);
  const experienceScore = scoreExperience(resume.totalYearsExperience, job.minExperienceYears);

  const overallScore =
    hard.score * weights.hardSkills +
    soft.score * weights.softSkills +
    experienceScore * weights.experience;

  return {
    hardSkillScore: Math.round(hard.score * 1000) / 1000,
    softSkillScore: Math.round(soft.score * 1000) / 1000,
    experienceScore: Math.round(experienceScore * 1000) / 1000,
    overallScore: Math.round(overallScore * 1000) / 1000,
    matchedSkills: [...hard.matches, ...soft.matches],
  };
}

// ─── 4. Gap Identification ──────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,;|•·\-–—/\\()[\]{}<>:'"!?.]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  );
}

export function identifyGaps(
  resume: ResumeData,
  job: JobDescription,
  matchedSkills: SkillMatch[]
): GapReport {
  const missingHardSkills = matchedSkills
    .filter(
      (m) =>
        !m.matched &&
        job.requiredSkills.map((s) => s.toLowerCase()).includes(m.skill.toLowerCase())
    )
    .map((m) => m.skill);

  const missingSoftSkills = matchedSkills
    .filter(
      (m) =>
        !m.matched &&
        job.preferredSkills.map((s) => s.toLowerCase()).includes(m.skill.toLowerCase())
    )
    .map((m) => m.skill);

  const jdText = job.rawText ?? buildJdText(job);
  const resumeText = buildResumeText(resume);
  const jdTokens = tokenize(jdText);
  const resumeTokens = tokenize(resumeText);
  const missingKeywords = [...jdTokens].filter((t) => !resumeTokens.has(t)).sort();

  return { missingHardSkills, missingSoftSkills, missingKeywords };
}

function buildJdText(job: JobDescription): string {
  return [job.title, job.company, ...job.requiredSkills, ...job.preferredSkills, ...job.responsibilities].join(" ");
}

function buildResumeText(resume: ResumeData): string {
  return [
    resume.name, resume.summary, ...resume.skills,
    ...resume.experience.flatMap((e) => [e.company, e.role, ...e.bulletPoints]),
    ...resume.education,
  ].join(" ");
}

// ─── 5. Public Entry Point ──────────────────────────────────────────────────

export async function analyzeResumeAgainstJob(
  pdfBuffer: Buffer,
  job: JobDescription,
  options?: AnalyzerOptions
): Promise<AnalysisResult> {
  const rawText = await parsePdf(pdfBuffer);
  const resumeData = extractResumeData(rawText);
  const alignment = computeAlignment(resumeData, job, options);
  const gaps = identifyGaps(resumeData, job, alignment.matchedSkills);

  return {
    hardSkillScore: alignment.hardSkillScore,
    softSkillScore: alignment.softSkillScore,
    experienceScore: alignment.experienceScore,
    overallScore: alignment.overallScore,
    matchedSkills: alignment.matchedSkills,
    gaps,
    resumeData,
    jobDescription: job,
  };
}
