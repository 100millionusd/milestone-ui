// src/app/api/validate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

// Use backend-only key (⚠️ DO NOT expose NEXT_PUBLIC_ here)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const proposal = await req.json();

    const textSummary = proposal.summary || "";
    const docs = (proposal.docs || []).map((d: any) => d.name).join(", ");

    const prompt = `
You are an AI validator for project proposals. 
Check the following:

1. Organization name (${proposal.orgName || "N/A"}) — does it look realistic?
2. Address (${proposal.address || "N/A"}) — is it valid and complete?
3. Contact (${proposal.contact || "N/A"}) — does it look correct (email/phone)?
4. Budget: Proposal says $${proposal.amountUSD || "N/A"}. If attachments mention another number, flag mismatch.
5. General issues with attachments: ${docs || "none"}.

Reply in JSON with keys:
{
  "orgNameValid": true/false,
  "addressValid": true/false,
  "contactValid": true/false,
  "budgetCheck": true/false,
  "attachmentsValid": true/false,
  "comments": "short summary of issues or recommendations"
}
`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No AI response received" },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(content));
  } catch (err: any) {
    console.error("AI validation failed:", err);
    return NextResponse.json(
      { error: "Validation failed", details: err.message },
      { status: 500 }
    );
  }
}
