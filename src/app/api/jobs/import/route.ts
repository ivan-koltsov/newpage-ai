import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { isLLMConfigured, extractJobDetailsWithLLM } from "@/lib/llm";
import { ingestDocument } from "@/lib/rag";
import { sessionStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import type { JobDescription } from "@/lib/schema";

export async function POST(request: Request) {
  try {
    const { url, sessionId } = await request.json();

    if (!url || !sessionId) {
      return NextResponse.json({ error: "url and sessionId are required" }, { status: 400 });
    }
    
    if (!isLLMConfigured()) {
      return NextResponse.json({ error: "LLM must be configured (OPENAI_API_KEY or GEMINI_API_KEY) to import jobs from URL" }, { status: 400 });
    }

    const session = sessionStore.getOrCreate(sessionId);

    // 1. Fetch URL
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.statusText}`);
    }
    
    const html = await res.text();
    
    // 2. Parse HTML and extract clean text
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, noscript, svg, img').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    
    if (!cleanText || cleanText.length < 50) {
      throw new Error("Could not extract enough text from the page");
    }

    // 3. Use LLM to extract job details
    const extractedDetails = await extractJobDetailsWithLLM(cleanText.substring(0, 15000));
    
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const job: JobDescription = {
      id: jobId,
      title: extractedDetails.title || "Unknown Title",
      company: extractedDetails.company || "Unknown Company",
      requiredSkills: Array.isArray(extractedDetails.requiredSkills) ? extractedDetails.requiredSkills : [],
      preferredSkills: Array.isArray(extractedDetails.preferredSkills) ? extractedDetails.preferredSkills : [],
      minExperienceYears: Number(extractedDetails.minExperienceYears) || 0,
      responsibilities: Array.isArray(extractedDetails.responsibilities) ? extractedDetails.responsibilities : [],
      rawText: cleanText,
    };

    // 4. Save to session
    session.jobs.set(jobId, job);

    // 5. Ingest to vector store
    try {
      await ingestDocument(cleanText, "job", jobId, session.vectorStore);
    } catch (err) {
      logger.error("api.jobs.import", "Failed to ingest imported job to vector store", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info("api.jobs.import", "Job imported successfully", {
      sessionId,
      jobId,
      url,
      title: job.title,
    });

    return NextResponse.json({ jobId, jobDescription: job });
  } catch (err) {
    logger.error("api.jobs.import", "Failed to import job from URL", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to import job: " + (err instanceof Error ? err.message : "Unknown error") }, { status: 500 });
  }
}
