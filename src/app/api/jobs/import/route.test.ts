import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as cheerio from "cheerio";
import { isLLMConfigured, extractJobDetailsWithLLM } from "@/lib/llm";
import { ingestDocument } from "@/lib/rag";
import { sessionStore } from "@/lib/store";

// Mock dependencies
vi.mock("cheerio");
vi.mock("@/lib/llm");
vi.mock("@/lib/rag");
vi.mock("@/lib/logger");

describe("POST /api/jobs/import", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return 400 if url or sessionId is missing", async () => {
    const request = new Request("http://localhost:3000/api/jobs/import", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("url and sessionId are required");
  });

  it("should return 400 if LLM is not configured", async () => {
    vi.mocked(isLLMConfigured).mockReturnValue(false);

    const request = new Request("http://localhost:3000/api/jobs/import", {
      method: "POST",
      body: JSON.stringify({ url: "https://dou.eu", sessionId: "123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("should successfully import a job and save it to the session store", async () => {
    vi.mocked(isLLMConfigured).mockReturnValue(true);
    
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>This is a very long string that has more than fifty characters so that it passes the validation check.</body></html>"),
    });

    // Mock cheerio
    const mockCheerioAPI = {
      remove: vi.fn(),
      text: vi.fn().mockReturnValue("This is a very long string that has more than fifty characters so that it passes the validation check."),
    };
    vi.mocked(cheerio.load).mockReturnValue(() => mockCheerioAPI as any);
    
    // Mock LLM extraction
    vi.mocked(extractJobDetailsWithLLM).mockResolvedValue({
      title: "Test Engineer",
      company: "Test Co",
      requiredSkills: ["Testing"],
      preferredSkills: [],
      minExperienceYears: 2,
      responsibilities: ["Testing things"]
    });

    const request = new Request("http://localhost:3000/api/jobs/import", {
      method: "POST",
      body: JSON.stringify({ url: "https://dou.eu", sessionId: "test-session" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.jobId).toBeDefined();
    expect(data.jobDescription.title).toBe("Test Engineer");

    // Verify session store got updated
    const session = sessionStore.get("test-session");
    expect(session).toBeDefined();
    expect(session!.jobs.has(data.jobId)).toBe(true);

    // Verify RAG ingestion was called
    expect(ingestDocument).toHaveBeenCalledWith("This is a very long string that has more than fifty characters so that it passes the validation check.", "job", data.jobId, session!.vectorStore);
  });
});
