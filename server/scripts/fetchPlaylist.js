/**
 * Fetch all video URLs from a YouTube playlist using yt-dlp
 * Usage: node scripts/fetchPlaylist.js "PLAYLIST_URL"
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const playlistUrl = process.argv[2];

if (!playlistUrl) {
  console.error("Usage: node scripts/fetchPlaylist.js \"PLAYLIST_URL\"");
  console.error("Example: node scripts/fetchPlaylist.js \"https://www.youtube.com/playlist?list=PL...\"");
  process.exit(1);
}

try {
  console.log(`Fetching playlist: ${playlistUrl}`);

  // Get video URLs from playlist
  const output = execSync(`yt-dlp --flat-playlist -J "${playlistUrl}"`, {
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024, // 100MB buffer
  });

  const playlist = JSON.parse(output);
  const videos = playlist.entries.map((entry, index) => ({
    url: `https://www.youtube.com/watch?v=${entry.id}`,
    title: entry.title || `Video ${index + 1}`,
  }));

  // Save to seeds.json
  const seedsPath = path.join(__dirname, "../config/seeds.json");
  const existing = fs.existsSync(seedsPath)
    ? JSON.parse(fs.readFileSync(seedsPath, "utf-8"))
    : { description: "", note: "", videos: [] };

  // Merge without duplicates
  const existingUrls = new Set(existing.videos.map((v) => v.url));
  const newVideos = videos.filter((v) => !existingUrls.has(v.url));

  const updated = {
    ...existing,
    videos: [...existing.videos, ...newVideos],
  };

  fs.writeFileSync(seedsPath, JSON.stringify(updated, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Total videos: ${updated.videos.length}`);
  console.log(`   New videos added: ${newVideos.length}`);
  console.log(`   Saved to: ${seedsPath}`);
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
