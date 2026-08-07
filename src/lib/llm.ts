import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

// ─── Client Initialization ──────────────────────────────────────────────────

let _openaiClient: OpenAI | null = null;
let _geminiClient: GoogleGenerativeAI | null = null;

function getPrimaryProvider(): "gemini" | "openai" {
  if (process.env.LLM_PROVIDER === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.LLM_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  throw new Error("No LLM API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

function getFallbackProvider(primary: "gemini" | "openai"): "gemini" | "openai" | null {
  if (primary === "openai" && process.env.GEMINI_API_KEY) return "gemini";
  if (primary === "gemini" && process.env.OPENAI_API_KEY) return "openai";
  return null;
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

function getLLMModels(provider: "gemini" | "openai"): string[] {
  if (provider === "gemini") {
    let baseModel = process.env.GEMINI_LLM_MODEL || process.env.LLM_MODEL;
    if (!baseModel || !baseModel.includes("gemini")) baseModel = "gemini-flash-latest";
    const cascade = [baseModel];
    if (baseModel !== "gemini-3.1-pro-preview") cascade.push("gemini-3.1-pro-preview");
    if (baseModel !== "gemini-2.5-flash") cascade.push("gemini-2.5-flash");
    return cascade;
  }
  return [process.env.OPENAI_LLM_MODEL || (process.env.LLM_MODEL?.includes("gpt") ? process.env.LLM_MODEL : "gpt-4o-mini")];
}

function getEmbeddingModels(provider: "gemini" | "openai"): string[] {
  if (provider === "gemini") {
    let baseModel = process.env.GEMINI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL;
    if (!baseModel || (!baseModel.includes("gemini-embedding") && baseModel !== "text-embedding-004")) baseModel = "gemini-embedding-2";
    if (baseModel === "text-embedding-004") baseModel = "gemini-embedding-2";
    const cascade = [baseModel];
    if (baseModel !== "gemini-embedding-001") cascade.push("gemini-embedding-001");
    return cascade;
  }
  return [process.env.OPENAI_EMBEDDING_MODEL || (process.env.EMBEDDING_MODEL?.includes("text-embedding-3") ? process.env.EMBEDDING_MODEL : "text-embedding-3-small")];
}

async function executeWithCascade<T>(
  provider: "gemini" | "openai",
  getModels: (p: "gemini" | "openai") => string[],
  fn: (provider: "gemini" | "openai", model: string) => Promise<T>
): Promise<T> {
  const models = getModels(provider);
  let lastErr: any;
  for (const model of models) {
    try {
      return await fn(provider, model);
    } catch (err: any) {
      lastErr = err;
      const isRetryable = err.status === 503 || err.status === 429 || err.message?.includes("503") || err.message?.includes("429");
      if (!isRetryable || models.indexOf(model) === models.length - 1) {
        throw err;
      }
      logger.warn("llm", `Provider ${provider} model ${model} failed with retryable error, cascading...`, { error: err.message });
    }
  }
  throw lastErr;
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

async function _getEmbedding(text: string, provider: "gemini" | "openai", model: string): Promise<number[]> {
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

export async function getEmbedding(text: string): Promise<number[]> {
  const primary = getPrimaryProvider();
  try {
    return await executeWithCascade(primary, getEmbeddingModels, (p, m) => _getEmbedding(text, p, m));
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      try {
        return await executeWithCascade(fallback, getEmbeddingModels, (p, m) => _getEmbedding(text, p, m));
      } catch (fallbackErr) {
        throw new Error(`[${primary} failed: ${err instanceof Error ? err.message : String(err)}] -> [Fallback ${fallback} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}]`);
      }
    }
    throw err;
  }
}

async function _getEmbeddings(texts: string[], provider: "gemini" | "openai", model: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  if (provider === "gemini") {
    // Gemini doesn't have a direct batch endpoint in the simple SDK, so we do it in parallel
    const embeddings = await Promise.all(texts.map(text => _getEmbedding(text, provider, model)));
    return embeddings;
  }

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

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const primary = getPrimaryProvider();
  try {
    return await executeWithCascade(primary, getEmbeddingModels, (p, m) => _getEmbeddings(texts, p, m));
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      try {
        return await executeWithCascade(fallback, getEmbeddingModels, (p, m) => _getEmbeddings(texts, p, m));
      } catch (fallbackErr) {
        throw new Error(`[${primary} failed: ${err instanceof Error ? err.message : String(err)}] -> [Fallback ${fallback} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}]`);
      }
    }
    throw err;
  }
}

// ─── Chat Completions ────────────────────────────────────────────────────────

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function _streamChatCompletion(
  messages: ChatCompletionMessage[],
  provider: "gemini" | "openai",
  model: string
): Promise<ReadableStream<Uint8Array>> {
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

export async function streamChatCompletion(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const primary = getPrimaryProvider();
  try {
    return await executeWithCascade(primary, getLLMModels, (p, m) => _streamChatCompletion(messages, p, m));
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      try {
        return await executeWithCascade(fallback, getLLMModels, (p, m) => _streamChatCompletion(messages, p, m));
      } catch (fallbackErr) {
        throw new Error(`[${primary} failed: ${err instanceof Error ? err.message : String(err)}] -> [Fallback ${fallback} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}]`);
      }
    }
    throw err;
  }
}

async function _chatCompletion(messages: ChatCompletionMessage[], provider: "gemini" | "openai", model: string): Promise<string> {
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

export async function chatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  const primary = getPrimaryProvider();
  try {
    return await executeWithCascade(primary, getLLMModels, (p, m) => _chatCompletion(messages, p, m));
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      try {
        return await executeWithCascade(fallback, getLLMModels, (p, m) => _chatCompletion(messages, p, m));
      } catch (fallbackErr) {
        throw new Error(`[${primary} failed: ${err instanceof Error ? err.message : String(err)}] -> [Fallback ${fallback} failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}]`);
      }
    }
    throw err;
  }
}

export async function extractJobDetailsWithLLM(text: string): Promise<any> {
  const systemPrompt = `You are an expert HR assistant. Extract the following job details from the provided text.
Return ONLY a valid JSON object with the following keys, and nothing else (no markdown wrappers like \`\`\`json):
- title: string
- company: string
- requiredSkills: array of strings
- preferredSkills: array of strings
- minExperienceYears: number (extract the minimum years of experience required, default to 0 if none mentioned)
- responsibilities: array of strings

If you cannot find a piece of information, use an empty string or empty array as appropriate.`;

  const responseText = await chatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Here is the job posting text:\n\n${text}` }
  ]);

  try {
    let cleaned = responseText.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n/, "").replace(/\n```$/, "");
    }
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error("llm", "Failed to parse JSON from LLM extraction", { error: String(err), response: responseText });
    throw new Error("Failed to parse extracted job details");
  }
}
