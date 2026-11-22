// Broader test set for /api/ask
const tests = [
  { question: "भक्ति क्या है और कैसे करें?", language: "hindi", tone: "premand" },
  { question: "bhakti kya h kese kru", language: "hindi", tone: "premand" },
  { question: "मन बहुत भटकता है, नाम जप में नहीं लगता। क्या करूं?", language: "hindi", tone: "premand" },
  { question: "माया से कैसे बचें?", language: "hindi", tone: "brief" },
  { question: "guru ki kripa kaise milti hai", language: "hindi", tone: "premand" },
  { question: "how should a grihastha practice bhakti daily?", language: "hindi", tone: "brief" },
  { question: "क्रोध आता है तो क्या करें?", language: "hindi", tone: "premand" },
  { question: "what is the best way to cook rice?", language: "english", tone: "brief" },
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
      console.log("=".repeat(74));
      console.log("Q:", t.question);
      console.log(`HTTP ${res.status} | wall ${Date.now() - start}ms | server ${JSON.stringify(j.timing || {})}`);
      console.log(`providers: ${JSON.stringify(j.providers)} | candidates: ${j.candidateVideos} | sources: ${j.sourceCount}`);
      console.log("ANSWER:", (j.answer || j.error || "").slice(0, 450).replace(/\s+/g, " "));
      (j.sources || []).forEach((s, i) =>
        console.log(`  [${i + 1}] ${s.startTime}s | score ${s.score} | ${(s.title || "").slice(0, 45)} | ${s.url}`)
      );
    } catch (e) {
      console.log("Q:", t.question, "FAILED:", e.message);
    }
  }
})();
