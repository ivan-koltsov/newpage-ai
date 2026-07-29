import { describe, it, expect } from "vitest";
import { extractResumeData, computeAlignment, identifyGaps } from "./analyzer";
import type { JobDescription, ResumeData } from "./schema";

describe("analyzer", () => {
  describe("extractResumeData", () => {
    it("should extract basic skills from text", () => {
      const resumeText = `
        John Doe
        Software Engineer
        
        Skills
        React, TypeScript, Node.js, Python, CSS
        
        Experience
        Developer at Company X
        2015 - 2020
      `;
      
      const data = extractResumeData(resumeText);
      expect(data.name).toBe("John Doe");
      expect(data.skills.length).toBeGreaterThan(0);
      expect(data.skills).toContain("react");
      expect(data.skills).toContain("typescript");
    });
    
    it("should extract total years of experience from year ranges", () => {
      const resumeText = `
        Experience
        Developer at Company X (2018-2021)
        Lead Developer at Company Y (2021-Present)
      `;
      
      const data = extractResumeData(resumeText);
      // 2021 - 2018 = 3, Present (2026) - 2021 = 5. Total 8.
      expect(data.totalYearsExperience).toBe(8);
    });
    
    it("should gracefully handle missing information", () => {
      const resumeText = `Just a plain string with no obvious structure.`;
      const data = extractResumeData(resumeText);
      expect(data.name).toBe("Just a plain string with no obvious structure.");
      expect(data.skills).toEqual([]);
      expect(data.totalYearsExperience).toBe(0);
    });
  });

  describe("computeAlignment", () => {
    it("should calculate similarity and identify gaps", () => {
      const resume: ResumeData = {
        name: "Test User",
        summary: "",
        skills: ["react", "typescript", "node.js"],
        experience: [],
        education: [],
        totalYearsExperience: 3,
      };
      
      const job: JobDescription = {
        id: "1",
        title: "Frontend Developer",
        company: "Tech Corp",
        requiredSkills: ["react", "typescript", "graphql"],
        preferredSkills: ["communication"],
        minExperienceYears: 2,
        responsibilities: [],
      };
      
      const alignment = computeAlignment(resume, job);
      const gaps = identifyGaps(resume, job, alignment.matchedSkills);
      
      expect(alignment.overallScore).toBeGreaterThan(0);
      
      // Should find GraphQL as a gap
      expect(gaps.missingHardSkills.map(s => s.toLowerCase())).toContain("graphql");
      
      // Should find React and TypeScript as matches
      const matchNames = alignment.matchedSkills.filter(m => m.matched).map(s => s.skill.toLowerCase());
      expect(matchNames).toContain("react");
      expect(matchNames).toContain("typescript");
      
      // Experience should match
      expect(alignment.experienceScore).toBeGreaterThanOrEqual(1);
    });
    
    it("should identify experience gaps", () => {
      const resume: ResumeData = {
        name: "Test User",
        summary: "",
        skills: ["react"],
        experience: [],
        education: [],
        totalYearsExperience: 1,
      };
      
      const job: JobDescription = {
        id: "1",
        title: "Senior Developer",
        company: "Tech Corp",
        requiredSkills: ["react"],
        preferredSkills: [],
        minExperienceYears: 5,
        responsibilities: [],
      };
      
      const alignment = computeAlignment(resume, job);
      const gaps = identifyGaps(resume, job, alignment.matchedSkills);
      
      // 1 year experience vs 5 required
      expect(alignment.experienceScore).toBeLessThan(1);
    });
  });
});
