import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { messages, proposal } = await req.json();

    console.log("Received proposal data:", JSON.stringify(proposal, null, 2));

    // Check if this is an automatic validation request
    const lastMessage = messages[messages.length - 1]?.content || '';
    const isAutomaticValidation = messages.length === 0 || 
                                 lastMessage.trim() === '' ||
                                 lastMessage.toLowerCase().includes('validate') ||
                                 lastMessage.toLowerCase().includes('check') ||
                                 lastMessage.toLowerCase().includes('analyze');

    // System prompt for automatic validation - DIRECTLY USING THE PROPOSAL DATA
    const systemPrompt = `You are an AI Proposal Validation Expert. Analyze this grant proposal COMPLETELY AUTOMATICALLY using the data provided.

IMMEDIATELY ANALYZE THIS PROPOSAL DATA WITHOUT ASKING FOR MORE INFORMATION:

PROPOSAL DETAILS:
- Organization: ${proposal.orgName || 'Not provided'}
- Contact: ${proposal.contact || 'Not provided'}
- Address: ${proposal.address || 'Not provided'}
- Requested Amount: $${proposal.amountUSD ? proposal.amountUSD.toLocaleString() : 'Not specified'}
- Project Summary: ${proposal.summary || 'No summary provided'}
- Supporting Documents: ${proposal.docs?.map(d => d.name).join(', ') || 'None'}

CONDUCT COMPREHENSIVE ANALYSIS:

🔍 ORGANIZATION VALIDATION:
- Name legitimacy check
- Contact information validation  
- Address verification

💰 FINANCIAL ASSESSMENT:
- Amount reasonableness for described work
- Industry standard comparison
- Budget allocation analysis

📋 PROJECT FEASIBILITY:
- Scope vs funding alignment
- Timeline合理性
- Resource needs assessment

📄 DOCUMENTATION REVIEW:
- Provided documents evaluation
- Missing documentation identification
- Verification level assessment

⚠️ RISK ANALYSIS:
- Inconsistency detection
- Red flag identification
- Risk level assessment

REQUIRED OUTPUT FORMAT:

🏢 ORGANIZATION: [Rating/10] - [Brief analysis]
💰 FINANCIAL: [Rating/10] - [Budget assessment] 
📋 PROJECT: [Rating/10] - [Feasibility analysis]
📄 DOCUMENTATION: [Rating/10] - [Completeness review]
⚠️ RISK: [Rating/10] - [Risk level]

OVERALL LEGITIMACY SCORE: [X/10]

🔍 KEY FINDINGS:
- [3-5 most critical observations]

💡 RECOMMENDATIONS:
- [3-5 specific next steps]

DO NOT ask for more information. Use ONLY the data provided above. If some data is missing, note it in your analysis but proceed with validation.`;

    const chatMessages = isAutomaticValidation ? [
      { role: "system", content: systemPrompt },
      { role: "user", content: "I need a complete automatic validation report for this proposal based on the data provided above." }
    ] : [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const result = streamText({
      model: openai("gpt-4o"),
      messages: chatMessages,
    });

    return result.toTextStreamResponse();

  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}