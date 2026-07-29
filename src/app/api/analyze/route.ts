import { NextResponse } from "next/server";
import { computeAlignment, identifyGaps } from "@/lib/analyzer";
import { sessionStore } from "@/lib/store";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { sessionId, jobId } = await request.json();

    if (!sessionId || !jobId) {
      return NextResponse.json(
        { error: "sessionId and jobId are required" },
        { status: 400 }
      );
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!session.resumeData) {
      return NextResponse.json(
        { error: "No resume uploaded yet" },
        { status: 400 }
      );
    }

    const job = session.jobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Run the comparison engine
    const alignment = computeAlignment(session.resumeData, job);
    const gaps = identifyGaps(session.resumeData, job, alignment.matchedSkills);

    const result = {
      hardSkillScore: alignment.hardSkillScore,
      softSkillScore: alignment.softSkillScore,
      experienceScore: alignment.experienceScore,
      overallScore: alignment.overallScore,
      matchedSkills: alignment.matchedSkills,
      gaps,
      resumeData: session.resumeData,
      jobDescription: job,
    };

    // Cache the result in the session
    session.analysisResults.set(jobId, result);

    logger.info("api.analyze", "Analysis completed", {
      sessionId,
      jobId,
      overallScore: result.overallScore,
      hardSkillScore: result.hardSkillScore,
      missingHardSkills: result.gaps.missingHardSkills.length,
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("api.analyze", "Analysis failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
