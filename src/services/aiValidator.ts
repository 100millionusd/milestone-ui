// src/services/aiValidator.ts
// Client-side helper to call the backend AI validator API

export async function validateProposal(proposal: any) {
  try {
    const resp = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
    });

    if (!resp.ok) throw new Error("Validation failed");
    return await resp.json(); // ✅ returns JSON from /api/validate/route.ts
  } catch (err) {
    console.error("validateProposal error:", err);
    return {
      orgNameValid: "unknown",
      addressValid: "unknown",
      contactValid: "unknown",
      budgetCheck: "unknown",
      attachmentsValid: "unknown",
      comments: "AI validation could not be performed.",
    };
  }
}
