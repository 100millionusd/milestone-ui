
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

// ——— URL Sanitization Helpers (Fixes "Dot at end of URL" error) ———

/**
 * Removes trailing punctuation (.,;) from a URL string
 * Example: "https://site.com/file.pdf." -> "https://site.com/file.pdf"
 */
export const cleanUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  return url.trim().replace(/[.,;]+$/, "");
};

/**
 * Takes a full Bid object, sanitizes the URLs in its files/docs list,
 * and returns the cleaned object. Use this immediately after fetching a bid.
 */
export const cleanBidData = (bid: any) => {
  if (!bid) return bid;

  // Handle both 'files' and legacy 'docs' arrays
  const rawFiles = Array.isArray(bid.files) ? bid.files : (bid.docs ?? []);

  // Map over files and clean their URLs
  const cleanedFiles = rawFiles.map((f: any) => ({
    ...f,
    url: cleanUrl(f.url ?? f.href)
  }));

  // Return new bid object with the cleaned files array
  return { ...bid, files: cleanedFiles };
};