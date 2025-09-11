"use client";

import { useChat } from "ai/react";

export default function ProposalAgent({ proposal }: { proposal: any }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    initialMessages: [
      {
        role: "system",
        content: "You are an assistant helping validate proposals. Ask clarifying questions if something looks incomplete or invalid."
      },
      {
        role: "user",
        content: `Here is a proposal:\nOrg: ${proposal.orgName}\nAddress: ${proposal.address}\nBudget: $${proposal.amountUSD}\nAttachments: ${(proposal.docs || []).map(d => d.name).join(", ") || "none"}`
      }
    ]
  });

  return (
    <div className="fixed bottom-5 right-5 w-96 rounded-2xl shadow-xl bg-white border border-slate-200 flex flex-col">
      <div className="p-3 border-b text-sm font-medium bg-slate-100">AI Proposal Assistant</div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span className={m.role === "user" ? "bg-blue-100 px-2 py-1 rounded-lg" : "bg-slate-100 px-2 py-1 rounded-lg"}>
              {m.content}
            </span>
          </div>
        ))}
        {isLoading && <div className="text-slate-400">AI is typing...</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about this proposal..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">Send</button>
      </form>
    </div>
  );
}
