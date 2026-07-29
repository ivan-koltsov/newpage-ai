// ─── Input Types ─────────────────────────────────────────────────────────────

export interface JobDescription {
  id: string;
  title: string;
  company: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minExperienceYears: number;
  responsibilities: string[];
  /** Optional raw text body for full keyword-gap analysis. */
  rawText?: string;
}

export interface ResumeData {
  name: string;
  summary: string;
  skills: string[];
  experience: { company: string; role: string; bulletPoints: string[] }[];
  education: string[];
  /** Inferred total years of professional experience. */
  totalYearsExperience?: number;
}

// ─── Analysis Result Types ───────────────────────────────────────────────────

/** Per-skill match result. */
export interface SkillMatch {
  skill: string;
  matched: boolean;
  /** Jaccard similarity score (0–1). */
  similarity: number;
  /** The best-matching skill token found on the resume, if any. */
  bestResumeMatch?: string;
}

/** Missing items report. */
export interface GapReport {
  missingHardSkills: string[];
  missingSoftSkills: string[];
  missingKeywords: string[];
}

/** Top-level analysis result. */
export interface AnalysisResult {
  hardSkillScore: number;
  softSkillScore: number;
  experienceScore: number;
  overallScore: number;
  matchedSkills: SkillMatch[];
  gaps: GapReport;
  resumeData: ResumeData;
  jobDescription: JobDescription;
}

export interface AnalyzerOptions {
  similarityThreshold?: number;
  weights?: {
    hardSkills?: number;
    softSkills?: number;
    experience?: number;
  };
}

// ─── Chat & RAG Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** If the question is scoped to a specific job. */
  jobId?: string;
}

export interface DocumentChunk {
  id: string;
  text: string;
  source: "resume" | "job";
  documentId: string;
  chunkIndex: number;
}

export interface VectorEntry {
  chunk: DocumentChunk;
  embedding: number[];
}
