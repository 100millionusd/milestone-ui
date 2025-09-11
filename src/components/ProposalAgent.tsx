'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';

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

  // Initialize useChat hook unconditionally at the top level
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/validate-proposal/',
    body: { proposal },
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onResponse: (response) => {
      console.log('Response received, status:', response.status);
    },
    onFinish: (message) => {
      console.log('Message finished:', message);
    }
  });

  // Debug logs - check if hook is working
  console.log('Messages:', messages);
  console.log('Loading:', isLoading);
  console.log('Error:', error);
  console.log('Input:', input);

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
        {messages.length === 0 && !isLoading && (
          <div className="text-xs text-slate-400 text-center py-4">
            Start a conversation with the AI validator...
          </div>
        )}
        
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-2 rounded-lg ${
              m.role === 'user'
                ? 'bg-blue-100 text-blue-800 ml-8'
                : 'bg-slate-100 text-slate-800 mr-8'
            }`}
          >
            {m.content}
          </div>
        ))}
        
        {isLoading && (
          <div className="text-xs text-slate-400 flex items-center">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
            AI is thinking...
          </div>
        )}
        
        {error && (
          <div className="text-xs text-red-500 bg-red-50 p-2 rounded">
            Error: {error.message}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Ask the AI validator..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-blue-200"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}