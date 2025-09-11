import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { messages, proposal } = await req.json();

  // System prompt with proposal context
  const systemPrompt = `
You are an AI validation agent helping an organization refine its proposal.

Proposal data:
- Org: ${proposal.orgName}
- Address: ${proposal.address || 'N/A'}
- Contact: ${proposal.contact}
- Budget: $${proposal.amountUSD}
- Summary: ${proposal.summary}
- Attachments: ${(proposal.docs || []).map(d => d.name).join(', ') || 'none'}

Ask questions if data looks incomplete, unrealistic, or mismatched. 
Guide the user to improve their proposal before submission.
`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  // Stream back to frontend
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
