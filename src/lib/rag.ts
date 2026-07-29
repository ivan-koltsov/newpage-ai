import { chunkText } from "./chunker";
import { getEmbedding, getEmbeddings, streamChatCompletion } from "./llm";
import type { ChatCompletionMessage } from "./llm";
import { VectorStore } from "./vectorStore";
import type {
  ResumeData,
  JobDescription,
  AnalysisResult,
  ChatMessage,
} from "./schema";
import { logger } from "./logger";

// ─── Document Ingestion ──────────────────────────────────────────────────────

/**
 * Ingest a document into the vector store:
 * 1. Chunk the text.
 * 2. Embed each chunk.
 * 3. Store chunk + embedding pairs.
 */
export async function ingestDocument(
  text: string,
  source: "resume" | "job",
  documentId: string,
  vectorStore: VectorStore
): Promise<void> {
  const start = Date.now();

  // Remove any existing chunks for this document (re-upload case)
  vectorStore.removeDocument(documentId);

  const chunks = chunkText(text, source, documentId);

  if (chunks.length === 0) {
    logger.warn("rag", "No chunks produced from document", { documentId, source });
    return;
  }

  // Batch embed all chunks
  const embeddings = await getEmbeddings(chunks.map((c) => c.text));
  vectorStore.addBatch(chunks, embeddings);

  logger.info("rag", "Document ingested", {
    documentId,
    source,
    chunks: chunks.length,
    vectorStoreSize: vectorStore.size,
    latencyMs: Date.now() - start,
  });
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(context: {
  resumeData?: ResumeData | null;
  jobs?: JobDescription[];
  analysisResults?: AnalysisResult[];
  retrievedContext?: string;
}): string {
  const parts: string[] = [];

  parts.push(`You are a Career Intelligence Assistant. You help candidates understand their fit for job roles, identify skill gaps, and prepare for interviews.

## Rules
- Ground every answer in the specific data from the resume and job descriptions provided below.
- When citing skills or experience, reference the exact wording from the documents.
- If you don't have enough information, say so clearly. Never fabricate details.
- Be constructive and actionable — don't just list gaps, suggest how to address them.
- Keep responses concise but thorough.
- When comparing across multiple jobs, use a structured format.`);

  if (context.resumeData) {
    const r = context.resumeData;
    parts.push(`\n## Candidate Profile
- **Name**: ${r.name}
- **Summary**: ${r.summary || "Not provided"}
- **Skills**: ${r.skills.join(", ") || "None listed"}
- **Years of Experience**: ${r.totalYearsExperience ?? "Unknown"}
- **Experience**: ${r.experience.map((e) => `${e.role} at ${e.company}`).join("; ") || "None listed"}
- **Education**: ${r.education.join("; ") || "None listed"}`);
  }

  if (context.jobs && context.jobs.length > 0) {
    parts.push("\n## Job Descriptions");
    context.jobs.forEach((job, idx) => {
      const analysis = context.analysisResults?.find(
        (a) => a.jobDescription.id === job.id
      );
      parts.push(`\n### Job #${idx + 1}: ${job.title} at ${job.company}
- **Required Skills**: ${job.requiredSkills.join(", ")}
- **Preferred Skills**: ${job.preferredSkills.join(", ")}
- **Min Experience**: ${job.minExperienceYears} years
- **Responsibilities**: ${job.responsibilities.join("; ")}`);

      if (analysis) {
        parts.push(`- **Match Scores**: Overall ${(analysis.overallScore * 100).toFixed(0)}%, Hard Skills ${(analysis.hardSkillScore * 100).toFixed(0)}%, Soft Skills ${(analysis.softSkillScore * 100).toFixed(0)}%, Experience ${(analysis.experienceScore * 100).toFixed(0)}%
- **Missing Hard Skills**: ${analysis.gaps.missingHardSkills.join(", ") || "None"}
- **Missing Soft Skills**: ${analysis.gaps.missingSoftSkills.join(", ") || "None"}`);
      }
    });
  }

  if (context.retrievedContext) {
    parts.push(`\n## Relevant Document Passages
${context.retrievedContext}`);
  }

  return parts.join("\n");
}

// ─── RAG Query Pipeline ─────────────────────────────────────────────────────

/**
 * Run the full RAG query pipeline:
 * 1. Embed the user's question.
 * 2. Retrieve the top-K most relevant document chunks.
 * 3. Build a prompt with structured data + retrieved context.
 * 4. Stream an LLM response.
 */
export async function queryRAG(
  question: string,
  vectorStore: VectorStore,
  context: {
    resumeData?: ResumeData | null;
    jobs?: JobDescription[];
    analysisResults?: AnalysisResult[];
    chatHistory?: ChatMessage[];
  }
): Promise<ReadableStream<Uint8Array>> {
  const start = Date.now();

  // Step 1 — Embed the question and retrieve relevant chunks
  let retrievedContext = "";
  if (vectorStore.size > 0) {
    const queryEmbedding = await getEmbedding(question);
    const results = vectorStore.search(queryEmbedding, 5);

    // Filter results with a minimum relevance threshold
    const relevant = results.filter((r) => r.score > 0.3);

    if (relevant.length > 0) {
      retrievedContext = relevant
        .map(
          (r) =>
            `[${r.chunk.source.toUpperCase()} — ${r.chunk.documentId}, chunk ${r.chunk.chunkIndex}] (relevance: ${(r.score * 100).toFixed(0)}%)\n${r.chunk.text}`
        )
        .join("\n\n");
    }
  }

  // Step 2 — Build messages
  const systemPrompt = buildSystemPrompt({
    ...context,
    retrievedContext: retrievedContext || undefined,
  });

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Include recent chat history for conversational context (last 6 messages)
  if (context.chatHistory && context.chatHistory.length > 0) {
    const recent = context.chatHistory.slice(-6);
    for (const msg of recent) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: question });

  logger.info("rag", "Query pipeline", {
    questionLength: question.length,
    retrievedChunks: retrievedContext ? retrievedContext.split("\n\n").length : 0,
    chatHistoryLength: context.chatHistory?.length ?? 0,
    latencyMs: Date.now() - start,
  });

  // Step 3 — Stream the LLM response
  return streamChatCompletion(messages);
}
