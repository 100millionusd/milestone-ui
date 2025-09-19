// src/components/ProposalAgent.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ProposalAgent({ proposal }: ProposalAgentProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort ongoing stream when closing the panel or remounting
  const controllerRef = useRef<AbortController | null>(null);

  // Auto-validate once when chat opens for the first time
  useEffect(() => {
    if (open && messages.length === 0) {
      handleAutoValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clean up on unmount/close: abort any in-flight request
  useEffect(() => {
    if (!open && controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [open]);

  const streamFromApi = async (body: any, baseMessages: ChatMessage[] = []) => {
    setIsLoading(true);
    setError(null);

    // Abort any existing request before starting a new one
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/validate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantMessage = '';

      // Progressive streaming
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        assistantMessage += decoder.decode(value, { stream: true });

        // Update messages incrementally without losing state
        setMessages(() => [
          ...baseMessages,
          { role: 'assistant', content: assistantMessage },
        ]);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // silent cancel on close
      } else {
        console.error('Stream error:', err);
        setError(err?.message || 'An error occurred');
      }
    } finally {
      setIsLoading(false);
      controllerRef.current = null;
    }
  };

  const handleAutoValidate = async () => {
    // Log what we send (handy for debugging server expectations)
    console.log('Sending proposal data to API:', proposal);

    // Start with an empty assistant message that will fill as stream arrives
    setMessages([{ role: 'assistant', content: '' }]);
    await streamFromApi(
      {
        // Empty user prompt tells the server to just validate proposal
        messages: [{ role: 'user', content: '' }],
        proposal,
      },
      [] // base messages for auto-validate is just empty
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    setInput('');

    const base = [...messages, userMessage];
    // Show the user message immediately
    setMessages(base);

    await streamFromApi(
      {
        messages: base,
        proposal,
      },
      base // base includes all prior + the just-added user message
    );
  };

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
            Starting automatic validation...
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`p-2 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 text-blue-800 ml-8'
                : 'bg-slate-100 text-slate-800 mr-8'
            }`}
          >
            {message.content}
          </div>
        ))}

        {isLoading && messages.length === 0 && (
          <div className="text-xs text-slate-400 flex items-center">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
            Analyzing proposal...
          </div>
        )}

        {isLoading && messages.length > 0 && (
          <div className="text-xs text-slate-400 flex items-center">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
            AI is thinking...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-500 bg-red-50 p-2 rounded">
            Error: {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask follow-up questions..."
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
