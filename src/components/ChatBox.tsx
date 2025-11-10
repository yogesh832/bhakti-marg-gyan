"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import MessageBubble from "./MessageBubble";

const ChatBox = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Preferences
  const [language, setLanguage] = useState("auto");
  const [tone, setTone] = useState("premand");
  const chatEndRef = useRef(null);

  // Load preferences + chat history
  useEffect(() => {
    const saved = localStorage.getItem("chat_history");
    const savedPrefs = localStorage.getItem("chat_prefs");
    if (saved) setMessages(JSON.parse(saved));
    if (savedPrefs) {
      const { language, tone } = JSON.parse(savedPrefs);
      setLanguage(language);
      setTone(tone);
    }
  }, []);

  // Save chat + prefs
  useEffect(() => {
    if (messages.length > 0)
      localStorage.setItem("chat_history", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("chat_prefs", JSON.stringify({ language, tone }));
  }, [language, tone]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch from backend
  const askFromTranscript = async (question) => {
    try {
      const response = await fetch("https://bhakti-marg-gyan.onrender.com/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language, tone }),
      });

      const data = await response.json();
      if (data?.answer) {
        data.answer = data.answer
          .replace(/\*\*(.*?)\*\*/g, "\n\n**$1**\n")
          .replace(/\\n/g, "\n")
          .trim();
      }
      return data;
    } catch (err) {
      console.error("❌ Chat error:", err);
      throw err;
    }
  };

  // Handle question
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || !input.trim())
      return toast.error("Please enter a question");

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askFromTranscript(input);
      const assistantMsg = {
        role: "assistant",
        content:
          result?.answer ||
          "🙏 I couldn’t find an answer in the transcript. Please ask another question.",
        source: result?.model || "Gemini AI",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ The AI model is temporarily busy. Please try again after a few seconds.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear chat
  const clearChat = () => {
    localStorage.removeItem("chat_history");
    setMessages([]);
    toast.success("Chat history cleared!");
  };

  return (
    <div
      className="
        w-full max-w-3xl mx-auto p-6 
        rounded-2xl 
        border border-yellow-400/40
        shadow-[0_0_40px_rgba(255,215,0,0.25)]
        bg-gradient-to-br from-yellow-200/10 via-yellow-100/5 to-transparent
        backdrop-blur-2xl 
        text-yellow-100 
        relative overflow-hidden
        transition-all duration-300
      "
    >
      {/* ✨ Glass reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-yellow-200/10 to-yellow-900/5 pointer-events-none rounded-2xl"></div>

      {/* 🧭 Header */}
      <div className="flex flex-wrap justify-between items-center mb-4 border-b border-yellow-400/30 pb-3 relative z-10">
        <h2 className="text-lg font-semibold text-yellow-300">
          🕉️ Premand Ji Chat Assistant
        </h2>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((p) => !p)}
            className="border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 bg-yellow-400/10"
          >
            <Settings2 className="w-4 bg- h-4 mr-1" /> Preferences
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            className="border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 bg-yellow-400/10"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* ⚙️ Settings Panel */}
      {showSettings && (
        <div className="mb-6 bg-black/60 p-4 rounded-xl border border-yellow-400/40 backdrop-blur-md relative z-10">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Preferred Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="auto">Auto Detect</option>
                <option value="hindi">Hindi</option>
                <option value="english">English</option>
                <option value="tamil">Tamil</option>
                <option value="malayalam">Malayalam</option>
                <option value="bengali">Bengali</option>
                <option value="gujarati">Gujarati</option>
                <option value="kannada">Kannada</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Response Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="premand">Premand Ji Style (Devotional)</option>
                <option value="brief">Brief & Clear</option>
                <option value="detailed">Detailed Explanation</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 💬 Chat Section */}
      <div className="space-y-6 mb-6 max-h-[60vh] overflow-y-auto px-2 relative z-10">
        {messages.length === 0 && (
          <p className="text-center text-yellow-500 italic py-10">
            🙏 Ask your first question about Maharaj Ji’s teachings.
          </p>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ✍️ Input */}
      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your question about Maharaj Ji’s divine words..."
          className="min-h-[100px] pr-12 resize-none bg-black/40 border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/70 focus:border-yellow-500 transition-all rounded-xl text-yellow-100 placeholder:text-yellow-300/50 backdrop-blur-lg"
          disabled={isLoading}
        />

        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 hover:opacity-90 transition-opacity text-black font-semibold tracking-wide rounded-xl py-6 shadow-[0_0_20px_rgba(255,215,0,0.4)]"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              Ask Maharaj Ji
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

export default ChatBox;
