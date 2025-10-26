"use client";

import { motion } from "framer-motion";
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

  // 🧩 Smart formatting for cleaner output
  const formattedContent = message.content
    .replace(/\*\*/g, "\n\n") // Double asterisks → new lines
    .replace(/(\d+)\.\s*/g, "\n$1. ") // Proper spacing for numbered points
    .split(/\n+/)
    .map((line, i) => (
      <p
        key={i}
        className="mb-3 last:mb-0 whitespace-pre-wrap leading-relaxed tracking-wide"
      >
        {line.trim()}
      </p>
    ));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-6 py-4 shadow-lg ${
          isUser
            ? // 🌟 Golden gradient for user messages
              "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 text-white shadow-yellow-400/30"
            : // ✨ Soft glowing assistant bubble
              "bg-gradient-to-b from-yellow-50/10 to-transparent border border-yellow-400/30 backdrop-blur-sm text-yellow-100"
        }`}
      >
        <div
          className={`text-sm leading-relaxed ${
            isUser ? "text-white" : "text-yellow-100"
          }`}
        >
          {formattedContent}
        </div>

        {!isUser && message.source && (
          <a
            href={message.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs text-yellow-300 hover:text-yellow-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Source: YouTube Teaching
          </a>
        )}
      </div>
    </motion.div>
  );
};

export default MessageBubble;
