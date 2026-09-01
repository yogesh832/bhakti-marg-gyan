"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Settings2, Trash2, Volume2, VolumeX, Mic, StopCircle, PlayCircle, X, Radio } from "lucide-react";

// MessageBubble Component
const formatTime = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
};

const getYouTubeEmbedUrl = (source) => {
  const start = Math.max(0, Math.floor(source.startTime || 0));
  const end = Math.max(start + 1, Math.floor(source.endTime || start + 60));
  return `https://www.youtube.com/embed/${source.videoId}?start=${start}&end=${end}&autoplay=1&rel=0&modestbranding=1`;
};

const VideoSectionPlayer = ({ source, onClose }) => {
  if (!source) return null;

  const isUpload = source.sourceType === "upload" || source.mediaUrl;
  const start = Math.max(0, Math.floor(source.startTime || 0));
  const end = Math.max(start + 1, Math.floor(source.endTime || start + 60));

  return (
    <div className="mb-6 rounded-xl border border-yellow-400/40 bg-black/70 overflow-hidden shadow-[0_0_24px_rgba(255,215,0,0.22)] relative z-10">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-yellow-400/20">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-yellow-200 truncate">
            {source.title || "Pravachan section"}
          </p>
          <p className="text-xs text-yellow-400/70">
            {formatTime(start)} - {formatTime(end)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          className="border-yellow-400/60 text-yellow-200 hover:bg-yellow-800/20 bg-yellow-400/10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="aspect-video bg-black">
        {isUpload ? (
          <video
            key={`${source.mediaUrl}-${start}-${end}`}
            src={`${source.mediaUrl || source.url}#t=${start},${end}`}
            controls
            autoPlay
            className="w-full h-full"
          />
        ) : (
          <iframe
            key={`${source.videoId}-${start}-${end}`}
            src={getYouTubeEmbedUrl(source)}
            title={source.title || "YouTube pravachan section"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        )}
      </div>
    </div>
  );
};

const MessageBubble = ({ message, onPlaySource }) => {
  const [showSources, setShowSources] = useState(false);
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
        
        {/* Source Attribution - Dropdown */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-yellow-400/20">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center justify-between w-full text-xs text-yellow-400/90 font-semibold hover:text-yellow-300 transition-colors"
            >
              <span>📺 प्रवचन स्रोत (Source) - {message.sources.length} video{message.sources.length > 1 ? 's' : ''}</span>
              <span className="text-yellow-400/60">
                {showSources ? '▲' : '▼'}
              </span>
            </button>
            
            {showSources && (
              <div className="mt-2 space-y-2 animate-in slide-in-from-top duration-200">
                {message.sources.map((source, idx) => (
                  <div key={idx} className="mb-2 last:mb-0 pl-2 border-l-2 border-yellow-400/30">
                    <button
                      type="button"
                      onClick={() => onPlaySource?.(source)}
                      className="inline-flex items-center gap-1 text-xs text-yellow-200 hover:text-yellow-100 underline"
                    >
                      <PlayCircle className="w-3 h-3" />
                      Play {formatTime(source.startTime)} - {formatTime(source.endTime)}
                    </button>
                    <a 
                      href={source.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-yellow-300 hover:text-yellow-100 underline block mt-1"
                    >
                      🎥 {source.title || `Video ${source.videoId}`}
                    </a>
                    {source.quote && (
                      <div className="text-xs text-yellow-400/60 italic mt-1 ml-4">
                        "{source.quote.substring(0, 100)}..."
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
  const [showToast, setShowToast] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [liveVoiceMode, setLiveVoiceMode] = useState(false);

  // Preferences
  const [language, setLanguage] = useState("hindi");
  const [tone, setTone] = useState("premand");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState("male");
  
  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechSynthRef = useRef(null);
  const recognitionRef = useRef(null);

  // Toast notification helper
  const toast = {
    success: (msg) => setShowToast({ type: 'success', message: msg }),
    error: (msg) => setShowToast({ type: 'error', message: msg }),
    info: (msg) => setShowToast({ type: 'info', message: msg }),
    warning: (msg) => setShowToast({ type: 'warning', message: msg })
  };

  // Auto-hide toast
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

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
        setVoiceGender(prefs.voiceGender || "male");
        setAutoPlay(prefs.autoPlay !== undefined ? prefs.autoPlay : true);
        setLiveVoiceMode(prefs.liveVoiceMode !== undefined ? prefs.liveVoiceMode : false);
      } catch (e) {
        console.error("Failed to load preferences", e);
      }
    }

    // Load voices on mount
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        console.log('Voices loaded:', window.speechSynthesis.getVoices().length);
      };
      // Trigger voice loading
      window.speechSynthesis.getVoices();
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
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
      voiceGender,
      autoPlay,
      liveVoiceMode
    }));
  }, [language, tone, voiceEnabled, voiceGender, autoPlay, liveVoiceMode]);

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

  // Get language locale
  const getLanguageLocale = (lang) => {
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

  // Text-to-Speech function
  const speakText = async (text, messageIndex) => {
    if (!voiceEnabled) {
      toast.error("Voice is disabled. Enable it in preferences.");
      return;
    }

    if (!window.speechSynthesis) {
      toast.error("Text-to-speech not supported in your browser.");
      return;
    }

    try {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      setIsSpeaking(true);
      setCurrentSpeakingIndex(messageIndex);

      // Clean text for better speech - keep it simple and flat
      const cleanText = text
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold but keep text
        .replace(/#{1,6}\s/g, '') // Remove headers
        .replace(/\n{3,}/g, '. ') // Replace multiple newlines with periods for pauses
        .replace(/\n/g, '. ') // Replace single newlines with periods
        .replace(/🙏|🕉️|✨|💫|🌟/g, '') // Remove emojis
        .replace(/\.\s*\./g, '.') // Remove double periods
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      speechSynthRef.current = utterance;
      
      // Set language
      const locale = getLanguageLocale(language);
      utterance.lang = locale;
      utterance.rate = 1.0; // Normal speed, not too slow
      utterance.pitch = 0.9; // Slightly lower but more natural
      utterance.volume = 1.0;
      
      // Remove all expressiveness for flat, monotone delivery
      if (utterance.hasOwnProperty('voice')) {
        // These properties help reduce expression in some browsers
        utterance.rate = 1.0; // Natural pace
        utterance.pitch = 0.9; // Neutral, slightly lower
      }

      // Get voices
      let voices = window.speechSynthesis.getVoices();
      
      // If no voices loaded yet, wait a bit
      if (voices.length === 0) {
        await new Promise(resolve => {
          window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve();
          };
          // Fallback timeout
          setTimeout(resolve, 100);
        });
      }

      console.log('Available voices:', voices.length);
      console.log('All voices:', voices.map(v => `${v.name} (${v.lang})`));

      // Find the best voice
      let selectedVoice = null;
      const langCode = locale.split('-')[0];

      if (voiceGender === 'male') {
        // Priority 1: Look for Hindi male voices first
        const hindiMalePatterns = [
          'hindi male', 'male hindi', 'ravi', 'hemant', 'prabhat'
        ];
        
        for (const pattern of hindiMalePatterns) {
          selectedVoice = voices.find(v => 
            v.name.toLowerCase().includes(pattern) &&
            v.lang.toLowerCase().includes('hi')
          );
          if (selectedVoice) {
            console.log('✅ Found Hindi male voice:', selectedVoice.name);
            break;
          }
        }

        // Priority 2: Any Hindi voice that's not female
        if (!selectedVoice) {
          const femalePatterns = [
            'female', 'woman', 'aditi', 'swara', 'lekha', 'heera'
          ];
          
          const hindiNonFemaleVoices = voices.filter(v => 
            v.lang.toLowerCase().includes('hi') &&
            !femalePatterns.some(p => v.name.toLowerCase().includes(p))
          );
          
          if (hindiNonFemaleVoices.length > 0) {
            selectedVoice = hindiNonFemaleVoices[0];
            console.log('✅ Selected Hindi non-female voice:', selectedVoice.name);
          }
        }

        // Priority 3: English male voices (will speak Hindi with accent)
        if (!selectedVoice) {
          const englishMalePatterns = ['male', 'daniel', 'thomas', 'james', 'david'];
          
          for (const pattern of englishMalePatterns) {
            selectedVoice = voices.find(v => 
              v.lang.toLowerCase().includes('en') &&
              v.name.toLowerCase().includes(pattern)
            );
            if (selectedVoice) {
              console.log('✅ Found English male voice for Hindi:', selectedVoice.name);
              break;
            }
          }
        }

        // Priority 4: Filter out ALL female voices from any language
        if (!selectedVoice) {
          const femalePatterns = [
            'female', 'woman', 'aditi', 'swara', 'lekha', 'heera', 
            'zira', 'samantha', 'victoria', 'karen', 'moira',
            'veena', 'tessa', 'fiona', 'susan', 'allison'
          ];
          
          const allNonFemaleVoices = voices.filter(v => 
            !femalePatterns.some(p => v.name.toLowerCase().includes(p))
          );
          
          if (allNonFemaleVoices.length > 0) {
            // Prefer ones with 'male' or neutral names
            selectedVoice = allNonFemaleVoices.find(v => 
              v.name.toLowerCase().includes('male') || 
              v.name.toLowerCase().includes('google') ||
              v.name.toLowerCase().includes('default')
            ) || allNonFemaleVoices[0];
            
            console.log('✅ Selected non-female voice:', selectedVoice.name);
          }
        }
      } else {
        // Look for female voices
        const femalePatterns = ['female', 'woman', 'aditi', 'swara', 'lekha', 'samantha', 'victoria'];
        for (const pattern of femalePatterns) {
          selectedVoice = voices.find(v => 
            v.lang.toLowerCase().includes(langCode) &&
            v.name.toLowerCase().includes(pattern)
          );
          if (selectedVoice) {
            console.log('✅ Found female voice:', selectedVoice.name);
            break;
          }
        }
      }

      // Priority 5: Fallback to any voice in the language
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.toLowerCase().includes(langCode));
        console.log('⚠️ Using fallback language voice:', selectedVoice?.name);
      }

      // Last resort: use first available voice
      if (!selectedVoice && voices.length > 0) {
        selectedVoice = voices[0];
        console.log('⚠️ Using first available voice:', selectedVoice.name);
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('🔊 Using voice:', selectedVoice.name, '|', selectedVoice.lang);
        toast.success(`🔊 Speaking: ${selectedVoice.name.substring(0, 20)}...`);
      } else {
        console.warn('⚠️ No voice found, using default');
        toast.warning("Using default voice");
      }

      utterance.onstart = () => {
        console.log('Speech started');
      };

      utterance.onend = () => {
        console.log('Speech ended');
        setIsSpeaking(false);
        setCurrentSpeakingIndex(null);
        speechSynthRef.current = null;
      };

      utterance.onerror = (event) => {
        console.error('Speech error:', event.error);
        setIsSpeaking(false);
        setCurrentSpeakingIndex(null);
        speechSynthRef.current = null;
        
        if (event.error === 'not-allowed') {
          toast.error("Speech permission denied. Please enable in browser settings.");
        } else if (event.error !== 'interrupted' && event.error !== 'canceled') {
          toast.error(`Speech error: ${event.error}`);
        }
      };

      // Chrome workaround: pause and resume to prevent cutoff
      utterance.onpause = () => {
        console.log('Speech paused');
      };

      utterance.onresume = () => {
        console.log('Speech resumed');
      };

      // Speak
      window.speechSynthesis.speak(utterance);
      
      // Chrome workaround: keep synthesis alive
      const intervalId = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(intervalId);
        } else {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 14000);

      utterance.onend = () => {
        clearInterval(intervalId);
        setIsSpeaking(false);
        setCurrentSpeakingIndex(null);
        speechSynthRef.current = null;
      };

    } catch (error) {
      console.error('Speech error:', error);
      setIsSpeaking(false);
      setCurrentSpeakingIndex(null);
      toast.error("Failed to speak. Please try again.");
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentSpeakingIndex(null);
    speechSynthRef.current = null;
    toast.info("Speech stopped");
  };

  // Speech-to-Text (Voice Input)
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition not supported. Try Chrome or Edge.");
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.lang = getLanguageLocale(language);
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);
      toast.success("🎤 Listening... Speak now!");

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Transcript:', transcript);
        if (liveVoiceMode) {
          setInput("");
          submitQuestion(transcript);
        } else {
          setInput(prev => prev + (prev ? ' ' : '') + transcript);
        }
        toast.success("✓ Voice captured!");
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          toast.error("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please allow permissions.");
        } else if (event.error === 'network') {
          toast.error("Network error. Check your connection.");
        } else {
          toast.error(`Recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        console.log('Recognition ended');
        recognitionRef.current = null;
        setIsListening(false);
      };

      recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
      toast.error("Failed to start voice input.");
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    toast.info("Microphone stopped");
  };

  const submitQuestion = async (questionText) => {
    const cleanQuestion = questionText.trim();

    if (isLoading || !cleanQuestion) {
      toast.error("Please enter a question");
      return;
    }

    const userMsg = { role: "user", content: cleanQuestion };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await askFromTranscript(cleanQuestion);
      const assistantMsg = {
        role: "assistant",
        content: result?.answer || "🙏 I couldn't find an answer in the transcript. Please ask another question.",
        sources: result?.sources || [],
        providers: result?.providers ? result.providers.join(', ') : "AI",
        sourceCount: result?.sourceCount || 0
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
      
      if (result?.sourceCount > 0) {
        toast.success(`✓ Answer from ${result.sourceCount} pravachan(s)!`);
      } else {
        toast.success("✓ Answer received!");
      }
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

  // Handle question submission
  const handleSubmit = async () => {
    submitQuestion(input);
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
      
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg backdrop-blur-md border ${
          showToast.type === 'success' ? 'bg-green-500/20 border-green-400 text-green-100' :
          showToast.type === 'error' ? 'bg-red-500/20 border-red-400 text-red-100' :
          showToast.type === 'warning' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-100' :
          'bg-blue-500/20 border-blue-400 text-blue-100'
        } animate-in slide-in-from-top duration-300`}>
          <p className="text-sm font-medium">{showToast.message}</p>
        </div>
      )}

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
            onClick={() => {
              setLiveVoiceMode((value) => !value);
              setAutoPlay(true);
              setVoiceEnabled(true);
            }}
            className={`border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 ${
              liveVoiceMode ? "bg-yellow-500/30" : "bg-yellow-400/10"
            }`}
          >
            <Radio className="w-4 h-4 mr-1" /> Live Voice
          </Button>
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
                Voice Gender
              </label>
              <select
                value={voiceGender}
                onChange={(e) => setVoiceGender(e.target.value)}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="male">🧔 Male (Sadhu/Devotional)</option>
                <option value="female">👩 Female</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-yellow-300 mb-1">
                Live Voice Conversation
              </label>
              <select
                value={liveVoiceMode ? "enabled" : "disabled"}
                onChange={(e) => setLiveVoiceMode(e.target.value === "enabled")}
                className="w-full p-2 rounded-lg border border-yellow-400 bg-black/70 text-yellow-100 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

          <div className="mt-4 p-3 bg-yellow-900/20 rounded-lg border border-yellow-400/30">
            <p className="text-xs text-yellow-300 mb-2">
              💡 <strong>Tip:</strong> For best results, use Chrome or Edge browser. Voice selection depends on your system's installed voices.
            </p>
            <p className="text-xs text-yellow-400/70">
              If voice isn't working, check browser console (F12) for available voices and permissions.
            </p>
          </div>
        </div>
      )}

      <VideoSectionPlayer source={activeSource} onClose={() => setActiveSource(null)} />

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
            <MessageBubble message={message} onPlaySource={setActiveSource} />
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
                  disabled={isSpeaking && currentSpeakingIndex !== index}
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
