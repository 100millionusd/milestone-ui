import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  console.log("API called at:", new Date().toISOString());
  
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = await req.json();
    console.log("Request body received");

    const { messages, proposal } = body;

    console.log("Starting streamText...");
    
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      system: proposal 
        ? `You are an AI validator. Context: ${JSON.stringify(proposal)}`
        : "You are an AI validator. Analyze the user's request.",
    });

    console.log("Stream text completed");
    return result.toAIStreamResponse();

  } catch (error) {
    console.error("API Error Details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}