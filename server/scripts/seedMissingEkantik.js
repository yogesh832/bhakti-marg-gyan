/** Resume missing numbered episodes in ascending batches. No server startup required. */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { getPool } = require("../db/neonDb");
const { processVideo, getYouTubeId } = require("../services/autoSeeder");
const { syncSeedToNeon } = require("../services/syncSeedToNeon");
const dir = path.resolve(__dirname, "../seed-progress");
const statePath = path.join(dir, "state.json"), lockPath = path.join(dir, "worker.lock");
const manifestPath = path.resolve(__dirname, "../config/ekantik-backfill.json");
const number = (title = "") => Number(title.match(/#\s*(\d+)/)?.[1]) || null;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath + ".tmp", JSON.stringify(state, null, 2));
  fs.renameSync(statePath + ".tmp", statePath);
}
function lock() {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, "utf8"));
    try { process.kill(pid, 0); console.log(`Worker already running: PID ${pid}`); return false; }
    catch (e) { if (e.code !== "ESRCH") throw e; fs.unlinkSync(lockPath); }
  }
  fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  return true;
}
async function coverage() {
  const neon = (await getPool().query("SELECT v.video_id, v.title FROM videos v WHERE status='done' AND length(coalesce(transcript,''))>0 AND EXISTS (SELECT 1 FROM transcript_chunks c WHERE c.video_id=v.video_id)")).rows;
  return new Set(neon.map(v => number(v.title)).filter(Boolean));
}
async function main() {
  if (process.argv.includes("--status")) {
    console.log(fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : "No batch started"); return;
  }
  if (!lock()) return;
  let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { attempts: {}, results: {} };
  state.pid = process.pid;
  state.storage = { primary: "neon", backup: false, mongodb: false };
  try {
    const transcriptProvider = process.env.TRANSCRIPT_PROVIDER || 'assemblyai';
    require('../services/transcriptionConfig').assertTranscriptionConfig(path.resolve(__dirname, '../.env'), transcriptProvider);
    if (!['assemblyai', 'deepgram'].includes(transcriptProvider)) throw new Error('Unsupported backfill provider');
    if (!process.env[transcriptProvider === 'deepgram' ? 'DEEPGRAM_API_KEY' : 'ASSEMBLYAI_API_KEY']) throw new Error('Transcription configuration missing');
    if (!getPool()) throw new Error("Neon configuration is missing");
    do {
      // Reload on each batch so newly discovered official URLs are picked up.
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      let completed;
      try {
        completed = await coverage();
        delete state.error;
      } catch (error) {
        const transient = ['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','57P01','57P02','57P03','08006','08003'].includes(error.code)
          || /connection terminated unexpectedly|server closed the connection|connection timeout/i.test(error.message || '');
        if (!process.argv.includes('--watch') || !transient) throw error;
        // Do not start downloads/transcription while Neon coverage is unknown.
        state.status = 'retrying_neon_connection';
        state.error = 'Temporary Neon connection failure; coverage retry pending';
        state.nextCheckAt = new Date(Date.now() + 60000).toISOString();
        writeState(state);
        await delay(60000);
        continue;
      }
      const missing = Array.from({ length: manifest.target }, (_, i) => i + 1).filter(n => !completed.has(n));
      const candidates = new Map();
      for (const video of manifest.videos) {
        const n = number(video.title);
        if (!n || n > manifest.target || n < 1) continue;
        if (candidates.has(n) && candidates.get(n).url !== video.url) throw new Error(`Ambiguous URLs for #${n}; resolve manifest first`);
        candidates.set(n, video);
      }
      state.missing = missing;
      state.unresolved = missing.filter(n => !candidates.has(n));
      state.complete = manifest.target - missing.length;
      const eligible = missing.filter(n => candidates.has(n) && !state.holds?.[n] && (state.attempts[n]?.count || 0) < 3 && Date.now() >= (state.attempts[n]?.retryAfter || 0));
      const first = eligible[0];
      const batchEnd = first ? Math.min(manifest.target, Math.ceil(first / 50) * 50) : null;
      const batch = eligible.filter(n => n <= batchEnd);
      state.batch = first ? { from: Math.floor((first - 1) / 50) * 50 + 1, to: batchEnd, episodes: batch } : null;
      state.status = missing.length === 0 ? "complete" : batch.length ? "running" : "needs_attention";
      writeState(state);
      if (!batch.length) {
        if (!missing.length || !process.argv.includes('--watch')) break;
        state.status = 'waiting_for_sources';
        // Public metadata discovery and this Node worker need no Codex/model calls.
        if (process.argv.includes('--discover') && Date.now() >= (state.nextDiscoveryAt || 0)) {
          state.nextDiscoveryAt = Date.now() + 15 * 60000;
          state.status = 'discovering_sources';
          state.discoveryStatus = 'running'; writeState(state);
          try {
            await new Promise((resolve, reject) => require('child_process').execFile(process.execPath,
              [path.join(__dirname, 'discoverEkantik.js')],
              {cwd:path.resolve(__dirname,'..'),windowsHide:true,timeout:1200000,maxBuffer:1024*1024},
              error => error ? reject(error) : resolve()));
            state.discoveryStatus = 'complete';
          } catch (error) {
            state.discoveryStatus = 'failed';
            state.discoveryError = String(error.message).slice(0,250);
          }
          state.lastDiscoveryAt = new Date().toISOString();
          writeState(state);
          // Reload new source URLs immediately instead of another idle sleep.
          continue;
        }
        state.nextCheckAt = new Date(Date.now() + 300000).toISOString();
        writeState(state);
        await delay(300000);
        continue;
      }
      console.log(`Batch #${state.batch.from}-#${batchEnd}: ${batch.length} pending`);
      for (const n of batch) {
        const entry = candidates.get(n);
        state.current = n; writeState(state);
        console.log(`${new Date().toISOString()} START #${n} ${entry.url}`);
        try {
          const videoId = getYouTubeId(entry.url);
          let chunks;
          const save = async video => {
            if (number(video.title) !== n) throw new Error(`Stored episode title mismatch for #${n}`);
            // Retry DB delivery in memory; no transcript backup is written to disk.
            for (let attempt = 0; attempt < 3; attempt++) {
              try { chunks = await syncSeedToNeon(video); return; }
              catch (error) { if (attempt === 2) throw error; await delay(2000 * (attempt + 1)); }
            }
          };
          await processVideo({ ...entry, transcriptProvider }, { exists: async () => false, save });
          state.results[n] = { status: "done", videoId, chunks, at: new Date().toISOString() };
          delete state.attempts[n];
          state.missing = state.missing.filter(x => x !== n);
          state.complete = manifest.target - state.missing.length;
          console.log(`VERIFIED #${n}: Neon, ${chunks} chunks`);
        } catch (error) {
          // Store a concise error only; HTTP request objects can contain credentials.
          if (error.code !== "PROVIDER_BILLING_BLOCKED") state.attempts[n] = { count: (state.attempts[n]?.count || 0) + 1, retryAfter: Date.now() + 3600000 };
          if (error.code === "PROVIDER_BILLING_BLOCKED") state.holds = { ...state.holds, [n]: "assemblyai_funding_required" };
          state.results[n] = { status: "failed", error: error.message.slice(0, 600), at: new Date().toISOString() };
          console.error(`FAILED #${n}: ${error.message}`);
          // Stop on provider/account failures instead of charging through the queue.
          if (error.code === "PROVIDER_NEEDS_ATTENTION" || error.code !== "PROVIDER_BILLING_BLOCKED" && (/negative.*balance|insufficient.*(?:balance|funds)|top up/i.test(error.message) || [401,402,403,429].includes(error.response?.status))) { state.status = "needs_attention"; writeState(state); throw new Error("Transcription provider needs attention; batch stopped"); }
        }
        writeState(state);
        await delay(3000);
      }
      state.current = null; state.status = "batch_complete"; writeState(state);
      if (!process.argv.includes("--watch")) break;
      await delay(30000);
    } while (true);
  } catch (error) {
    state.status = "needs_attention"; state.error = error.message; writeState(state); throw error;
  } finally {
    if (getPool()) await getPool().end();
    if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, "utf8") === String(process.pid)) fs.unlinkSync(lockPath);
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { number };
