// src/services/aiValidator.ts
// Client-side AI validation using OpenAI API

export type ValidationResult = {
  valid: boolean;
  issues: string[];
  suggestions: string[];
};

export async function validateProposal(proposal: any): Promise<ValidationResult> {
  try {
    // Extract text content we want AI to review
    const context = `
Organization: ${proposal.orgName || "N/A"}
Title: ${proposal.title || "N/A"}
Summary: ${proposal.summary || "N/A"}
Contact: ${proposal.contact || "N/A"}
Address: ${[proposal.address, proposal.city, proposal.country].filter(Boolean).join(", ")}
Requested Budget: ${proposal.amountUSD || "N/A"}
Attachments: ${(proposal.docs || []).map((d: any) => d.name).join(", ")}
    `;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`, // ✅ keep in .env
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an assistant that validates NGO project proposals for correctness.",
          },
          {
            role: "user",
            content: `
Please analyze the following project proposal data and check:
1. Is the organization name and address plausible?
2. Does the budget seem to match the description/attachments?
3. Are there any missing or suspicious fields?
4. Suggest improvements.

Proposal data:
${context}
            `,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // crude parse: split into "issues" and "suggestions"
    const issues: string[] = [];
    const suggestions: string[] = [];

    text.split("\n").forEach((line: string) => {
      if (/issue|problem|error|missing/i.test(line)) issues.push(line.trim());
      else if (/suggest|improve|recommend/i.test(line)) suggestions.push(line.trim());
    });

    return {
      valid: issues.length === 0,
      issues,
      suggestions,
    };
  } catch (err: any) {
    console.error("AI validation failed:", err);
    return {
      valid: false,
      issues: ["AI validation could not be performed."],
      suggestions: [],
    };
  }
}
