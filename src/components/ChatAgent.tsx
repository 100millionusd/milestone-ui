// src/components/ChatAgent.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { API_BASE } from "@/lib/api"; // ✅ use the same base your app already uses

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

  // ✅ abort in-flight stream when user closes
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
      const res = await fetch(`${API_BASE}/chat-validate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ match the rest of your app (cookie auth)
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

      // Push an empty assistant message; we’ll mutate it as tokens arrive
      let assistant: Msg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistant]);

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Handle Server-Sent-Events style "data: <token>\n\n"
        const chunks = buffer.split("\n\n");
        // Keep last partial in buffer
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;

          const token = line.slice(5).trim(); // after "data:"
          if (token === "[DONE]") {
            buffer = "";
            break;
          }
          if (token.startsWith("ERROR")) {
            // Surface server error tokens
            assistant.content += `\n${token}`;
            setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);
            continue;
          }

          // Append token and update the last assistant message only
          assistant.content += token;
          setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);

          // ✅ trigger callback if AI signals pass condition
          if (assistant.content.includes("✅ All good")) {
            try { onComplete(); } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const errMsg = err?.message || "Streaming failed";
        // append error into assistant bubble (keeps layout)
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
