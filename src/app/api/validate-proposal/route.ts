import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { messages, proposal } = await req.json();

    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      system: proposal 
        ? `You are an AI validator. Context: ${JSON.stringify(proposal)}`
        : "You are an AI validator. Analyze the user's request.",
    });

    return result.toAIStreamResponse();
  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}