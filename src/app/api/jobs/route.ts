import { NextResponse } from "next/server";
import { ingestDocument } from "@/lib/rag";
import { isLLMConfigured } from "@/lib/llm";
import { sessionStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import type { JobDescription } from "@/lib/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      sessionId,
      title,
      company,
      requiredSkills,
      preferredSkills,
      minExperienceYears,
      responsibilities,
      rawText,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!title || !company) {
      return NextResponse.json(
        { error: "title and company are required" },
        { status: 400 }
      );
    }

    const session = sessionStore.getOrCreate(sessionId);
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const job: JobDescription = {
      id: jobId,
      title: title.trim(),
      company: company.trim(),
      requiredSkills: parseSkillsList(requiredSkills),
      preferredSkills: parseSkillsList(preferredSkills),
      minExperienceYears: Number(minExperienceYears) || 0,
      responsibilities: parseList(responsibilities),
      rawText: rawText?.trim() || undefined,
    };

    session.jobs.set(jobId, job);

    // Ingest JD text into vector store for RAG
    if (isLLMConfigured() && job.rawText) {
      try {
        await ingestDocument(job.rawText, "job", jobId, session.vectorStore);
      } catch (err) {
        logger.error("api.jobs", "Failed to ingest job to vector store (LLM API error)", {
          error: err instanceof Error ? err.message : String(err),
        });
        // Non-fatal error, job is still saved for standard analysis
      }
    }

    logger.info("api.jobs", "Job added", {
      sessionId,
      jobId,
      title: job.title,
      company: job.company,
      requiredSkills: job.requiredSkills.length,
    });

    return NextResponse.json({ jobId, jobDescription: job });
  } catch (err) {
    logger.error("api.jobs", "Add job failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to add job" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = sessionStore.get(sessionId);
  if (!session) {
    return NextResponse.json({ jobs: [] });
  }

  return NextResponse.json({
    jobs: Array.from(session.jobs.values()),
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const jobId = searchParams.get("id");

  if (!sessionId || !jobId) {
    return NextResponse.json(
      { error: "sessionId and id are required" },
      { status: 400 }
    );
  }

  const session = sessionStore.get(sessionId);
  if (session) {
    session.jobs.delete(jobId);
    session.analysisResults.delete(jobId);
    session.vectorStore.removeDocument(jobId);
  }

  return NextResponse.json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse comma-separated or array input into a clean string array. */
function parseSkillsList(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function parseList(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split("\n")
      .map((s) => s.replace(/^[-•*]\s*/, "").trim())
      .filter((s) => s.length > 0);
  }
  return [];
}
