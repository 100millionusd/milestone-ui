import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  console.log("=== API VALIDATE-PROPOSAL CALLED ===");
  console.log("Time:", new Date().toISOString());
  console.log("API Key available:", !!process.env.OPENAI_API_KEY);
  
  // Log the first few characters of the API key (for verification)
  if (process.env.OPENAI_API_KEY) {
    console.log("API Key starts with:", process.env.OPENAI_API_KEY.substring(0, 8) + "...");
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("Parsing request body...");
    const body = await req.json();
    console.log("Request body received");

    const { messages } = body;

    console.log("Creating AI stream with model: gpt-4o-mini");
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
      system: "You are a helpful AI assistant.",
    });

    console.log("AI stream completed successfully");
    return result.toAIStreamResponse();

  } catch (error) {
    console.error("=== FULL ERROR DETAILS ===");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    if (error.response) {
      console.error("Error response status:", error.response.status);
      console.error("Error response data:", error.response.data);
    }
    
    console.error("=== END ERROR DETAILS ===");

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}