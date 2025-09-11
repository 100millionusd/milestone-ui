import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // server-side only
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const completion = await client.chat.completions.create({
    model: process.env.NEXT_PUBLIC_OPENAI_MODEL || "gpt-4o-mini",
    messages,
    stream: true, // enable streaming
  });

  return new Response(completion.toReadableStream(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}
