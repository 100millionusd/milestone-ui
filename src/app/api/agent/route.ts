import { NextResponse } from "next/server";
import OpenAI from "openai";
import { streamText, convertToCoreMessages } from "ai";

// ✅ initialize OpenAI with server-side key
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // must be set in Netlify env
});

export const runtime = "edge"; // run fast in Edge

export async function POST(req: Request) {
  try {
    const { messages, proposal } = await req.json();

    // build system prompt with proposal context
    const systemPrompt = `
You are an AI validator that reviews project proposals. 
The organization has submitted this proposal:

- Org: ${proposal.orgName}
- Address: ${proposal.address || "N/A"}
- Contact: ${proposal.contact || "N/A"}
- Budget: $${proposal.amountUSD}
- Summary: ${proposal.summary}
- Attachments: ${(proposal.docs || []).map((d: any) => d.name).join(", ") || "none"}

Your job: 
- Ask clarifying questions about missing or incorrect info.
- Suggest corrections if details are unrealistic, incomplete, or inconsistent.
- Be concise and helpful. Respond conversationally.
`;

    const result = await streamText({
      model: client.chat.completions, // use OpenAI chat models
      messages: [
        { role: "system", content: systemPrompt },
        ...convertToCoreMessages(messages),
      ],
    });

    return result.toAIStreamResponse();
  } catch (err: any) {
    console.error("AI Agent error:", err);
    return NextResponse.json(
      { error: "AI validation failed", details: err.message },
      { status: 500 }
    );
  }
}
