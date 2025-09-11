// src/services/aiValidator.ts
export async function validateProposal(proposal: any) {
  try {
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
    });

    if (!res.ok) throw new Error("Validation API failed");

    return await res.json();
  } catch (err) {
    console.error("Validation error:", err);
    return { error: "Validation failed" };
  }
}
