export async function validateProposal(proposal: any) {
  try {
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
      }
    );

    if (!resp.ok) {
      throw new Error(`Validation API error: ${resp.status}`);
    }

    return await resp.json();
  } catch (err: any) {
    console.error("validateProposal error:", err);
    return {
      orgNameValid: "unknown",
      addressValid: "unknown",
      budgetCheck: "unknown",
      attachmentsValid: "unknown",
      comments: "AI validation could not be performed.",
    };
  }
}
