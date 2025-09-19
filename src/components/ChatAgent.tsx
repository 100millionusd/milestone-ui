// src/components/ChatAgent.tsx
"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatAgent({
  proposal,
  onComplete,
  onClose,
}: {
  proposal: any;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // abort in-flight stream when user closes / re-sends
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  const sendMessage = async (msg: string) => {
    const userMsg: Msg = { role: "user", content: msg };
    const base = [...messages, userMsg];
    setMessages(base);
    setInput("");
    setLoading(true);

    // cancel previous stream if any
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    try {
      // ✅ use the existing Next.js route (same origin)
      const res = await fetch("/api/validate-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal, messages: base }),
        signal: controllerRef.current.signal,
      });

      if (!res.ok) {
        setLoading(false);
        throw new Error(`API error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLoading(false);
        throw new Error("No response body");
      }

      // push an empty assistant message; we’ll mutate it as tokens arrive
      let assistant: Msg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistant]);

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Handle SSE-style "data: <token>\n\n"
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || ""; // keep last partial

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;

          const token = line.slice(5).trim(); // after "data:"
          if (token === "[DONE]") {
            buffer = "";
            break;
          }

          if (token.startsWith("ERROR")) {
            assistant.content += `\n${token}`;
            setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);
            continue;
          }

          // append token and update the last assistant message only
          assistant.content += token;
          setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);

          // optional pass signal
          if (assistant.content.includes("✅ All good")) {
            try {
              onComplete();
            } catch {
              /* noop */
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const errMsg = err?.message || "Streaming failed";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `ERROR: ${errMsg}` },
        ]);
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
            aria-label="Close"
            className="text-slate-600 hover:text-slate-800"
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
          {loading && (
            <div className="text-gray-400 text-xs">AI is typing...</div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) sendMessage(input.trim());
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-slate-400"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
