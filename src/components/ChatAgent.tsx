// src/components/ChatAgent.tsx
"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

type ChatAgentProps = {
  proposal: any;                 // whatever you pass in now
  onComplete: () => void;        // called if AI says "✅ All good"
  onClose: () => void;           // close the modal
};

export default function ChatAgent({ proposal, onComplete, onClose }: ChatAgentProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Abort in-flight stream when user closes / component unmounts
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  const sendMessage = async (msg: string) => {
    const userMsg: Msg = { role: "user", content: msg };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    // cancel previous stream if any
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    try {
      // ✅ Use your existing API route that returns a plain text stream
      const res = await fetch("/api/validate-proposal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // matches your app's cookie auth behavior
        body: JSON.stringify({ proposal, messages: history }),
        signal: controllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      // Create an assistant bubble and update it as tokens stream in
      let assistant: Msg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistant]);

      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Append streamed text directly (no SSE parsing)
        assistant.content += decoder.decode(value, { stream: true });
        setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);

        // Trigger completion callback on your pass phrase
        if (assistant.content.includes("✅ All good")) {
          try { onComplete(); } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const msg = err?.message || "Streaming failed";
        setMessages((prev) => [...prev, { role: "assistant", content: `ERROR: ${msg}` }]);
      }
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold">AI Proposal Validator</h2>
          <button
            onClick={() => {
              if (controllerRef.current) controllerRef.current.abort();
              onClose();
            }}
            className="text-slate-600 hover:text-slate-900"
            aria-label="Close"
          >
            ✖
          </button>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg max-w-[80%] ${
                m.role === "user"
                  ? "bg-blue-100 text-blue-900 ml-auto"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && <div className="text-gray-400 text-xs">AI is typing...</div>}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = input.trim();
            if (trimmed) sendMessage(trimmed);
          }}
          className="p-3 border-t flex gap-2"
        >
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your reply..."
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
