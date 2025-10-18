import { ExternalLink } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: string;
}

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div
        className={`max-w-[80%] rounded-2xl px-6 py-4 ${
          isUser
            ? "bg-gradient-to-br from-primary to-accent text-white"
            : "bg-card border border-border shadow-sm"
        }`}
      >
        <p className={`text-sm leading-relaxed ${isUser ? "text-white" : "text-foreground"}`}>
          {message.content}
        </p>
        
        {!isUser && message.source && (
          <a
            href={message.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Source: YouTube Teaching
          </a>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
