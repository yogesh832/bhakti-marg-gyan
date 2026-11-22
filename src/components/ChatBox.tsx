"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Settings2, Trash2, Volume2, VolumeX, Mic, StopCircle, PlayCircle, X, Radio, ChevronDown, ChevronUp } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV
  ? "http://localhost:5001"
  : "https://bhakti-marg-gyan.onrender.com");

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

// Compact label for a source: "#651 · 29-08-2024" instead of the full long title
// (full title stays in the tooltip). Keeps the UI tidy.
const shortTitle = (source) => {
  const title = source?.title || "";
  const num = title.match(/#(\d+)/)?.[1];
  const date = title.match(/(\d{2}-\d{2}-\d{4})/)?.[1];
  if (num) return date ? `#${num} · ${date}` : `#${num}`;
  return title.length > 45 ? `${title.slice(0, 45)}…` : title || `Video ${source?.videoId || ""}`;
};

// Turn inline citations in the answer text into clickable links.
// Handles "[Source 1]", "[स्रोत 1]", "(वीडियो #708)", "वीडियो #708" — linked to
// the matching source's YouTube URL (with timestamp). Short label, full title in tooltip.
const CITATION_SPLIT_RE = /(\[(?:Source|स्रोत)\s*\d+\]|\(\s*वीडियो\s*#\d+\s*\)|वीडियो\s*#\d+)/g;

const renderContentWithLinks = (content, sources = []) => {
  if (!sources.length) return content;

  return content.split(CITATION_SPLIT_RE).map((part, i) => {
    let match = part.match(/\[(?:Source|स्रोत)\s*(\d+)\]/i);
    let source = match ? sources[Number(match[1]) - 1] : undefined;

    if (!source) {
      match = part.match(/वीडियो\s*#(\d+)/);
      if (match) source = sources.find((s) => (s.title || "").includes(`#${match[1]}`));
    }

    if (!source || !match) return part;

    return (
      <a
        key={i}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.title}
        className="text-yellow-300 hover:text-yellow-100 underline decoration-yellow-400/50 underline-offset-2"
      >
        🎥 {shortTitle(source)}
      </a>
    );
  });
};

// Read-more toggle labels in the selected language
const READ_MORE_LABELS = {
  hindi: { more: "और समझें", less: "संक्षिप्त करें" },
  english: { more: "Read more", less: "Show less" },
  tamil: { more: "மேலும் அறிய", less: "சுருக்கமாக" },
  malayalam: { more: "കൂടുതൽ മനസ്സിലാക്കൂ", less: "ചുരുക്കം" },
  bengali: { more: "আরও বুঝুন", less: "সংক্ষেপে" },
  gujarati: { more: "વધુ સમજો", less: "ટૂંકમાં" },
  kannada: { more: "ಇನ್ನಷ್ಟು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ", less: "ಸಂಕ್ಷಿಪ್ತವಾಗಿ" },
};

const stripAnswerLabel = (text = "") =>
  text
    .replace(/^\s*(SHORT ANSWER|DETAILED ANSWER|NORMAL ANSWER|संक्षिप्त उत्तर|विस्तृत उत्तर)\s*[:\-–—]?\s*/i, "")
    .trim();

const splitAssistantAnswer = (content = "") => {
  const normalized = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

  if (!normalized) return { shortAnswer: "", detailedAnswer: "" };

  if (normalized.includes("<<<more>>>")) {
    const [first, ...rest] = normalized.split("<<<more>>>");
    return {
      shortAnswer: stripAnswerLabel(first),
      detailedAnswer: stripAnswerLabel(rest.join("<<<more>>>")),
    };
  }

  const detailedMatch = normalized.match(/\n?\s*(?:DETAILED ANSWER|विस्तृत उत्तर)\s*[:\-–—]\s*/i);
  if (detailedMatch?.index && detailedMatch.index > 0) {
    return {
      shortAnswer: stripAnswerLabel(normalized.slice(0, detailedMatch.index)),
      detailedAnswer: stripAnswerLabel(normalized.slice(detailedMatch.index + detailedMatch[0].length)),
    };
  }

  return { shortAnswer: stripAnswerLabel(normalized), detailedAnswer: "" };
};

const cleanTextForSpeech = (text = "") =>
  splitAssistantAnswer(text)
    .shortAnswer.replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[(?:Source|स्रोत)\s*\d+\]/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[🙏🕉️✨💫🌟🎥📺✓▲▼]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();

const SPIRITUAL_QUESTION_RE =
  /(adhyat|adhyatm|spiritual|bhakti|bhagwan|god|krishna|radha|ram|naam|nam jap|jap|guru|sadhu|sant|shastra|ved|gita|geeta|upanishad|satsang|pravachan|premaanand|premanand|maharaj|bhajan|seva|sadhana|dhyan|meditation|maya|moksh|mukti|atma|aatma|karma|paap|punya|dharma|mantra|mandir|vrindavan|वेद|शास्त्र|गीता|उपनिषद|भक्ति|भगवान|कृष्ण|राधा|राम|नाम|जप|गुरु|संत|महाराज|सत्संग|प्रवचन|भजन|सेवा|साधना|ध्यान|माया|मोक्ष|मुक्ति|आत्मा|कर्म|पाप|पुण्य|धर्म|मंत्र|मंदिर|वृंदावन)/i;

const isSpiritualQuestion = (question = "") => SPIRITUAL_QUESTION_RE.test(question);

const DEVANAGARI_ENGLISH_RE =
  /(कैन|वी|हैव|हेव|कन्वर्सेशन|कनवरसेशन|टॉक|इंग्लिश|व्हाट|वॉट|इज़|इज|लव|अंडरस्टैंड|देयर|प्लीज|यस|नो|ओके|हेलो|हाय)/i;

const normalizeLiveQuestion = (question = "") =>
  question
    .toLowerCase()
    .replace(/[?.!,।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getLiveReplyLanguage = (question = "", selectedLanguage = "auto") => {
  const text = question.trim();
  const lower = text.toLowerCase();

  if (
    /\b(english|speak english|talk english|can we talk|can we have|conversation|what is|love|understand)\b/i.test(lower) ||
    /(इंग्लिश|अंग्रेजी|अंग्रेज़ी|इंगलिश)/.test(text) ||
    DEVANAGARI_ENGLISH_RE.test(text)
  ) {
    return "english";
  }
  if (/[஀-௿]/.test(text)) return "tamil";
  if (/[ഀ-ൿ]/.test(text)) return "malayalam";
  if (/[ঀ-৿]/.test(text)) return "bengali";
  if (/[઀-૿]/.test(text)) return "gujarati";
  if (/[ಀ-೿]/.test(text)) return "kannada";
  if (/[ऀ-ॿ]/.test(text)) return "hindi";
  if (/[a-z]/i.test(text)) return "english";
  return selectedLanguage === "auto" ? "hindi" : selectedLanguage;
};

const getLiveConversationReply = (question = "", selectedLanguage = "auto") => {
  const text = question.trim();
  const lower = text.toLowerCase();
  const normalized = normalizeLiveQuestion(text);
  const replyLanguage = getLiveReplyLanguage(text, selectedLanguage);
  const isGreeting = /\b(hi|hello|hey|namaste|radhe|radhey|kaise ho|how are you)\b/i.test(lower) || /(हाय|हेलो|नमस्ते|राधे)/.test(text);
  const asksForConversation =
    /\b(can we talk|can we have.*conversation|conversation|talk to me)\b/i.test(lower) ||
    /(कैन.*वी.*(कन्वर्सेशन|कनवरसेशन|टॉक)|कन्वर्सेशन)/.test(normalized);
  const asksAboutLove =
    /\b(what is love|what's love|understand love|meaning of love)\b/i.test(lower) ||
    /(व्हाट|वॉट).*(लव)|(लव).*(अंडरस्टैंड|समझ)/.test(normalized);

  if (replyLanguage === "english") {
    if (asksForConversation) {
      return "Yes, we can have a conversation. Speak naturally in any language. I will answer normally, and when your question is spiritual I will check Premaanand Ji Maharaj's pravachan sources.";
    }
    if (asksAboutLove) {
      return "Love is care that wants the good of someone without trying to own them. It feels warm, but it also shows up as patience, respect, responsibility, and truth. If you are not able to understand it right now, start by noticing this: real love gives peace and clarity; attachment usually brings fear, control, and restlessness.";
    }
  }

  const replies = {
    english: {
      greeting: "Yes, we can talk in English. I will reply in whatever language you use. If the question is spiritual, I will check Premaanand Ji Maharaj's pravachan sources.",
      normal: "Yes. No language boundary now. I will reply in the language you speak, and only use video sources when the question is spiritual.",
    },
    hindi: {
      greeting: "हाँ, मैं सुन रहा हूँ। आप जिस भाषा में बोलेंगे, मैं उसी के हिसाब से उत्तर दूँगा। आध्यात्मिक प्रश्न होगा तो प्रवचन स्रोतों से देखूँगा।",
      normal: "अब भाषा की सीमा नहीं है। आप जिस भाषा में बोलेंगे, मैं उसी में उत्तर देने की कोशिश करूँगा; आध्यात्मिक प्रश्न होगा तो वीडियो स्रोत खोलूँगा।",
    },
    tamil: {
      greeting: "ஆம், நான் கேட்கிறேன். நீங்கள் எந்த மொழியில் பேசினாலும் அதற்கேற்றபடி பதிலளிப்பேன்.",
      normal: "இனி மொழி வரம்பு இல்லை. ஆன்மிகக் கேள்வி என்றால் மட்டும் வீடியோ ஆதாரங்களைப் பார்க்கிறேன்.",
    },
    malayalam: {
      greeting: "അതെ, ഞാൻ കേൾക്കുന്നു. നിങ്ങൾ സംസാരിക്കുന്ന ഭാഷയ്ക്ക് അനുസരിച്ച് മറുപടി നൽകാം.",
      normal: "ഇനി ഭാഷാ പരിധിയില്ല. ആത്മീയ ചോദ്യം ആണെങ്കിൽ മാത്രം വീഡിയോ ഉറവിടങ്ങൾ നോക്കും.",
    },
    bengali: {
      greeting: "হ্যাঁ, আমি শুনছি। আপনি যে ভাষায় বলবেন, আমি সেই অনুযায়ী উত্তর দেব।",
      normal: "এখন ভাষার কোনো সীমা নেই। আধ্যাত্মিক প্রশ্ন হলে শুধু ভিডিও উৎস দেখব।",
    },
    gujarati: {
      greeting: "હા, હું સાંભળી રહ્યો છું. તમે જે ભાષામાં બોલશો, હું તે મુજબ જવાબ આપીશ.",
      normal: "હવે ભાષાની કોઈ મર્યાદા નથી. આધ્યાત્મિક પ્રશ્ન હશે ત્યારે જ વીડિયો સ્રોત જોઈશ.",
    },
    kannada: {
      greeting: "ಹೌದು, ನಾನು ಕೇಳುತ್ತಿದ್ದೇನೆ. ನೀವು ಯಾವ ಭಾಷೆಯಲ್ಲಿ ಮಾತನಾಡುತ್ತೀರೋ ಅದಕ್ಕೆ ತಕ್ಕಂತೆ ಉತ್ತರಿಸುತ್ತೇನೆ.",
      normal: "ಇನ್ನು ಭಾಷೆಯ ಮಿತಿ ಇಲ್ಲ. ಆಧ್ಯಾತ್ಮಿಕ ಪ್ರಶ್ನೆಯಾದರೆ ಮಾತ್ರ ವೀಡಿಯೊ ಮೂಲಗಳನ್ನು ನೋಡುತ್ತೇನೆ.",
    },
  };

  const selectedReplies = replies[replyLanguage] || replies.english;
  return isGreeting ? selectedReplies.greeting : selectedReplies.normal;
};

const LANGUAGE_LABELS = {
  auto: "Auto",
  hindi: "Hindi",
  english: "English",
  tamil: "Tamil",
  malayalam: "Malayalam",
  bengali: "Bengali",
  gujarati: "Gujarati",
  kannada: "Kannada",
};

const VoiceCallPanel = ({
  active,
  isListening,
  isLoading,
  isSpeaking,
  language,
  onStart,
  onStop,
  onToggleMic,
}) => {
  const status = active
    ? isListening
      ? "LISTENING..."
      : isLoading
        ? "THINKING..."
        : isSpeaking
          ? "SPEAKING..."
          : "READY..."
    : "VOICE READY";

  const subtitle = active
    ? isListening
      ? "Ask normally. Spiritual questions use pravachan sources."
      : isLoading
        ? "Checking whether this needs Premaanand Ji's video teachings."
        : isSpeaking
          ? "The assistant will listen again after the answer."
          : "Tap the mic when you are ready to speak."
    : "Start a hands-free conversation with voice.";

  return (
    <div
      className={`relative z-10 mb-5 overflow-hidden border border-yellow-300/25 bg-[#090720]/95 shadow-[0_24px_70px_rgba(0,0,0,0.38)] ${
        active ? "min-h-[520px] rounded-[28px]" : "rounded-2xl"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(250,204,21,0.16),transparent_35%),radial-gradient(circle_at_70%_25%,rgba(56,189,248,0.18),transparent_32%)]" />
      <div className="pointer-events-none absolute left-4 top-4 h-5 w-5 rounded-tl-xl border-l-2 border-t-2 border-white/90" />

      <div className="relative flex items-start justify-between gap-4 px-5 py-5">
        <div>
          <h3 className="text-base font-bold text-white">Premaanand Voice</h3>
          <p className="mt-1 text-xs text-white/62">Your spiritual assistant + voice</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white">
            {LANGUAGE_LABELS[language] || "Auto"}
          </span>
          <button
            type="button"
            onClick={active ? onStop : onStart}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/18"
            title={active ? "Close live voice" : "Start live voice"}
          >
            {active ? <X className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {active ? (
        <div className="relative flex min-h-[395px] flex-col items-center justify-between px-6 pb-7 pt-6">
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className={`voice-orb ${isListening ? "voice-orb-listening" : ""} ${isSpeaking ? "voice-orb-speaking" : ""}`}>
              <div className="voice-orb-shine" />
            </div>
            <p className="mt-10 text-center text-[0.72rem] font-bold tracking-[0.32em] text-white/48">
              {status}
            </p>
            <p className="mt-3 max-w-xs text-center text-xs leading-relaxed text-white/48">
              {subtitle}
            </p>
          </div>

          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={onToggleMic}
              disabled={isLoading || isSpeaking}
              className={`inline-flex h-14 w-14 items-center justify-center rounded-full transition ${
                isListening
                  ? "bg-white/18 text-white ring-2 ring-white/20"
                  : "bg-white/12 text-white hover:bg-white/20"
              } disabled:cursor-not-allowed disabled:opacity-45`}
              title={isListening ? "Stop listening" : "Start listening"}
            >
              {isListening ? <StopCircle className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_12px_30px_rgba(244,63,94,0.36)] transition hover:bg-rose-400"
              title="End live conversation"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-yellow-100">Live conversation</p>
            <p className="mt-1 text-xs text-yellow-200/65">{subtitle}</p>
          </div>
          <Button
            type="button"
            onClick={onStart}
            className="rounded-full bg-yellow-500 px-4 text-black hover:bg-yellow-400"
          >
            <Mic className="mr-2 h-4 w-4" /> Start talking
          </Button>
        </div>
      )}
    </div>
  );
};

const MessageBubble = ({ message, onPlaySource, language = "hindi" }) => {
  const [showSources, setShowSources] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const isUser = message.role === "user";

  const { shortAnswer, detailedAnswer } = isUser
    ? { shortAnswer: message.content, detailedAnswer: "" }
    : splitAssistantAnswer(message.content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`
          w-fit max-w-[92%] sm:max-w-[82%] p-4 rounded-2xl
          ${
            isUser
              ? "bg-gradient-to-br from-yellow-500/30 to-amber-500/20 border border-yellow-400/40 text-yellow-100"
              : "bg-gradient-to-br from-yellow-900/40 to-yellow-800/30 border border-yellow-400/30 text-yellow-50"
          }
          shadow-lg backdrop-blur-sm
        `}
      >
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {renderContentWithLinks(shortAnswer, message.sources)}
        </div>

        {detailedAnswer && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="inline-flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1.5 text-xs text-yellow-200 hover:bg-yellow-400/20 hover:text-yellow-50 font-semibold transition-colors"
            >
              {(() => {
                const labels = READ_MORE_LABELS[language] || READ_MORE_LABELS.hindi;
                return (
                  <>
                    {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showMore ? labels.less : labels.more}
                  </>
                );
              })()}
            </button>
            {showMore && (
              <div className="mt-2 pt-2 border-t border-yellow-400/20 whitespace-pre-wrap break-words leading-relaxed text-yellow-50/90">
                {renderContentWithLinks(detailedAnswer, message.sources)}
              </div>
            )}
          </div>
        )}
        
        {/* Source Attribution - Dropdown */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-yellow-400/20">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center justify-between w-full text-xs text-yellow-400/90 font-semibold hover:text-yellow-300 transition-colors"
            >
              <span>प्रवचन स्रोत ({message.sources.length})</span>
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
                      title={source.title}
                      className="text-xs text-yellow-300 hover:text-yellow-100 underline inline-block mt-1"
                    >
                      🎥 {shortTitle(source)}
                    </a>
                    {source.quote && (
                      <details className="mt-2 text-xs text-yellow-100/75">
                        <summary className="cursor-pointer text-yellow-200 hover:text-yellow-50">
                          Transcript passage
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{source.quote}</p>
                        {source.continuation && (
                          <p className="mt-2 whitespace-pre-wrap border-t border-yellow-400/20 pt-2 leading-relaxed">
                            {source.continuation}
                          </p>
                        )}
                      </details>
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
  const [liveConversationActive, setLiveConversationActive] = useState(false);

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
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const liveConversationRef = useRef(false);

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
  const askFromTranscript = async (question, languageOverride) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language: languageOverride || language, tone }),
      });

      const data = await response.json();
      if (!response.ok || data?.success === false || data?.error) {
        throw new Error(data?.error || data?.message || "Server se response nahi aa raha. Dobara try karein.");
      }
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
  const speakText = async (text, messageIndex, onComplete) => {
    if (!voiceEnabled) {
      toast.error("Voice is disabled. Enable it in preferences.");
      return;
    }

    try {
      // Stop any ongoing speech
      stopSpeaking(false);

      setIsSpeaking(true);
      setCurrentSpeakingIndex(messageIndex);

      const cleanText = cleanTextForSpeech(text);

      if (!cleanText) {
        toast.error("Nothing readable found in this answer.");
        setIsSpeaking(false);
        setCurrentSpeakingIndex(null);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, voiceGender }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);
          audioUrlRef.current = audioUrl;
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            audioUrlRef.current = null;
            audioRef.current = null;
            setIsSpeaking(false);
            setCurrentSpeakingIndex(null);
            onComplete?.();
          };

          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            audioUrlRef.current = null;
            audioRef.current = null;
            setIsSpeaking(false);
            setCurrentSpeakingIndex(null);
            toast.error("Audio playback failed.");
          };

          await audio.play();
          toast.success("Speaking with ElevenLabs voice");
          return;
        }

        console.warn("ElevenLabs TTS unavailable, falling back to browser voice.");
      } catch (ttsError) {
        console.warn("ElevenLabs TTS failed, falling back to browser voice:", ttsError);
      }

      if (!window.speechSynthesis) {
        toast.error("Text-to-speech not supported in your browser.");
        setIsSpeaking(false);
        setCurrentSpeakingIndex(null);
        return;
      }

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
        onComplete?.();
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
        onComplete?.();
      };

    } catch (error) {
      console.error('Speech error:', error);
      setIsSpeaking(false);
      setCurrentSpeakingIndex(null);
      toast.error("Failed to speak. Please try again.");
    }
  };

  // Stop speaking
  const stopSpeaking = (showNotice = true) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentSpeakingIndex(null);
    speechSynthRef.current = null;
    if (showNotice) toast.info("Speech stopped");
  };

  const restartLiveListening = () => {
    if (!liveConversationRef.current) return;
    setTimeout(() => {
      if (liveConversationRef.current && !isLoading && !recognitionRef.current) {
        startListening({ submitOnResult: true, quiet: true });
      }
    }, 550);
  };

  // Speech-to-Text (Voice Input)
  const startListening = ({ submitOnResult = liveConversationRef.current, quiet = false } = {}) => {
    if (recognitionRef.current) return;

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition not supported. Try Chrome or Edge.");
      setLiveConversationActive(false);
      liveConversationRef.current = false;
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.lang = language === "auto" ? (navigator.language || "hi-IN") : getLanguageLocale(language);
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);
      if (!quiet) toast.success("Listening... Speak now!");

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Transcript:', transcript);
        if (submitOnResult) {
          setInput("");
          submitQuestion(transcript, { fromLiveConversation: true });
        } else {
          setInput(prev => prev + (prev ? ' ' : '') + transcript);
        }
        toast.success("Voice captured");
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'no-speech') {
          toast.error("No speech detected. Please try again.");
        } else if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please allow permissions.");
          setLiveConversationActive(false);
          liveConversationRef.current = false;
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

  const stopListening = (showNotice = true) => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    if (showNotice) toast.info("Microphone stopped");
  };

  const startLiveConversation = () => {
    setLiveVoiceMode(true);
    setVoiceEnabled(true);
    setAutoPlay(true);
    liveConversationRef.current = true;
    setLiveConversationActive(true);
    stopSpeaking(false);
    startListening({ submitOnResult: true });
  };

  const stopLiveConversation = () => {
    liveConversationRef.current = false;
    setLiveConversationActive(false);
    stopListening(false);
    stopSpeaking(false);
    toast.info("Live conversation stopped");
  };

  const submitQuestion = async (questionText, options = {}) => {
    const { fromLiveConversation = false } = options;
    const cleanQuestion = questionText.trim();

    if (isLoading || !cleanQuestion) {
      toast.error("Please enter a question");
      return;
    }

    const userMsg = { role: "user", content: cleanQuestion };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (fromLiveConversation && !isSpiritualQuestion(cleanQuestion)) {
      const assistantMsg = {
        role: "assistant",
        content: getLiveConversationReply(cleanQuestion, language),
        sources: [],
        providers: "Live conversation",
        sourceCount: 0,
      };

      setMessages((prev) => {
        const newMessages = [...prev, assistantMsg];
        setTimeout(() => {
          speakText(assistantMsg.content, newMessages.length - 1, restartLiveListening);
        }, 250);
        return newMessages;
      });

      return;
    }

    setIsLoading(true);

    try {
      const result = await askFromTranscript(cleanQuestion, fromLiveConversation ? "auto" : undefined);
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
        const shouldSpeak = (autoPlay || fromLiveConversation) && voiceEnabled && result?.answer;
        if (shouldSpeak) {
          setTimeout(() => {
            speakText(
              assistantMsg.content,
              newMessages.length - 1,
              fromLiveConversation ? restartLiveListening : undefined
            );
          }, 500);
        } else if (fromLiveConversation) {
          restartLiveListening();
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
          content: `⚠️ ${error instanceof Error ? error.message : "Server se connection nahi ho paaya. Dobara try karein."}`,
        },
      ]);
      toast.error("Failed to get response");
      if (fromLiveConversation) restartLiveListening();
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
    liveConversationRef.current = false;
    setLiveConversationActive(false);
    stopListening(false);
    stopSpeaking();
    toast.success("Chat history cleared!");
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 rounded-2xl border border-yellow-400/40 shadow-[0_0_40px_rgba(255,215,0,0.25)] bg-gradient-to-br from-yellow-200/10 via-yellow-100/5 to-transparent backdrop-blur-2xl text-yellow-100 relative overflow-hidden transition-all duration-300">
      
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 p-4 rounded-lg shadow-lg backdrop-blur-md border ${
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
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4 border-b border-yellow-400/30 pb-3 relative z-10">
        <h2 className="text-base sm:text-lg font-semibold text-yellow-300">
          🕉️ Premaanand Ji Chat Assistant
        </h2>

        <div className="grid grid-cols-3 sm:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (liveConversationActive) {
                stopLiveConversation();
              } else {
                startLiveConversation();
              }
            }}
            className={`border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 px-2 sm:px-3 ${
              liveConversationActive ? "bg-red-500/30 border-red-300" : liveVoiceMode ? "bg-yellow-500/30" : "bg-yellow-400/10"
            }`}
            title="Toggle live voice conversation"
          >
            {liveConversationActive ? <StopCircle className="w-4 h-4 sm:mr-1" /> : <Radio className="w-4 h-4 sm:mr-1" />}
            <span className="hidden sm:inline">{liveConversationActive ? "Stop Live" : "Live Voice"}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((p) => !p)}
            className="border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 bg-yellow-400/10 px-2 sm:px-3"
            title="Preferences"
          >
            <Settings2 className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Preferences</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            className="border-yellow-400 text-yellow-200 hover:bg-yellow-800/10 bg-yellow-400/10 px-2 sm:px-3"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Clear</span>
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
                <option value="premand">Premaanand Ji Style (Devotional)</option>
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

      <VoiceCallPanel
        active={liveConversationActive}
        isListening={isListening}
        isLoading={isLoading}
        isSpeaking={isSpeaking}
        language={language}
        onStart={startLiveConversation}
        onStop={stopLiveConversation}
        onToggleMic={() => {
          if (isListening) {
            stopListening();
          } else {
            startListening({ submitOnResult: true });
          }
        }}
      />

      {/* Chat Section */}
      <div className="space-y-5 mb-5 h-[58vh] min-h-[360px] overflow-y-auto px-1 sm:px-2 relative z-10 scroll-smooth">
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
            <MessageBubble message={message} onPlaySource={setActiveSource} language={language} />
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
                  className="border-yellow-400/60 text-yellow-200 hover:bg-yellow-800/20 bg-yellow-400/10 transition-all rounded-full"
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
            placeholder={liveVoiceMode ? "Live voice is on. Speak or type your question..." : "Ask your question... type or use mic"}
            className="min-h-[88px] sm:min-h-[100px] pr-14 resize-none bg-black/40 border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/70 focus:border-yellow-500 transition-all rounded-xl text-yellow-100 placeholder:text-yellow-300/50 backdrop-blur-lg"
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
            className={`absolute right-2 bottom-2 p-2 h-11 w-11 rounded-full transition-all ${
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
          className="w-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 hover:opacity-90 transition-opacity text-black font-semibold tracking-wide rounded-xl py-5 sm:py-6 shadow-[0_0_20px_rgba(255,215,0,0.4)] disabled:opacity-50"
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
