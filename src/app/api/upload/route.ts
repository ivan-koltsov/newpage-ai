import { NextResponse } from "next/server";
import { parsePdf, extractResumeData } from "@/lib/analyzer";
import { ingestDocument } from "@/lib/rag";
import { isLLMConfigured } from "@/lib/llm";
import { sessionStore } from "@/lib/store";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    let sessionId = formData.get("sessionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 10MB" },
        { status: 400 }
      );
    }

    // Create or retrieve session
    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }
    const session = sessionStore.getOrCreate(sessionId);

    // Parse PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resumeText = await parsePdf(buffer);
    const resumeData = extractResumeData(resumeText);

    // Store in session
    session.resumeData = resumeData;
    session.resumeText = resumeText;

    // Ingest into vector store for RAG (if LLM is configured)
    let llmActive = isLLMConfigured();
    if (llmActive) {
      try {
        await ingestDocument(resumeText, "resume", "resume", session.vectorStore);
      } catch (err) {
        logger.error("api.upload", "Failed to ingest resume to vector store (LLM API error)", {
          error: err instanceof Error ? err.message : String(err),
        });
        llmActive = false; // Disable LLM features if embedding fails (e.g. quota exceeded)
      }
    }

    logger.info("api.upload", "Resume uploaded and parsed", {
      sessionId,
      name: resumeData.name,
      skillCount: resumeData.skills.length,
      experienceYears: resumeData.totalYearsExperience,
    });

    return NextResponse.json({
      sessionId,
      resumeData,
      llmConfigured: llmActive,
    });
  } catch (err) {
    logger.error("api.upload", "Upload failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to process resume. Ensure it is a valid PDF." },
      { status: 500 }
    );
  }
}
