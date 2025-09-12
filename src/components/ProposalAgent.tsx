'use client';

import { useState, useEffect } from 'react';

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

  // Trigger automatic validation when chat opens
  useEffect(() => {
    if (open && messages.length === 0) {
      // Auto-validate when chat opens for the first time
      handleAutoValidate();
    }
  }, [open]);

  const handleAutoValidate = async () => {
    setIsLoading(true);
    setError(null);

    // Debug log to check what data is being sent
    console.log("Sending proposal data to API:", proposal);

    try {
      const response = await fetch('/api/validate-proposal/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '' }], // Empty message triggers automatic validation
          proposal // This should contain all the proposal data
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let assistantMessage = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantMessage += chunk;
        
        // Update the message in real-time
        setMessages([
          { role: 'assistant', content: assistantMessage }
        ]);
      }

    } catch (err) {
      console.error('Auto-validation error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during validation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setIsLoading(true);
    setError(null);

    // Add user message to chat
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userMessage }
    ];
    setMessages(newMessages);

    try {
      const response = await fetch('/api/validate-proposal/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          proposal
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let assistantMessage = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantMessage += chunk;
        
        // Update the message in real-time
        setMessages([
          ...newMessages,
          { role: 'assistant', content: assistantMessage }
        ]);
      }

    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
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
