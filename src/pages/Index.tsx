"use client";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import ChatBox from "@/components/ChatBox";
import { Flower2 } from "lucide-react";
import { useMemo } from "react";

const hindiWords = [
  "राधे", "कृष्ण", "राधे राधे", "श्रीकृष्ण", "मुरारी", "श्याम", "घनश्याम",
  "राधे नाम", "गोविंद", "जय श्री कृष्ण", "कन्हैया", "राधे गोविंद",
  "राधे रानी", "राधारमण", "बंसीवाले", "नंदलाल", "गोपीनाथ", "रासबिहारी",
  "राधिका", "माधव", "मुरलीधर", "राधे श्याम", "श्री राधे", "जय राधे",
];

const Index = () => {
  const scrollingWords = useMemo(() => [...hindiWords, ...hindiWords], []);

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* 🌼 Animated background words (cover full page) */}
      <div className="absolute inset-0 overflow-hidden z-0">
        {[...Array(12)].map((_, i) => {
          const isEven = i % 2 === 0;
          return (
            <motion.div
              key={i}
              className="absolute whitespace-nowrap select-none w-full"
              style={{
                top: `${(i / 12) * 100}%`,
              }}
              animate={{
                x: isEven ? ["0%", "-100%"] : ["-100%", "0%"],
              }}
              transition={{
                repeat: Infinity,
                duration: 30 + i * 6,
                ease: "linear",
              }}
            >
              {scrollingWords.map((word, index) => (
                <span
                  key={index}
                  className="text-yellow-300 text-3xl md:text-4xl mx-10 font-semibold opacity-50 drop-shadow-[0_0_10px_#facc15]"
                >
                  “{word}”
                </span>
              ))}
            </motion.div>
          );
        })}
      </div>

      {/* 🌺 Foreground Content */}
      <div className="relative z-10 bg-gradient-to-b from-black/40 via-black/30 to-black/40 min-h-screen">
        <Navbar />

        <main className="container mx-auto px-4 pt-32 pb-16">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <Flower2 className="w-16 h-16 text-yellow-300 animate-pulse drop-shadow-[0_0_12px_#facc15]" />
                <div className="absolute inset-0 blur-md bg-yellow-400/40 animate-pulse rounded-full" />
              </div>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-200 via-yellow-300 to-yellow-100 bg-clip-text text-transparent">
              Ask Maharaj Ji 🙏
            </h1>

            <p className="text-lg text-gray-200 max-w-2xl mx-auto leading-relaxed">
              Seek spiritual guidance through the divine teachings of Premanand Maharaj Ji.
              <br />
              Ask your questions and receive wisdom from the path of Bhakti.
            </p>
          </div>

          <div>
            <ChatBox />
          </div>

          <div className="mt-16 text-center text-sm text-gray-300">
            <p>🪔 All answers are inspired by the sacred teachings of Premanand Maharaj Ji 🪔</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
