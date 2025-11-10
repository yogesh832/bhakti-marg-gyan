"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Settings2, Trash2, Volume2, VolumeX, Mic, StopCircle } from "lucide-react";
import { toast } from "sonner";

// MessageBubble Component
const MessageBubble = ({ message }) => {
  const isUser = message.role === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`
          max-w-[80%] p-4 rounded-2xl
          ${
            isUser
              ? "bg-gradient-to-br from-yellow-500/30 to-amber-500/20 border border-yellow-400/40 text-yellow-100"
              : "bg-gradient-to-br from-yellow-900/40 to-yellow-800/30 border border-yellow-400/30 text-yellow-50"
          }
          shadow-lg backdrop-blur-sm
        `}
      >
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </div>
        {message.source && (
          <div className="text-xs text-yellow-400/70 mt-2 italic">
            — {message.source}
          </div>
        )}
      </div>
    </div>
  );
};

const ChatBox = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentSpeakingIndex, setCurrentSpeakingIndex] = useState(null);
  const [autoPlay, setAutoPlay] = useState(true);

  // Preferences
  const [language, setLanguage] = useState("hindi");
  const [tone, setTone] = useState("premand");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceRate, setVoiceRate] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(1.0);
  
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);

  // Language to voice locale mapping
  const getVoiceLocale = (lang) => {
    const localeMap = {
      hindi: 'hi-IN',
      english: 'en-US',
      tamil: 'ta-IN',
      malayalam: 'ml-IN',
      bengali: 'bn-IN',
      gujarati: 'gu-IN',
      kannada: 'kn-IN',
      auto: 'hi-IN'
    };
    return localeMap[lang] || 'hi-IN';
  };

  // Load preferences + chat history
  useEffect(() => {
    const saved = localStorage.getItem("chat_history");
    const savedPrefs = localStorage.getItem("chat_prefs");
    
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
    
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        setLanguage(prefs.language || "hindi");
        setTone(prefs.tone || "premand");
        setVoiceEnabled(prefs.voiceEnabled !== undefined ? prefs.voiceEnabled : true);
        setVoiceRate(prefs.voiceRate || 1.0);
        setVoicePitch(prefs.voicePitch || 1.0);
        setAutoPlay(prefs.autoPlay !== undefined ? prefs.autoPlay : true);
      } catch (e) {
        console.error("Failed to load preferences", e);
      }
    }

    // Initialize speech recognition
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = getVoiceLocale(language);
    }

    // Cleanup on unmount
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Save chat history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("chat_history", JSON.stringify(messages));
    }
  }, [messages]);

  // Save preferences
  useEffect(() => {
    localStorage.setItem("chat_prefs", JSON.stringify({ 
      language, 
      tone, 
      voiceEnabled, 
      voiceRate, 
      voicePitch,
      autoPlay 
    }));
    
    // Update speech recognition language
    if (recognitionRef.current) {
      recognitionRef.current.lang = getVoiceLocale(language);
    }
  }, [language, tone, voiceEnabled, voiceRate, voicePitch, autoPlay]);

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

  // Text-to-Speech function with language support
  const speakText = (text, messageIndex) => {
    if (!voiceEnabled) {
      toast.error("Voice is disabled. Enable it in preferences.");
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error("Text-to-speech not supported in your browser.");
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    // Clean text for better speech
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/🙏|🕉️|✨|💫|🌟/g, '');

    utteranceRef.current = new SpeechSynthesisUtterance(cleanText);
    
    // Set language
    utteranceRef.current.lang = getVoiceLocale(language);
    utteranceRef.current.rate = voiceRate;
    utteranceRef.current.pitch = voicePitch;
    utteranceRef.current.volume = 1.0;

    // Try to find a voice that matches the language
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith(getVoiceLocale(language).split('-')[0])
    );
    
    if (preferredVoice) {
      utteranceRef.current.voice = preferredVoice;
    }

    utteranceRef.current.onstart = () => {
      setIsSpeaking(true);
      setCurrentSpeakingIndex(messageIndex);
    };

    utteranceRef.current.onend = () => {
      setIsSpeaking(false);
      setCurrentSpeakingIndex(null);
      utteranceRef.current = null;
    };

    utteranceRef.current.onerror = (event) => {
      console.error('Speech error:', event);
      setIsSpeaking(false);
      setCurrentSpeakingIndex(null);
      utteranceRef.current = null;
      
      if (event.error !== 'interrupted') {
        toast.error("Failed to speak text. Please try again.");
      }
    };

    window.speechSynthesis.speak(utteranceRef.current);
    toast.success("🔊 Playing audio...");
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setCurrentSpeakingIndex(null);
      utteranceRef.current = null;
    }
  };

  // Speech-to-Text (Voice Input)
  const startListening = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition not supported in your browser. Try Chrome or Edge.");
      return;
    }

    try {
      setIsListening(true);
      recognitionRef.current.start();
      toast.success("🎤 Listening... Speak now!");

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        toast.success("✓ Voice captured!");
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          toast.error("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please allow microphone permissions.");
        } else {
          toast.error(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
      toast.error("Failed to start voice input. Please check microphone permissions.");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      toast.info("Microphone stopped");
    }
  };

  // Handle question submission
  const handleSubmit = async () => {
    if (isLoading || !input.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const userMsg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askFromTranscript(input.trim());
      const assistantMsg = {
        role: "assistant",
        content: result?.answer || "🙏 I couldn't find an answer in the transcript. Please ask another question.",
        source: result?.providers ? `${result.providers.join(', ')}` : "AI",
      };
      
      setMessages((prev) => {
        const newMessages = [...prev, assistantMsg];
        
        // Auto-play the response if enabled
        if (autoPlay && voiceEnabled && result?.answer) {
          setTimeout(() => {
            speakText(assistantMsg.content, newMessages.length - 1);
          }, 500);
        }
        
        return newMessages;
      });
      
      toast.success("✓ Answer received!");
    } catch (error) {
      console.error("Submission error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ The AI model is temporarily busy. Please try again after a few seconds.",
        },
      ]);
      toast.error("Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  // Clear chat
  const clearChat = () => {
    localStorage.removeItem("chat_history");
    setMessages([]);
    stopSpeaking();
    toast.success("Chat history cleared!");
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 rounded-2xl border border-yellow-400/40 shadow-[0_0_40px_rgba(255,215,0,0.25)] bg-gradient-to-br from-yellow-200/10 via-yellow-100/5 to-transparent backdrop-blur-2xl text-yellow-100 relative overflow-hidden transition-all duration-300">
      
      {/* Glass reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-yellow-200/10 to-yellow-900/5 pointer-events-none rounded-2xl"></div>

      {/* Header */}
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
            <Settings2 className="w-4 h-4 mr-1" /> Preferences
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 bg-black/60 p-4 rounded-xl border border-yellow-400/40 backdrop-blur-md relative z-10">
          <h3 className="text-yellow-300 font-semibold mb-3">⚙️ Chat Preferences</h3>
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
                <option value="hindi">Hindi (हिंदी)</option>
                <option value="english">English</option>
                <option value="tamil">Tamil (தமிழ்)</option>
                <option value="malayalam">Malayalam (മലയാളം)</option>
                <option value="bengali">Bengali (বাংলা)</option>
                <option value="gujarati">Gujarati (ગુજરાતી)</option>
                <option value="kannada">Kannada (ಕನ್ನಡ)</option>
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

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Voice Features
              </label>
              <select
                value={voiceEnabled ? "enabled" : "disabled"}
                onChange={(e) => setVoiceEnabled(e.target.value === "enabled")}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="enabled">✓ Enabled</option>
                <option value="disabled">✗ Disabled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Auto-Play Responses
              </label>
              <select
                value={autoPlay ? "yes" : "no"}
                onChange={(e) => setAutoPlay(e.target.value === "yes")}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="yes">✓ Yes</option>
                <option value="no">✗ No</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Voice Speed: {voiceRate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={voiceRate}
                onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-yellow-400/30 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Voice Pitch: {voicePitch.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={voicePitch}
                onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                className="w-full h-2 bg-yellow-400/30 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
            </div>
          </div>

          <div className="mt-4 p-3 bg-yellow-900/20 rounded-lg border border-yellow-400/30">
            <p className="text-xs text-yellow-300">
              💡 <strong>Tip:</strong> Voice features work best in Chrome, Edge, or Safari. 
              {!voiceEnabled && " Enable voice to use speech features."}
            </p>
          </div>
        </div>
      )}

      {/* Chat Section */}
      <div className="space-y-6 mb-6 max-h-[60vh] overflow-y-auto px-2 relative z-10 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-yellow-500 italic mb-4">
              🙏 Ask your first question about Maharaj Ji's teachings.
            </p>
            <p className="text-yellow-400/70 text-sm">
              You can type or use the microphone button to speak your question
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index}>
            <MessageBubble message={message} />
            {message.role === "assistant" && voiceEnabled && (
              <div className="flex justify-end mt-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentSpeakingIndex === index) {
                      stopSpeaking();
                    } else {
                      speakText(message.content, index);
                    }
                  }}
                  className="border-yellow-400/60 text-yellow-200 hover:bg-yellow-800/20 bg-yellow-400/10 transition-all"
                >
                  {currentSpeakingIndex === index ? (
                    <>
                      <VolumeX className="w-4 h-4 mr-1 animate-pulse" /> Stop
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 mr-1" /> Listen
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
            <p className="text-yellow-300 text-sm animate-pulse">Searching through teachings...</p>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Section */}
      <div className="space-y-4 relative z-10">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your question about Maharaj Ji's divine words... (Type or click mic to speak)"
            className="min-h-[100px] pr-14 resize-none bg-black/40 border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/70 focus:border-yellow-500 transition-all rounded-xl text-yellow-100 placeholder:text-yellow-300/50 backdrop-blur-lg"
            disabled={isLoading || isListening}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            className={`absolute right-2 bottom-2 p-2 h-auto transition-all ${
              isListening 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                : 'bg-yellow-500/20 hover:bg-yellow-500/30'
            } border border-yellow-400`}
            title={isListening ? "Stop recording" : "Start voice input"}
          >
            {isListening ? (
              <StopCircle className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-yellow-300" />
            )}
          </Button>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim() || isListening}
          className="w-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 hover:opacity-90 transition-opacity text-black font-semibold tracking-wide rounded-xl py-6 shadow-[0_0_20px_rgba(255,215,0,0.4)] disabled:opacity-50"
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
      </div>

      {/* Status Bar */}
      <div className="mt-4 text-center text-xs text-yellow-400/60 relative z-10">
        {isSpeaking && <span className="animate-pulse">🔊 Speaking...</span>}
        {isListening && <span className="animate-pulse">🎤 Listening...</span>}
        {!isSpeaking && !isListening && (
          <span>Messages: {messages.length} | Language: {language}</span>
        )}
      </div>
    </div>
  );
};

export default ChatBox;