"use client";

import type { AnalysisResult } from "@/lib/schema";
import { GapReport } from "./GapReport";

interface AnalysisDashboardProps {
  result: AnalysisResult;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "var(--success)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--error)";
}

function scoreTier(score: number): "high" | "medium" | "low" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function AnalysisDashboard({ result }: AnalysisDashboardProps) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div>
      {/* ── Score Header ── */}
      <div className="score-header card">
        <div className="score-gauge">
          <svg viewBox="0 0 120 120" className="score-gauge-ring">
            {/* Background ring */}
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="10"
            />
            {/* Score arc */}
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={scoreColor(result.overallScore)}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${result.overallScore * 326.7} 326.7`}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          </svg>
          <div className="score-gauge-inner">
            <div
              className="score-gauge-value"
              style={{ color: scoreColor(result.overallScore) }}
            >
              {Math.round(result.overallScore * 100)}
            </div>
            <div className="score-gauge-label">Overall</div>
          </div>
        </div>

        <div className="score-details">
          <h2>
            {result.jobDescription.title} — {result.jobDescription.company}
          </h2>
          <div className="score-details-sub">
            {result.resumeData.name} ·{" "}
            {result.resumeData.totalYearsExperience ?? "?"} years experience
          </div>

          <div className="score-bars">
            <div className="score-bar">
              <span className="score-bar-label">Hard Skills</span>
              <div className="score-bar-track">
                <div
                  className={`score-bar-fill ${scoreTier(result.hardSkillScore)}`}
                  style={{ width: pct(result.hardSkillScore) }}
                />
              </div>
              <span className="score-bar-value">{pct(result.hardSkillScore)}</span>
            </div>
            <div className="score-bar">
              <span className="score-bar-label">Soft Skills</span>
              <div className="score-bar-track">
                <div
                  className={`score-bar-fill ${scoreTier(result.softSkillScore)}`}
                  style={{ width: pct(result.softSkillScore) }}
                />
              </div>
              <span className="score-bar-value">{pct(result.softSkillScore)}</span>
            </div>
            <div className="score-bar">
              <span className="score-bar-label">Experience</span>
              <div className="score-bar-track">
                <div
                  className={`score-bar-fill ${scoreTier(result.experienceScore)}`}
                  style={{ width: pct(result.experienceScore) }}
                />
              </div>
              <span className="score-bar-value">{pct(result.experienceScore)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Skill Breakdown Table ── */}
      <div className="card mt-lg">
        <div className="section-title">🎯 Skill Breakdown</div>
        <table className="skill-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Type</th>
              <th>Status</th>
              <th>Similarity</th>
              <th>Resume Match</th>
            </tr>
          </thead>
          <tbody>
            {result.matchedSkills.map((skill) => {
              const isRequired = result.jobDescription.requiredSkills
                .map((s) => s.toLowerCase())
                .includes(skill.skill.toLowerCase());
              return (
                <tr key={skill.skill}>
                  <td style={{ fontWeight: 500 }}>{skill.skill}</td>
                  <td>
                    <span
                      className={`skill-badge ${isRequired ? "required" : "preferred"}`}
                    >
                      {isRequired ? "Required" : "Preferred"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`skill-status ${skill.matched ? "matched" : "missing"}`}
                    >
                      {skill.matched ? "✓ Matched" : "✗ Missing"}
                    </span>
                  </td>
                  <td className="text-muted">
                    {(skill.similarity * 100).toFixed(0)}%
                  </td>
                  <td className="text-muted">
                    {skill.bestResumeMatch || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Gap Report ── */}
      <div className="card mt-lg">
        <div className="section-title">⚠️ Gap Analysis</div>
        <GapReport gaps={result.gaps} />
      </div>
    </div>
  );
}
