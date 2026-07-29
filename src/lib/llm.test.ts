import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractJobDetailsWithLLM } from "./llm";
import { GoogleGenerativeAI } from "@google/generative-ai";

vi.mock("@google/generative-ai", () => {
  const generateContent = vi.fn();
  const getGenerativeModel = vi.fn(() => ({ generateContent }));
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel = getGenerativeModel;
    },
    _generateContent: generateContent, // export for assertions
  };
});

describe("LLM Extraction (extractJobDetailsWithLLM)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.clearAllMocks();
  });

  it("should correctly parse standard JSON from the LLM", async () => {
    const mockJson = {
      title: "Senior Developer",
      company: "Tech Co",
      requiredSkills: ["React", "TypeScript"],
      preferredSkills: ["Node.js"],
      minExperienceYears: 5,
      responsibilities: ["Write code", "Review PRs"]
    };

    const { _generateContent } = await import("@google/generative-ai");
    (_generateContent as any).mockResolvedValueOnce({
      response: { text: () => JSON.stringify(mockJson) }
    });

    const result = await extractJobDetailsWithLLM("Some job text...");

    expect(result).toEqual(mockJson);
    expect(_generateContent).toHaveBeenCalledTimes(1);
    
    // Check that the system prompt asks for JSON
    const callArgs = (_generateContent as any).mock.calls[0][0];
    expect(callArgs.contents[0].parts[0].text).toContain("Some job text");
  });

  it("should properly strip markdown backticks from the LLM response", async () => {
    const mockJson = {
      title: "Backend Engineer",
      company: "Acme Corp",
      requiredSkills: ["Python"],
      preferredSkills: [],
      minExperienceYears: 3,
      responsibilities: []
    };

    const mockResponse = `\`\`\`json\n${JSON.stringify(mockJson)}\n\`\`\``;
    const { _generateContent } = await import("@google/generative-ai");
    (_generateContent as any).mockResolvedValueOnce({
      response: { text: () => mockResponse }
    });

    const result = await extractJobDetailsWithLLM("Some job text...");
    expect(result).toEqual(mockJson);
  });

  it("should throw an error if the LLM returns malformed JSON", async () => {
    const { _generateContent } = await import("@google/generative-ai");
    (_generateContent as any).mockResolvedValueOnce({
      response: { text: () => "Oops, I forgot to format this as JSON." }
    });
    
    await expect(extractJobDetailsWithLLM("Some job text...")).rejects.toThrow("Failed to parse extracted job details");
  });
});
