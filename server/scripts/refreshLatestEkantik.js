// Metadata-only refresh. Explicit --publish merges verified official episodes.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { OFFICIAL_CHANNEL, episodeNumber, assessCandidate, extractTitleDate, mergeVerified } = require('../services/ekantikDiscovery');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'config/ekantik-backfill.json');
const reportPath = path.join(root, 'seed-progress/latest-official-refresh.json');
const write = (file, value) => {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file);
};
async function metadata(url, flat) {
  const { stdout } = await run('yt-dlp', ['--dump-single-json', '--no-warnings',
    '--socket-timeout', '20', '--retries', '1',
    ...(flat ? ['--flat-playlist', '--playlist-end', '80'] : ['--skip-download', '--no-playlist']), url],
  { windowsHide: true, timeout: 120000, maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function main() {
  const current = JSON.parse(fs.readFileSync(manifestPath));
  const known = new Set(current.videos.map(v => episodeNumber(v.title)));
  const inventory = await metadata(`https://www.youtube.com/channel/${OFFICIAL_CHANNEL}/videos`, true);
  const observedEpisodes = (inventory.entries || [])
    .filter(v => /ekantik|एकांतिक|एकान्तिक/i.test(v.title || ''))
    .map(v => episodeNumber(v.title)).filter(Boolean);
  const candidates = (inventory.entries || []).filter(v => episodeNumber(v.title) > current.target && !known.has(episodeNumber(v.title)));
  const report = { at: new Date().toISOString(), previousTarget: current.target,
    latestObservedEpisode: observedEpisodes.length ? Math.max(...observedEpisodes) : null,
    observedEpisodes, verified: [], rejected: [], errors: [], published: false };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next++];
      const expected = episodeNumber(candidate.title);
      try {
        const video = await metadata(`https://www.youtube.com/watch?v=${candidate.id}`, false);
        const result = assessCandidate(video, expected, expected);
        if (!result.ok || video.channel_id !== OFFICIAL_CHANNEL || video.id !== candidate.id) {
          report.rejected.push({ number: expected, videoId: candidate.id, reason: result.reason || 'official_identity_mismatch' });
          continue;
        }
        report.verified.push({ url: `https://www.youtube.com/watch?v=${video.id}`, title: video.title,
          sourceVerification: { kind: 'official-latest-upload-discovery', channelId: video.channel_id,
            channel: video.channel, duration: video.duration, uploadDate: video.upload_date,
            titleDate: extractTitleDate(video.title)?.iso || null, verifiedAt: new Date().toISOString() } });
        console.log(`VERIFIED #${expected} ${video.id}`);
      } catch (error) {
        report.errors.push({ number: expected, videoId: candidate.id, error: String(error.message).slice(0, 220) });
      }
    }
  }));
  report.verified.sort((a, b) => episodeNumber(a.title) - episodeNumber(b.title));
  if (process.argv.includes('--publish') && report.verified.length) {
    // Reload immediately before atomic merge, preserving any intervening additions.
    const fresh = JSON.parse(fs.readFileSync(manifestPath));
    const merged = mergeVerified(fresh, report.verified);
    merged.manifest.target = Math.max(fresh.target, ...report.verified.map(v => episodeNumber(v.title)));
    merged.manifest.refreshedAt = new Date().toISOString();
    write(manifestPath, merged.manifest);
    report.published = true;
    report.added = merged.added;
    report.conflicts = merged.conflicts;
    report.target = merged.manifest.target;
  }
  write(reportPath, report);
  console.log(JSON.stringify({ verified: report.verified.length, rejected: report.rejected.length, errors: report.errors.length, published: report.published, target: report.target }));
  if (report.errors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
