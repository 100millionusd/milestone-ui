'use client';

import { useState } from 'react';
import { useChat } from 'ai';  // ✅ FIXED import

interface ProposalAgentProps {
  proposal: {
    proposalId: number;
    orgName: string;
    address?: string;
    contact: string;
    amountUSD: number;
    summary: string;
    docs?: { name: string }[];
  };
}

export default function ProposalAgent({ proposal }: ProposalAgentProps) {
  const [open, setOpen] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/agent', // 👈 backend route
    body: { proposal }, // send proposal as context
  });

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          💬 Open AI Validator
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="p-3 flex items-center justify-between border-b border-slate-100">
        <h4 className="font-semibold text-slate-800">AI Validation Agent</h4>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ✕ Close
        </button>
      </div>

      <div className="p-3 max-h-64 overflow-y-auto text-sm space-y-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-2 rounded-lg ${
              m.role === 'user'
                ? 'bg-blue-100 text-blue-800 self-end'
                : 'bg-slate-100 text-slate-800'
            }`}
          >
            {m.content}
          </div>
        ))}
        {isLoading && <div className="text-xs text-slate-400">AI is thinking...</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the AI validator..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-blue-200"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
    </div>
  );
}
