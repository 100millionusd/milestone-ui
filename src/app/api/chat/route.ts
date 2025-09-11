import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { NextResponse } from "next/server";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { messages, proposal } = await req.json();

  const response = await streamText({
    model: openai("gpt-4o-mini"),
    messages,
    system: `You are an AI validator helping review funding proposals.
    Context: ${JSON.stringify(proposal)}`,
  });

  return response.toAIStreamResponse();
}
