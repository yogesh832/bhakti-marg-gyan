// Quick end-to-end check of /api/ask (avoids shell UTF-8 mangling)
const tests = [
  { question: "मेरे अंदर बहुत अहंकार है, इसे कैसे दूर करूं?", language: "hindi", tone: "premand" },
  { question: "how to remove ego and pride from within?", language: "english", tone: "brief" },
  { question: "नाम जप करने का सही तरीका क्या है?", language: "hindi", tone: "brief" },
];

(async () => {
  for (const t of tests) {
    const start = Date.now();
    try {
      const res = await fetch("http://127.0.0.1:5001/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      const j = await res.json();
      console.log("=".repeat(70));
      console.log("Q:", t.question);
      console.log("HTTP", res.status, "| total wall:", Date.now() - start, "ms | timing:", JSON.stringify(j.timing || {}));
      console.log("providers:", JSON.stringify(j.providers), "| candidates:", j.candidateVideos, "| sources:", j.sourceCount);
      console.log("answer:", (j.answer || j.error || "").slice(0, 700).replace(/\n/g, " "));
      (j.sources || []).forEach((s) =>
        console.log(`  - [${s.startTime}s] score=${s.score} — ${(s.title || "").slice(0, 50)} — ${s.url}`)
      );
    } catch (e) {
      console.log("Q:", t.question, "FAILED:", e.message);
    }
  }
})();
