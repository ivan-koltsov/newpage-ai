"use client";

import { useState, useRef, useEffect } from "react";
import type { JobDescription } from "@/lib/schema";

interface ChatPanelProps {
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
  onSend: (question: string) => Promise<void>;
  loading: boolean;
  disabled: boolean;
  hasResume: boolean;
  jobs: JobDescription[];
}

const SUGGESTIONS = [
  "What skills am I missing for this role?",
  "How does my experience align with the job requirements?",
  "Compare my fit across all jobs",
  "What interview questions should I prepare for?",
  "How can I improve my resume for this position?",
];

export function ChatPanel({
  messages,
  onSend,
  loading,
  disabled,
  hasResume,
  jobs,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    onSend(text);
  };

  return (
    <aside className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className={`chat-header-dot ${disabled ? "offline" : ""}`} />
        <h3>Career Assistant</h3>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <>
            {/* Welcome + suggestions */}
            <div
              className="chat-message assistant"
              style={{ maxWidth: "100%" }}
            >
              <div className="chat-message-avatar">🤖</div>
              <div className="chat-message-content">
                {disabled ? (
                  <>
                    Chat is unavailable — set your{" "}
                    <code>OPENAI_API_KEY</code> or <code>GEMINI_API_KEY</code> in <code>.env.local</code> to
                    enable AI-powered Q&A.
                    <br />
                    <br />
                    Structured analysis (scores, gaps) still works without it!
                  </>
                ) : !hasResume ? (
                  "Upload your resume to get started. I can help you analyze your fit for different roles."
                ) : jobs.length === 0 ? (
                  "Resume loaded! Now add some job postings and I can help you compare your fit, identify skill gaps, and prepare for interviews."
                ) : (
                  "Ready to help! Ask me about your fit, skill gaps, or interview preparation. Here are some ideas:"
                )}
              </div>
            </div>
            {!disabled && hasResume && jobs.length > 0 && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="chat-suggestion-btn"
                    onClick={() => handleSuggestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="chat-message-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="chat-message-content">
                {msg.content || (
                  <span className="text-muted loading-dots">Thinking</span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!disabled && (
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasResume
                  ? "Ask about your fit, gaps, or interview prep..."
                  : "Upload a resume first..."
              }
              disabled={loading || !hasResume}
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={loading || !input.trim() || !hasResume}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
