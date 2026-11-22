const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseJson3, validate, buildSafeChunks, requireQuality } = require("../services/transcriptQuality");
test("rounded media duration preserves final source start but not out-of-range timing",()=>{
 const data=t=>({events:[{tStartMs:t,dDurationMs:1000,segs:[{utf8:"है"}]}]});
 const a=parseJson3(data(10159),10);
 assert.equal(a[0].startTime,10.159);assert.equal(a[0].endTime,10.5);
 assert(!validate(a,10).reasons.includes("invalid_timestamps"));
 assert(validate(parseJson3(data(10600),10),10).reasons.includes("invalid_timestamps"));
});
test("same rendering timestamp dedups; genuine repeats at later times survive", () => {
  const event = (t) => ({ tStartMs: t, dDurationMs: 1000, segs: [{ utf8: "राधा राधा" }] });
  const s = parseJson3({ events: [event(0), event(0), event(1000), event(2000)] }, 4);
  assert.equal(s.length, 3);
  assert.equal(s.map(x => x.text).join(" "), "राधा राधा राधा राधा राधा राधा");
  assert.equal(validate(s, 4).passed, true);
});
test("empty, invalid timing and partial coverage fail closed", () => {
  assert.throws(() => requireQuality([]), /quality rejected/);
  assert.equal(validate([{ text: "a", startTime: 2, endTime: 1 }]).passed, false);
  assert.equal(validate([{ text: "कुछ शब्द", startTime: 0, endTime: 10 }], 300).passed, false);
});
test("triplicated long caption lines are rejected without rewriting words", () => {
  const text = Array(20).fill("भगवान के चरणों में मन लगाना चाहिए").join(" ");
  assert.equal(validate([{ text, startTime: 0, endTime: 100 }], 100).passed, false);
});
test("chunking preserves all text including brief segments and repeated chants", () => {
  const s = [{ text: "राधा राधा", startTime: 0.1, endTime: 1.2 }, { text: "राधा राधा", startTime: 1.3, endTime: 2.4 }, { text: "जी", startTime: 15, endTime: 16 }];
  const c = buildSafeChunks(s, 15);
  assert.equal(c.map(x => x.text).join(" "), s.map(x => x.text).join(" "));
  assert.equal(c[0].startTime, 0.1); assert.equal(c.at(-1).endTime, 16);
  const chant = Array(100).fill("राधा राधा").join(" ");
  assert.equal(validate([{text:chant,startTime:0,endTime:100}],100).passed,true);
});
test("episode #8 real JSON3 fixture passes without rolling triples", () => {
  const fs = require("fs"), path = require("path");
  const file = path.resolve(__dirname, "../temp/quality8.hi.json3");
  if (!fs.existsSync(file)) return;
  const metadata = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../temp/quality8.info.json")));
  const s = parseJson3(JSON.parse(fs.readFileSync(file)), metadata.duration);
  const q = requireQuality(s, metadata.duration);
  const chunks = buildSafeChunks(s);
  assert(q.words > 500); assert(q.repetitionRatio < 0.1);
  assert.equal(chunks.map(c => c.text).join(" "), s.map(c => c.text).join(" "));
});
