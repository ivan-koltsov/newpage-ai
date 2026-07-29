"use client";

import { useState, useCallback } from "react";
import type { ResumeData } from "@/lib/schema";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  resumeData: ResumeData | null;
}

export function FileUpload({ onUpload, resumeData }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Only PDF files are supported.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("File must be under 10 MB.");
        return;
      }

      setError(null);
      setUploading(true);
      try {
        await onUpload(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Show success state after upload
  if (resumeData && !uploading) {
    return (
      <div>
        <div className="upload-success">
          <div className="upload-success-icon">✅</div>
          <div className="upload-success-info">
            <div className="upload-success-name">{resumeData.name}</div>
            <div className="upload-success-meta">
              {resumeData.skills.length} skills ·{" "}
              {resumeData.totalYearsExperience ?? "?"} yrs experience
            </div>
          </div>
        </div>
        {/* Allow re-upload */}
        <div
          className="upload-zone mt-md"
          style={{ padding: "12px", borderStyle: "dashed" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="upload-zone-text">
            <strong>Replace resume</strong>
          </div>
          <input type="file" accept=".pdf" onChange={handleChange} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <>
            <div className="spinner" style={{ margin: "0 auto 8px" }} />
            <div className="upload-zone-text">Parsing resume...</div>
          </>
        ) : (
          <>
            <div className="upload-zone-icon">📄</div>
            <div className="upload-zone-text">
              <strong>Drop your resume</strong> or click to browse
              <br />
              <span style={{ fontSize: "0.7rem" }}>PDF, max 10 MB</span>
            </div>
          </>
        )}
        <input
          type="file"
          accept=".pdf"
          onChange={handleChange}
          disabled={uploading}
        />
      </div>
      {error && (
        <p className="text-error mt-md" style={{ fontSize: "0.8rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
