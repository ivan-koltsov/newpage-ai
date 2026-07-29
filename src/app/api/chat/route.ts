import { NextResponse } from "next/server";
import { queryRAG } from "@/lib/rag";
import { isLLMConfigured } from "@/lib/llm";
import { sessionStore } from "@/lib/store";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    if (!isLLMConfigured()) {
      return NextResponse.json(
        {
          error:
            "OpenAI API key is not configured. Set OPENAI_API_KEY in your .env.local file to enable chat features.",
        },
        { status: 503 }
      );
    }

    const { sessionId, question } = await request.json();

    if (!sessionId || !question) {
      return NextResponse.json(
        { error: "sessionId and question are required" },
        { status: 400 }
      );
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found. Please upload a resume first." },
        { status: 404 }
      );
    }

    // Guard: require at least a resume
    if (!session.resumeData) {
      return NextResponse.json(
        { error: "Please upload a resume before asking questions." },
        { status: 400 }
      );
    }

    // Store the user message
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: question,
      timestamp: Date.now(),
    };
    session.chatHistory.push(userMessage);

    logger.info("api.chat", "Chat query", {
      sessionId,
      questionLength: question.length,
      jobCount: session.jobs.size,
      historyLength: session.chatHistory.length,
    });

    // Run RAG pipeline
    const stream = await queryRAG(question, session.vectorStore, {
      resumeData: session.resumeData,
      jobs: Array.from(session.jobs.values()),
      analysisResults: Array.from(session.analysisResults.values()),
      chatHistory: session.chatHistory.slice(0, -1), // exclude the current question
    });

    // Tee the stream: one for the response, one to collect the full answer
    const [responseStream, collectStream] = stream.tee();

    // Collect the assistant's response in the background to store in chat history
    collectResponse(collectStream, session);

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    logger.error("api.chat", "Chat failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Chat request failed. Please try again." },
      { status: 500 }
    );
  }
}

/** Consume the tee'd stream to save the assistant response in chat history. */
async function collectResponse(
  stream: ReadableStream<Uint8Array>,
  session: { chatHistory: Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: number }> }
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullResponse = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      fullResponse += decoder.decode(value, { stream: true });
    }
  } catch {
    // Stream errors are handled in the response stream
  }

  if (fullResponse) {
    session.chatHistory.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: fullResponse,
      timestamp: Date.now(),
    });
  }
}
