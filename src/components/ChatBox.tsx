import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import MessageBubble from "./MessageBubble";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: string;
}

const ChatBox = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // This will need to be connected to your Ollama backend
      // For now, showing a placeholder response
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer || "I am here to guide you on the path of Bhakti. Please ask your question, and I will share the teachings of Maharaj Ji.",
        source: data.source,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Unable to connect to the wisdom source. Please ensure your Ollama server is running.");
      
      // Remove the user message if there was an error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="space-y-6 mb-6">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your spiritual question here..."
            className="min-h-[120px] pr-12 resize-none bg-card border-border focus:border-primary focus:ring-primary/20"
            disabled={isLoading}
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity text-white font-medium"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Seeking Guidance...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Ask Maharaj Ji
            </>
          )}
        </Button>
      </form>
    </div>
  );
};

export default ChatBox;
