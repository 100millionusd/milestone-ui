// src/components/BidChatAgent.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };

export default function BidChatAgent({
  bidId,
  proposal,
  open,
  onClose,
}: {
  bidId: number;
  proposal?: any;
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // cleanup when closed
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setMessages([]);
      setInput("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function sendMessage(text: string) {
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    // cancel any previous stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${API_BASE}/bids/${bidId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: next, proposal }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // assistant bubble we’ll stream into
      let assistant: Msg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistant]);

      const reader = res.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });

        // SSE frames are separated by a blank line
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || ""; // keep partial

        for (const chunk of chunks) {
          // IMPORTANT: keep trailing whitespace/newlines from tokens
          const line = chunk.trimStart(); // only trim the start (keeps token spaces)
          if (!line.startsWith("data:")) continue;

          // remove the "data:" prefix only; DO NOT .trim() the token
          const token = line.replace(/^data:\s?/, "");

          if (token === "[DONE]") {
            buf = "";
            break;
          }

          if (token.startsWith("ERROR")) {
            assistant.content += `\n${token}\n`;
          } else {
            assistant.content += token; // preserve spaces/newlines
          }
          setMessages((prev) => [...prev.slice(0, -1), { ...assistant }]);
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `ERROR: ${e?.message || "stream failed"}` },
        ]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Agent 2 — Bid Chat (#{bidId})</h3>
          <button
            className="text-gray-500 hover:text-black"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            aria-label="Close"
          >
            ✖
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          className="p-4 space-y-3 overflow-y-auto max-h-[60vh] text-sm"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg max-w-[80%] ${
                m.role === "user"
                  ? "ml-auto bg-blue-100 text-blue-900"
                  : "bg-gray-100 text-gray-800"
              } whitespace-pre-wrap break-words`} // preserve spaces & line breaks
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="text-xs text-gray-400">Agent 2 is typing…</div>
          )}
        </div>

        {/* Input */}
        <form
          className="p-3 border-t flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) sendMessage(input.trim());
          }}
        >
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="Ask about this bid…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60"
            disabled={loading}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
