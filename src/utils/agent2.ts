// Normalization + readiness helpers for Agent2 analysis objects

export type Agent2V1 = {
  verdict: string;
  reasoning: string;
  suggestions?: string[];
  status?: string; // optional if backend ever adds it
};

export type Agent2V2 = {
  fit: "low" | "medium" | "high";
  summary?: string;
  risks?: string[];
  confidence?: number;
  milestoneNotes?: string[];
  status?: string; // optional if backend ever adds it
};

export type Agent2 = Agent2V1 | Agent2V2 | null | undefined;

export const getAnalysis = (bid: any): Agent2 =>
  bid?.aiAnalysis ?? bid?.ai_analysis ?? null;

// If there's an analysis object but no status, treat it as READY.
// If there is a status, only "pending" means not ready.
export const isAnalysisReady = (a: Agent2) =>
  !!a && (!("status" in (a as any)) || (a as any).status !== "pending");

// Optional helper to read a status string for UI copy
export const getAnalysisStatus = (a: Agent2): "ready" | "pending" | "waiting_for_file" | "error" => {
  if (!a) return "pending";
  const s = (a as any).status;
  if (!s) return "ready";
  if (s === "pending") return "pending";
  if (s === "waiting_for_file") return "waiting_for_file";
  if (s === "error") return "error";
  return "ready";
};
