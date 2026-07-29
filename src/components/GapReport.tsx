"use client";

import type { GapReport as GapReportType } from "@/lib/schema";

interface GapReportProps {
  gaps: GapReportType;
}

export function GapReport({ gaps }: GapReportProps) {
  return (
    <div className="gap-grid">
      <div className="gap-card">
        <div className="gap-card-title">Missing Required Skills</div>
        <div className="gap-card-items">
          {gaps.missingHardSkills.length > 0 ? (
            gaps.missingHardSkills.map((skill) => (
              <span key={skill} className="gap-chip hard">
                {skill}
              </span>
            ))
          ) : (
            <span className="gap-card-empty">All covered ✓</span>
          )}
        </div>
      </div>

      <div className="gap-card">
        <div className="gap-card-title">Missing Preferred Skills</div>
        <div className="gap-card-items">
          {gaps.missingSoftSkills.length > 0 ? (
            gaps.missingSoftSkills.map((skill) => (
              <span key={skill} className="gap-chip soft">
                {skill}
              </span>
            ))
          ) : (
            <span className="gap-card-empty">All covered ✓</span>
          )}
        </div>
      </div>

      {gaps.missingKeywords.length > 0 && (
        <div className="gap-card" style={{ gridColumn: "1 / -1" }}>
          <div className="gap-card-title">
            Missing Keywords ({gaps.missingKeywords.length})
          </div>
          <div className="gap-card-items">
            {gaps.missingKeywords.slice(0, 20).map((kw) => (
              <span
                key={kw}
                className="gap-chip"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {kw}
              </span>
            ))}
            {gaps.missingKeywords.length > 20 && (
              <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                +{gaps.missingKeywords.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
