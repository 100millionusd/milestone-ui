"use client";
import { useState } from "react";

export default function ChatAgent({ proposal, onComplete, onClose }: any) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (msg: string) => {
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-validate-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal, messages: newMessages }),
    });

    const reader = response.body?.getReader();
    if (!reader) return;

    let aiMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, aiMessage]);

    const decoder = new TextDecoder("utf-8");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      chunk.split("\n\n").forEach((line) => {
        if (line.startsWith("data: ")) {
          const token = line.replace("data: ", "");
          if (token === "[DONE]") return;
          if (!token.startsWith("ERROR")) {
            aiMessage.content += token;
            setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }]);

            // ✅ trigger callback if AI says all good
            if (aiMessage.content.includes("✅ All good")) {
              onComplete();
            }
          }
        }
      });
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold">AI Proposal Validator</h2>
          <button onClick={onClose}>✖</button>
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
