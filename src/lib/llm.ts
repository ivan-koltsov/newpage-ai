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

function getLLMModel(provider: "gemini" | "openai"): string {
  if (provider === "gemini") {
    return process.env.GEMINI_LLM_MODEL || 
      (process.env.LLM_MODEL?.includes("gemini") ? process.env.LLM_MODEL : "gemini-1.5-flash");
  }
  return process.env.OPENAI_LLM_MODEL || 
    (process.env.LLM_MODEL?.includes("gpt") ? process.env.LLM_MODEL : "gpt-4o-mini");
}

function getEmbeddingModel(provider: "gemini" | "openai"): string {
  if (provider === "gemini") {
    return process.env.GEMINI_EMBEDDING_MODEL || 
      (process.env.EMBEDDING_MODEL?.includes("embedding-2") || process.env.EMBEDDING_MODEL?.includes("text-embedding-004") ? process.env.EMBEDDING_MODEL : "text-embedding-004");
  }
  return process.env.OPENAI_EMBEDDING_MODEL || 
    (process.env.EMBEDDING_MODEL?.includes("text-embedding-3") ? process.env.EMBEDDING_MODEL : "text-embedding-3-small");
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

async function _getEmbedding(text: string, provider: "gemini" | "openai"): Promise<number[]> {
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

export async function getEmbedding(text: string): Promise<number[]> {
  const primary = getPrimaryProvider();
  try {
    return await _getEmbedding(text, primary);
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      return await _getEmbedding(text, fallback);
    }
    throw err;
  }
}

async function _getEmbeddings(texts: string[], provider: "gemini" | "openai"): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  if (provider === "gemini") {
    // Gemini doesn't have a direct batch endpoint in the simple SDK, so we do it in parallel
    const embeddings = await Promise.all(texts.map(text => _getEmbedding(text, provider)));
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

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const primary = getPrimaryProvider();
  try {
    return await _getEmbeddings(texts, primary);
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      return await _getEmbeddings(texts, fallback);
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
  provider: "gemini" | "openai"
): Promise<ReadableStream<Uint8Array>> {
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

export async function streamChatCompletion(
  messages: ChatCompletionMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const primary = getPrimaryProvider();
  try {
    return await _streamChatCompletion(messages, primary);
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      return await _streamChatCompletion(messages, fallback);
    }
    throw err;
  }
}

async function _chatCompletion(messages: ChatCompletionMessage[], provider: "gemini" | "openai"): Promise<string> {
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

export async function chatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  const primary = getPrimaryProvider();
  try {
    return await _chatCompletion(messages, primary);
  } catch (err) {
    const fallback = getFallbackProvider(primary);
    if (fallback) {
      logger.error("llm", `Primary provider ${primary} failed, falling back to ${fallback}`, { error: String(err) });
      return await _chatCompletion(messages, fallback);
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
