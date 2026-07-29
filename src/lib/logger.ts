type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structured JSON logger — writes to stdout for Docker-friendly log collection.
 */
function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function log(
  level: LogLevel,
  component: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  emit({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    metadata,
  });
}

/** Convenience helpers */
export const logger = {
  info: (component: string, message: string, meta?: Record<string, unknown>) =>
    log("info", component, message, meta),
  warn: (component: string, message: string, meta?: Record<string, unknown>) =>
    log("warn", component, message, meta),
  error: (component: string, message: string, meta?: Record<string, unknown>) =>
    log("error", component, message, meta),
  debug: (component: string, message: string, meta?: Record<string, unknown>) =>
    log("debug", component, message, meta),

  /** Log an LLM API call with token counts and latency. */
  llmCall: (opts: {
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
    operation: string;
  }) =>
    log("info", "llm", `${opts.operation} completed`, {
      model: opts.model,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      latencyMs: opts.latencyMs,
    }),
};
