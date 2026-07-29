import type {
  ResumeData,
  JobDescription,
  AnalysisResult,
  ChatMessage,
} from "./schema";
import { VectorStore } from "./vectorStore";

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  resumeData: ResumeData | null;
  resumeText: string | null;
  jobs: Map<string, JobDescription>;
  analysisResults: Map<string, AnalysisResult>;
  chatHistory: ChatMessage[];
  vectorStore: VectorStore;
  createdAt: number;
  lastAccessedAt: number;
}

// ─── Session Store ───────────────────────────────────────────────────────────

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

class SessionStore {
  private sessions = new Map<string, Session>();

  constructor() {
    // Periodic cleanup of expired sessions
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    }
  }

  /** Get an existing session or create a new one. */
  getOrCreate(id: string): Session {
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        id,
        resumeData: null,
        resumeText: null,
        jobs: new Map(),
        analysisResults: new Map(),
        chatHistory: [],
        vectorStore: new VectorStore(),
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };
      this.sessions.set(id, session);
    }
    session.lastAccessedAt = Date.now();
    return session;
  }

  /** Get a session without creating one. */
  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastAccessedAt = Date.now();
    }
    return session;
  }

  /** Remove expired sessions. */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

/** Singleton session store — shared across all API routes in the same process. */
const globalForStore = globalThis as unknown as {
  sessionStore: SessionStore | undefined;
};

export const sessionStore = globalForStore.sessionStore ?? new SessionStore();

if (process.env.NODE_ENV !== "production") {
  globalForStore.sessionStore = sessionStore;
}
