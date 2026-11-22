Ekantik ingestion runs directly on this device and saves transcripts and search chunks to Neon only. It does not need the backend server or a MongoDB connection. The existing captions-first / AssemblyAI transcription flow is reused; no new transcription service is configured.

From the `server` directory:

```powershell
node scripts/seedMissingEkantik.js --watch
node scripts/seedMissingEkantik.js --status
node scripts/discoverEkantik.js
```

The worker processes ascending ranges of 50 episode numbers, starting with #1–#50. Completed Neon episodes are skipped. The manifest `config/ekantik-backfill.json` contains only numbers parsed from actual titles returned by official Bhajan Marg playlists. Missing/private entries remain unresolved; their numbers are never inferred from playlist order.

Progress, attempt limits, current PID and errors are in `seed-progress/state.json`. The lock prevents two backfill workers running together. Transient failures have a one-hour cooldown and at most three attempts. Provider authentication, billing or rate-limit errors stop the worker for inspection. A stopped worker resumes from Neon coverage when relaunched. Temporary media is used during processing; no transcript backup or Mongo mirror is kept.

The former hourly Codex heartbeat was cancelled at the user's request. No scheduled Codex check is required to run the standalone worker. Keep the device awake and online. Videos are counted complete only after their transcript and chunks commit in Neon; unavailable videos require follow-up and are not counted done.

### New official episodes

`node scripts/refreshLatestEkantik.js --publish` scans the official channel's latest
80 uploads and independently verifies full metadata for real-title episode numbers
above the current target. It preserves previous selections, atomically adds valid
public sources, and expands the target to the highest verified number. Without
`--publish`, it saves only a metadata review report. It never infers episode
numbers from dates or positions. Then run `node scripts/seedMissingEkantik.js`
for one ascending 50-number batch, or `--watch` to continue multiple batches.
Use `NODE_ENV=development` locally if the system DNS requires the development
Neon resolver fallback. The existing quality gate, credential rules and Neon-only
persistence apply unchanged. This command does not recreate a scheduled timer.

Quality gate v1 reads JSON3 word timestamps instead of concatenating rolling VTT display windows. It removes only identical text rendered at the same source time, preserving later repeated speech. Empty/suspiciously repetitive text, invalid timing, implausible rates and insufficient caption coverage are rejected before saving. Chunking is lossless and keeps source timing without semantic deduplication. Passed quality reports are committed with the video in Neon's `transcript_quality` table (migration `002_transcript_quality.sql`). `wordAccuracy=unverified_source_transcription` explicitly means automatic checks do not prove correct words; no guessed spelling corrections are applied. Quality failures remain pending/failed in worker progress, never newly saved as done.

`node scripts/repairSeedQuality.js` audits only videos newly completed by this backfill, repairs from source captions with atomic replacement, and records metadata-only results in `seed-progress/quality-audit.json`. Re-running skips verified repaired entries. It never writes MongoDB or transcript backups.

All ingestion paths now share this gate: automatic seeds, manual YouTube ingestion, uploaded media, legacy fetch, explicit reindex and Mongo-to-Neon imports. SQL transcript writes are centralized in `syncSeedToNeon.js`; the final persistence boundary independently normalizes and revalidates source chunks. Exact caption sound markers such as `[संगीत]` and `[Music]` are removed; speech and later genuine repetition are retained. No extra AI call is made. Uploaded playback media remains available for the application; failed temporary processing files are removed.

The ingest list/detail/delete APIs use Neon as well, so Neon-only videos remain visible. Reindex requires an explicit `videoIds` array (1–100 items), preserves known source timestamps, and rejects absent media duration/estimated timestamps with HTTP 422. Import skips existing completed Neon records and rejects unverified legacy records rather than estimating timing or overwriting checked content. Legacy prompt wrappers are rejected. Re-ingest from source media to establish missing timing/duration.

`node scripts/benchmarkTranscriptQuality.js` measures local normalization + validation + chunking only. On this device (Node 22.12.0, 23 Oct 2026), median measured times for 2k/8k/20k words were 1.00/4.68/11.79 ms; 15 measured runs after 3 warmups. These exclude transcription, network, database delivery and the final persistence revalidation. Results are metadata in `seed-progress/quality-benchmark.json`; they are not an end-to-end latency guarantee.

Provider billing failures are held in metadata-only `seed-progress/provider-status.json`. A confirmed negative AssemblyAI balance blocks further ASR uploads, while usable captions can still be ingested. Do not clear the hold or reset exhausted attempt limits without the user confirming funding/retry authorization. `state.holds` separately records unavailable or sign-in-restricted YouTube sources; do not read cookies or bypass access controls to resolve them. A provider-blocked preflight does not consume an attempt.

### Deepgram free-credit fallback
TRANSCRIPT_PROVIDER=deepgram selects DEEPGRAM_API_KEY. Captions remain first; Nova-3 Hindi returns real word timestamps, then the universal gate and atomic Neon persistence. No automatic paid-provider fallback. HTTP401/402/403/429 stops the queue. Never enable billing/top-ups for the user. Balance visibility depends on key permissions; authentication alone cannot establish available promotional credit.

### AssemblyAI credential fallback
ASSEMBLYAI_API_KEY remains primary; ASSEMBLYAI_FALLBACK_API_KEY is tried only on confirmed credit/balance exhaustion. Authentication, network and rate-limit failures do not switch keys. Exhausted credentials are remembered by SHA-256 fingerprint in provider-status.json (metadata only); when all configured keys are exhausted, transcription pauses. Never enable billing or top-ups. Duplicate/mismatched fallback definitions also fail configuration checks.

### Active missing-URL discovery
Run node scripts/seedMissingEkantik.js --watch --discover. The independent Node worker checks manifest/Neon every5min; while no video is eligible, it launches a bounded9min source-discovery pass at most every15min. Each pass rotates a daily full-upload scan across official Bhajan Marg and the user-referenced Gyan Ganga channel, searches up to12 unresolved real episode numbers through both channel search and public YouTube search, then refreshes numbered/master official playlists when budget permits. Resume order and metadata-only progress are in seed-progress/discovery-progress.json; candidates require exact leading episode number, Ekantik wording, title date, allowed channel, public/unlisted full-video duration>=300s, no live/age restriction. Full per-video metadata is verified before atomic manifest merge; selected URLs/provenance are preserved. New URLs seed immediately after discovery returns. No Codex/model calls, cookies or transcript backups. Private/missing source videos cannot be manufactured; rejected candidates remain unresolved. Device must stay awake/online; no reboot auto-start configured.
