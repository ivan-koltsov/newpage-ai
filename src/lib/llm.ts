import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

// ─── Client Initialization ──────────────────────────────────────────────────

let _openaiClient: OpenAI | null = null;
let _geminiClient: GoogleGenerativeAI | null = null;

function getActiveProvider(): "gemini" | "openai" {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("No LLM API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openaiClient;
}

function getGeminiClient(): GoogleGenerativeAI {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return _geminiClient;
}

/** Check whether any LLM API key is configured. */
export function isLLMConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

// ─── Model Configuration ────────────────────────────────────────────────────

function getLLMModel(provider: "gemini" | "openai"): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return provider === "gemini" ? "gemini-1.5-pro" : "gpt-4o-mini";
}

function getEmbeddingModel(provider: "gemini" | "openai"): string {
  if (process.env.EMBEDDING_MODEL) return process.env.EMBEDDING_MODEL;
  return provider === "gemini" ? "text-embedding-004" : "text-embedding-3-small";
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

export async function getEmbedding(text: string): Promise<number[]> {
  const provider = getActiveProvider();
  const model = getEmbeddingModel(provider);
  const start = Date.now();

  let embedding: number[];

  if (provider === "gemini") {
    const ai = getGeminiClient();
    const result = await ai.getGenerativeModel({ model }).embedContent(text);
    embedding = result.embedding.values;
  } else {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({ model, input: text });
    embedding = response.data[0].embedding;
  }

  logger.llmCall({
    model,
    operation: "embedding",
    latencyMs: Date.now() - start,
  });

  return embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  const provider = getActiveProvider();
  
  if (provider === "gemini") {
    // Gemini doesn't have a direct batch endpoint in the simple SDK, so we do it in parallel
    const embeddings = await Promise.all(texts.map(text => getEmbedding(text)));
    return embeddings;
  }

  const model = getEmbeddingModel("openai");
  const start = Date.now();
  const client = getOpenAIClient();

  const response = await client.embeddings.create({ model, input: texts });

  logger.llmCall({
    model,
    operation: `embedding-batch(${texts.length})`,
    latencyMs: Date.now() - start,
    inputTokens: response.usage?.total_tokens,
  });

  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ─── Chat Completions ────────────────────────────────────────────────────────

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function streamChatCompletion(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const provider = getActiveProvider();
  const model = getLLMModel(provider);
  const start = Date.now();
  const encoder = new TextEncoder();

  if (provider === "gemini") {
    const ai = getGeminiClient();
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const geminiModel = ai.getGenerativeModel({
      model,
      systemInstruction: systemInstruction
        ? { role: "system", parts: [{ text: systemInstruction }] }
        : undefined,
    });

    const result = await geminiModel.generateContentStream({
      contents: chatMsgs,
      generationConfig: { temperature: 0.3 },
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
          logger.llmCall({ model, operation: "chat-stream", latencyMs: Date.now() - start });
        } catch (err) {
          logger.error("llm", "Stream error", { error: err instanceof Error ? err.message : String(err) });
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });
  }

  // OpenAI
  const client = getOpenAIClient();
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
          if (text) controller.enqueue(encoder.encode(text));
        }
        logger.llmCall({ model, operation: "chat-stream", latencyMs: Date.now() - start });
      } catch (err) {
        logger.error("llm", "Stream error", { error: err instanceof Error ? err.message : String(err) });
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

export async function chatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  const provider = getActiveProvider();
  const model = getLLMModel(provider);
  const start = Date.now();

  if (provider === "gemini") {
    const ai = getGeminiClient();
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const geminiModel = ai.getGenerativeModel({
      model,
      systemInstruction: systemInstruction
        ? { role: "system", parts: [{ text: systemInstruction }] }
        : undefined,
    });

    const result = await geminiModel.generateContent({
      contents: chatMsgs,
      generationConfig: { temperature: 0.3 },
    });

    logger.llmCall({ model, operation: "chat", latencyMs: Date.now() - start });
    return result.response.text() || "";
  }

  // OpenAI
  const client = getOpenAIClient();
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
