const expText = `Senior ML Engineer (Computer Vision) — Kultprosvet
GlobalLogic (2010-2012): C++/C#/JavaScript Dev for media/video editing enterprise tools.`;

function inferTotalYears(expText) {
  const currentYear = new Date().getFullYear();
  const rangePattern = /\b(19|20)(\d{2})\s*[-–—to]+\s*(?:(19|20)(\d{2})|present|current|now)\b/gi;
  let totalMonths = 0;
  let match;

  while ((match = rangePattern.exec(expText)) !== null) {
    const startYear = parseInt(match[1] + match[2], 10);
    const endYear = match[3] && match[4] ? parseInt(match[3] + match[4], 10) : currentYear;
    if (endYear >= startYear && startYear > 1950 && endYear <= currentYear + 1) {
      totalMonths += (endYear - startYear) * 12;
    }
  }
  return Math.round((totalMonths / 12) * 10) / 10;
}
console.log("Years:", inferTotalYears(expText));

const entryHeaderPattern = /^(.+?)\s+(?:at|@|-|—|–)\s+(.+?)(?:\s*[\\(|,]\s*\d{4})?/i;
const dateLinePattern = /\b(19|20)\d{2}\b/;
let currentEntry = null;
const entries = [];
for (const line of expText.split('\n')) {
    const headerMatch = entryHeaderPattern.exec(line);
    if (headerMatch || (dateLinePattern.test(line) && line.trim().length < 100)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = headerMatch
        ? { role: headerMatch[1].trim(), company: headerMatch[2].trim(), bulletPoints: [] }
        : { role: line.trim(), company: "", bulletPoints: [] };
    } else if (currentEntry) {
      currentEntry.bulletPoints.push(line.replace(/^[-–—*•·]\s*/, "").trim());
    }
}
if (currentEntry) entries.push(currentEntry);
console.log("Entries:", JSON.stringify(entries, null, 2));

