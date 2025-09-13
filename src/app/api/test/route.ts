export async function GET() {
  return new Response(JSON.stringify({
    apiKeyExists: !!process.env.OPENAI_API_KEY,
    apiKeyLength: process.env.OPENAI_API_KEY?.length || 0,
    nodeEnv: process.env.NODE_ENV
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}