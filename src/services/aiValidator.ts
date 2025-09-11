// src/services/aiValidator.ts
export async function validateProposal(proposal: any) {
  try {
    const context = `
Organization: ${proposal.orgName || "N/A"}
Title: ${proposal.title || "N/A"}
Summary: ${proposal.summary || "N/A"}
Contact: ${proposal.contact || "N/A"}
Address: ${[proposal.address, proposal.city, proposal.country].filter(Boolean).join(", ")}
Requested Budget: ${proposal.amountUSD || "N/A"}
Attachments: ${(proposal.docs || []).map((d: any) => d.name).join(", ")}
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an assistant that validates NGO project proposals. Return JSON only.",
          },
          {
            role: "user",
            content: `
Check the following proposal. Respond ONLY in strict JSON with keys:
{ "orgNameValid": true/false,
  "addressValid": true/false,
  "budgetCheck": "ok/too high/too low/unknown",
  "attachmentsValid": true/false,
  "comments": "short summary of findings" }

Proposal:
${context}
            `,
          },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(raw);
  } catch (err) {
    console.error("AI validation failed:", err);
    return {
      orgNameValid: "unknown",
      addressValid: "unknown",
      budgetCheck: "unknown",
      attachmentsValid: "unknown",
      comments: "AI validation could not be performed.",
    };
  }
}
