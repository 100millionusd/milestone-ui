import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  console.log("=== API VALIDATE-PROPOSAL CALLED ===");
  console.log("Time:", new Date().toISOString());
  console.log("API Key available:", !!process.env.OPENAI_API_KEY);

  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("ERROR: OPENAI_API_KEY is not set");
      throw new Error("OPENAI_API_KEY is not set");
    }

    console.log("Creating OpenAI instance...");
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("Parsing request body...");
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const { messages, proposal } = body;

    console.log("Starting AI stream...");
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      system: proposal 
        ? `You are an AI validator. Context: ${JSON.stringify(proposal)}`
        : "You are an AI validator. Analyze the user's request.",
    });

    console.log("AI stream completed successfully");
    return result.toAIStreamResponse();

  } catch (error) {
    console.error("=== API ERROR ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("=== END ERROR ===");

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}