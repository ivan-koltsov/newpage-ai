import OpenAI from "openai";
import { logger } from "./logger";

// ─── Client Initialization ──────────────────────────────────────────────────

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your .env.local file."
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

/** Check whether the OpenAI API key is configured. */
export function isLLMConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ─── Model Configuration ────────────────────────────────────────────────────

function getLLMModel(): string {
  return process.env.LLM_MODEL ?? "gpt-4o-mini";
}

function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a single text string.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const model = getEmbeddingModel();
  const start = Date.now();

  const response = await client.embeddings.create({
    model,
    input: text,
  });

  logger.llmCall({
    model,
    operation: "embedding",
    latencyMs: Date.now() - start,
    inputTokens: response.usage?.total_tokens,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const model = getEmbeddingModel();
  const start = Date.now();

  const response = await client.embeddings.create({
    model,
    input: texts,
  });

  logger.llmCall({
    model,
    operation: `embedding-batch(${texts.length})`,
    latencyMs: Date.now() - start,
    inputTokens: response.usage?.total_tokens,
  });

  // OpenAI returns embeddings in the same order as input
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// ─── Chat Completions ────────────────────────────────────────────────────────

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Stream a chat completion response. Returns a ReadableStream of text chunks.
 */
export async function streamChatCompletion(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient();
  const model = getLLMModel();
  const start = Date.now();
  const encoder = new TextEncoder();

  const openaiStream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.3,
    max_tokens: 1500,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        logger.llmCall({
          model,
          operation: "chat-stream",
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        logger.error("llm", "Stream error", {
          error: err instanceof Error ? err.message : String(err),
        });
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Non-streaming chat completion — returns the full response text.
 */
export async function chatCompletion(
  messages: ChatCompletionMessage[]
): Promise<string> {
  const client = getClient();
  const model = getLLMModel();
  const start = Date.now();

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    max_tokens: 1500,
  });

  logger.llmCall({
    model,
    operation: "chat",
    latencyMs: Date.now() - start,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  });

  return response.choices[0]?.message?.content ?? "";
}
