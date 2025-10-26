"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const FloatingNames = () => {
  const [names, setNames] = useState([]);

  useEffect(() => {
    // 50+ floating items
    const generated = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      text: Math.random() > 0.5 ? "राधा" : "कृष्ण",
      angle: Math.random() * 360,
      radius: 100 + Math.random() * 400, // distance from center
      duration: 20 + Math.random() * 15,
      size: 18 + Math.random() * 12,
      opacity: 0.4 + Math.random() * 0.6,
    }));
    setNames(generated);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      {names.map((name) => (
        <motion.span
          key={name.id}
          className="absolute font-[Tiro Devanagari Hindi] text-yellow-300"
          style={{
            fontSize: `${name.size}px`,
            opacity: name.opacity,
            filter: "blur(0.3px)",
          }}
          animate={{
            rotate: 360,
          }}
          transition={{
            repeat: Infinity,
            ease: "linear",
            duration: name.duration,
          }}
        >
          <motion.span
            style={{
              position: "absolute",
              transform: `rotate(${name.angle}deg) translate(${name.radius}px)`,
            }}
          >
            {name.text}
          </motion.span>
        </motion.span>
      ))}
    </div>
  );
};

export default FloatingNames;
