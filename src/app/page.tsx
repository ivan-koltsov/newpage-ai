"use client";

import { useState, useEffect, useCallback } from "react";
import type { ResumeData, JobDescription, AnalysisResult } from "@/lib/schema";
import { FileUpload } from "@/components/FileUpload";
import { JobCard } from "@/components/JobCard";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { ChatPanel } from "@/components/ChatPanel";

// ─── Add Job Form (inline) ──────────────────────────────────────────────────

function AddJobForm({
  onAdd,
  onImport,
}: {
  onAdd: (data: {
    title: string;
    company: string;
    requiredSkills: string;
    preferredSkills: string;
    minExperienceYears: string;
    rawText: string;
    responsibilities: string;
  }) => void;
  onImport: (url: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [minYears, setMinYears] = useState("");
  const [rawText, setRawText] = useState("");
  const [responsibilities, setResponsibilities] = useState("");

  if (!open) {
    return (
      <button className="add-job-btn" onClick={() => setOpen(true)}>
        <span>+</span> Add Job Posting
      </button>
    );
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      await onImport(importUrl);
      setOpen(false);
      setImportUrl("");
    } catch (err) {
      alert(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || !company.trim()) return;
    onAdd({
      title,
      company,
      requiredSkills,
      preferredSkills,
      minExperienceYears: minYears,
      rawText,
      responsibilities,
    });
    setTitle("");
    setCompany("");
    setRequiredSkills("");
    setPreferredSkills("");
    setMinYears("");
    setRawText("");
    setResponsibilities("");
    setOpen(false);
  };

  return (
    <div className="add-job-form">
      <div className="form-group" style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }}>
        <label className="form-label" style={{ color: '#a0a0a0', marginBottom: '8px' }}>
          ✨ Auto-import from URL (e.g. dou.eu)
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://..."
            style={{ flex: 1 }}
          />
          <button 
            className="import-btn"
            style={{ 
              padding: '0 12px', 
              background: 'rgba(255,255,255,0.1)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px',
              cursor: importing || !importUrl ? 'not-allowed' : 'pointer',
              opacity: importing || !importUrl ? 0.5 : 1
            }}
            disabled={importing || !importUrl} 
            onClick={handleImport}
          >
            {importing ? "..." : "Import"}
          </button>
        </div>
      </div>
      
      <div style={{ color: '#666', fontSize: '12px', textAlign: 'center', marginBottom: '1rem' }}>— OR MANUALLY ADD —</div>

      <div className="form-group">
        <label className="form-label">Job Title *</label>
        <input
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Senior Full-Stack Engineer"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Company *</label>
        <input
          className="form-input"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="TechCo Inc."
        />
      </div>
      <div className="form-group">
        <label className="form-label">Required Skills</label>
        <input
          className="form-input"
          value={requiredSkills}
          onChange={(e) => setRequiredSkills(e.target.value)}
          placeholder="TypeScript, React, Node.js"
        />
        <span className="form-hint">Comma-separated</span>
      </div>
      <div className="form-group">
        <label className="form-label">Preferred Skills</label>
        <input
          className="form-input"
          value={preferredSkills}
          onChange={(e) => setPreferredSkills(e.target.value)}
          placeholder="GraphQL, Kubernetes, Python"
        />
        <span className="form-hint">Comma-separated</span>
      </div>
      <div className="form-group">
        <label className="form-label">Min. Years of Experience</label>
        <input
          className="form-input"
          type="number"
          min="0"
          value={minYears}
          onChange={(e) => setMinYears(e.target.value)}
          placeholder="5"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Responsibilities</label>
        <textarea
          className="form-textarea"
          value={responsibilities}
          onChange={(e) => setResponsibilities(e.target.value)}
          placeholder="One per line:&#10;Design and build microservices&#10;Mentor junior engineers"
          rows={3}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Full Job Description</label>
        <textarea
          className="form-textarea"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the full job posting text here for keyword analysis..."
          rows={4}
        />
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!title.trim() || !company.trim()}
          onClick={handleSubmit}
        >
          Add Job
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("");
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [jobs, setJobs] = useState<JobDescription[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<
    Record<string, AnalysisResult>
  >({});
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [llmConfigured, setLLMConfigured] = useState(true);
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Initialize session
  useEffect(() => {
    const stored = localStorage.getItem("newpage-session-id");
    if (stored) {
      setSessionId(stored);
    } else {
      const id = crypto.randomUUID();
      localStorage.setItem("newpage-session-id", id);
      setSessionId(id);
    }
  }, []);

  // ─── Upload Handler ──────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (sessionId) formData.append("sessionId", sessionId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem("newpage-session-id", data.sessionId);
      }

      setResumeData(data.resumeData);
      setLLMConfigured(data.llmConfigured ?? true);
    },
    [sessionId]
  );

  // ─── Add Job Handler ────────────────────────────────────────────────

  const handleAddJob = useCallback(
    async (jobData: {
      title: string;
      company: string;
      requiredSkills: string;
      preferredSkills: string;
      minExperienceYears: string;
      rawText: string;
      responsibilities: string;
    }) => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...jobData }),
      });

      if (!res.ok) throw new Error("Failed to add job");

      const data = await res.json();
      setJobs((prev) => [...prev, data.jobDescription]);

      // Auto-select the first job
      if (jobs.length === 0) {
        setSelectedJobId(data.jobDescription.id);
      }
    },
    [sessionId, jobs.length]
  );

  // ─── Import Job Handler ─────────────────────────────────────────────

  const handleImportJob = useCallback(
    async (url: string) => {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, url }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import job");
      }

      const data = await res.json();
      setJobs((prev) => [...prev, data.jobDescription]);

      if (jobs.length === 0) {
        setSelectedJobId(data.jobDescription.id);
      }
    },
    [sessionId, jobs.length]
  );

  // ─── Delete Job Handler ─────────────────────────────────────────────

  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      await fetch(`/api/jobs?sessionId=${sessionId}&id=${jobId}`, {
        method: "DELETE",
      });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setAnalysisResults((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
      }
    },
    [sessionId, selectedJobId]
  );

  // ─── Analyze Handler ────────────────────────────────────────────────

  const handleAnalyze = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId);

      // Use cached result if available
      if (analysisResults[jobId]) return;

      setLoadingAnalysis(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, jobId }),
        });

        if (!res.ok) throw new Error("Analysis failed");

        const result = await res.json();
        setAnalysisResults((prev) => ({ ...prev, [jobId]: result }));
      } finally {
        setLoadingAnalysis(false);
      }
    },
    [sessionId, analysisResults]
  );

  // Auto-analyze when a job is selected
  useEffect(() => {
    if (selectedJobId && resumeData && !analysisResults[selectedJobId]) {
      handleAnalyze(selectedJobId);
    }
  }, [selectedJobId, resumeData, analysisResults, handleAnalyze]);

  // ─── Chat Handler ───────────────────────────────────────────────────

  const handleChat = useCallback(
    async (question: string) => {
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: question,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setChatLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, question }),
        });

        if (!res.ok) {
          const err = await res.json();
          setChatMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${err.error || "Something went wrong."}`,
            },
          ]);
          return;
        }

        // Stream the response
        const reader = res.body?.getReader();
        if (!reader) return;

        const assistantId = crypto.randomUUID();
        setChatMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const current = accumulated;
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: current } : m
            )
          );
        }
      } finally {
        setChatLoading(false);
      }
    },
    [sessionId]
  );

  // ─── Render ─────────────────────────────────────────────────────────

  const selectedResult = selectedJobId
    ? analysisResults[selectedJobId]
    : null;

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">⚡</div>
          <h1>newpage.ai</h1>
        </div>
        <span className="app-header-badge">Career Intelligence Assistant</span>
      </header>

      {/* Three-panel layout */}
      <div className="app-layout">
        {/* ── Left Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Resume</div>
            <FileUpload onUpload={handleUpload} resumeData={resumeData} />
          </div>

          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="sidebar-section-title">
              Job Postings ({jobs.length})
            </div>
            <div className="job-list">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={job.id === selectedJobId}
                  score={analysisResults[job.id]?.overallScore}
                  onClick={() => handleAnalyze(job.id)}
                  onDelete={() => handleDeleteJob(job.id)}
                />
              ))}
              <AddJobForm onAdd={handleAddJob} onImport={handleImportJob} />
            </div>
          </div>
        </aside>

        {/* ── Center Dashboard ── */}
        <main className="dashboard">
          {loadingAnalysis ? (
            <div className="dashboard-empty">
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <p>Analyzing alignment...</p>
            </div>
          ) : selectedResult ? (
            <AnalysisDashboard result={selectedResult} />
          ) : (
            <div className="dashboard-empty">
              <div className="dashboard-empty-icon">📊</div>
              <h2>No analysis yet</h2>
              <p>
                {!resumeData
                  ? "Upload your resume to get started, then add job postings to compare."
                  : jobs.length === 0
                    ? "Add a job posting to see how your resume aligns."
                    : "Select a job posting to see detailed analysis."}
              </p>
            </div>
          )}
        </main>

        {/* ── Right Chat Panel ── */}
        <ChatPanel
          messages={chatMessages}
          onSend={handleChat}
          loading={chatLoading}
          disabled={!llmConfigured}
          hasResume={!!resumeData}
          jobs={jobs}
        />
      </div>
    </>
  );
}
