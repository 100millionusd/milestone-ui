import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { messages, proposal } = await req.json();

  const result = await streamText({
    model: openai("gpt-4o-mini"),
    messages,
    system: `You are an AI validator. Context: ${JSON.stringify(proposal)}`,
  });

  return result.toAIStreamResponse();
}
