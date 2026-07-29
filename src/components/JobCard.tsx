"use client";

import type { JobDescription } from "@/lib/schema";

interface JobCardProps {
  job: JobDescription;
  selected: boolean;
  score?: number;
  onClick: () => void;
  onDelete: () => void;
}

function scoreClass(score?: number): string {
  if (score === undefined) return "none";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function JobCard({
  job,
  selected,
  score,
  onClick,
  onDelete,
}: JobCardProps) {
  return (
    <div
      className={`job-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className={`job-card-score ${scoreClass(score)}`}>
        {score !== undefined ? `${Math.round(score * 100)}` : "—"}
      </div>
      <div className="job-card-info">
        <div className="job-card-title">{job.title}</div>
        <div className="job-card-company">{job.company}</div>
      </div>
      <button
        className="job-card-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Remove job"
      >
        ×
      </button>
    </div>
  );
}
