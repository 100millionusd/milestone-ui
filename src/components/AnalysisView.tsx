import React from "react";
import type { Agent2 } from "@/utils/agent2";

export default function AnalysisView({ analysis }: { analysis: Agent2 }) {
  if (!analysis) return null;
  const a: any = analysis;
  const isV1 = "verdict" in a;
  const isV2 = "fit" in a;

  return (
    <div className="space-y-3">
      {isV1 && (
        <>
          <div className="text-sm opacity-70">Agent2 (V1)</div>
          <div className="text-lg font-semibold">Verdict: {a.verdict}</div>
          <p>{a.reasoning}</p>
          {!!a.suggestions?.length && (
            <>
              <div className="font-medium mt-2">Suggestions</div>
              <ul className="list-disc ml-5">
                {a.suggestions.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {isV2 && (
        <>
          <div className="text-sm opacity-70">Agent2 (V2)</div>
          <div className="text-lg font-semibold">Fit: {a.fit}</div>
          {a.summary && <p>{a.summary}</p>}

          {!!a.risks?.length && (
            <>
              <div className="font-medium mt-2">Risks</div>
              <ul className="list-disc ml-5">
                {a.risks.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {typeof a.confidence === "number" && (
            <div className="text-sm opacity-70">Confidence: {a.confidence}</div>
          )}

          {!!a.milestoneNotes?.length && (
            <>
              <div className="font-medium mt-2">Milestone notes</div>
              <ul className="list-disc ml-5">
                {a.milestoneNotes.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
