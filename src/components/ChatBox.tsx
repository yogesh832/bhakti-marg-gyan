import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import MessageBubble from "./MessageBubble";

const ChatBox = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 🔹 Ref for auto-scrolling
  const chatEndRef = useRef(null);

  // 🔹 Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🔹 Load chat history
  useEffect(() => {
    const saved = localStorage.getItem("chat_history");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        localStorage.removeItem("chat_history");
      }
    }
  }, []);

  // 🔹 Save chat history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("chat_history", JSON.stringify(messages));
    }
  }, [messages]);

  // 🔹 Ask backend
  const askFromTranscript = async (question) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch("http://localhost:5000/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        if (!response.ok) {
          if (response.status === 503 && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        if (data?.answer) {
          data.answer = data.answer
            .replace(/\*\*(.*?)\*\*/g, "\n\n**$1**\n")
            .replace(/\\n/g, "\n")
            .trim();
        }
        return data;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  };

  // 🧠 Handle question
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || !input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askFromTranscript(input);
      const assistantMessage = {
        role: "assistant",
        content:
          result?.answer ||
          "🙏 I couldn’t find an answer in the transcript. Please ask another question.",
        source: result?.model || "Gemini AI",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      await fetch("http://localhost:5000/api/saveChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: userMsg.content,
          botMessage: assistantMessage.content,
          source: assistantMessage.source,
        }),
      });
    } catch (error) {
      console.error("❌ Chat error:", error);
      toast.error("Model temporarily unavailable. Please try again later.");
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

  return (
    <div className="w-full max-w-3xl mx-auto p-6 rounded-2xl border border-sky-400/40 shadow-lg bg-card/70 backdrop-blur-md">
      {/* Chat Section */}
      <div className="space-y-6 mb-6 max-h-[60vh] overflow-y-auto px-2 scroll-smooth">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground italic py-10">
            🙏 Ask your first question about Maharaj Ji’s teachings.
          </p>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        )}

        {/* 👇 Auto-scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* Input Section */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your question about the transcript..."
          className="min-h-[100px] pr-12 resize-none bg-background/60 border-sky-300 focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-all rounded-xl"
          disabled={isLoading}
        />

        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:opacity-90 transition-opacity text-white font-semibold tracking-wide rounded-xl py-6"
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
              Ask About Transcript
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

export default ChatBox;
