const ALLOWED_CHANNELS = new Set(['UCEk1jBxAl6fe-_G37G7huQA', 'UCYW8IeqIRY_d5STvAUn2k5w']);
const OFFICIAL_CHANNEL = 'UCEk1jBxAl6fe-_G37G7huQA';
function episodeNumber(title = '') {
  const match = String(title).match(/^\s*#\s*(\d+)(?!\d)/u);
  return match ? Number(match[1]) : null;
}
function extractTitleDate(title = '') {
  // Parse literal title digits, including the source's missing month/year separator.
  // No date or episode number is filled from a playlist position or upload date.
  const match = String(title).match(/(?<!\d)(\d{1,2})\s*[-/. ]\s*(\d{1,2})\s*[-/. ]\s*(20\d{2})(?!\d)/)
    || String(title).match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})(20\d{2})(?!\d)/);
  if (!match) return null;
  const day=+match[1],month=+match[2],year=+match[3],date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return {raw:match[0],iso:date.toISOString().slice(0,10)};
}
function assessCandidate(video, expectedNumber, target = 1421) {
  const number = episodeNumber(video.title);
  if (!number || number > target || (expectedNumber && number !== expectedNumber)) return {ok:false,reason:'episode_number_mismatch'};
  if (!/एकांतिक|एकान्तिक|ekantik/i.test(video.title || '')) return {ok:false,reason:'not_ekantik_episode'};
  if (!ALLOWED_CHANNELS.has(video.channel_id)) return {ok:false,reason:'unapproved_channel'};
  // The official channel's explicit title number is authoritative even when it
  // omits a date. Do not invent a title date from upload metadata.
  if (video.channel_id !== OFFICIAL_CHANNEL && !extractTitleDate(video.title)) return {ok:false,reason:'missing_title_date'};
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.id || '')) return {ok:false,reason:'invalid_video_id'};
  if (!Number.isFinite(video.duration) || video.duration < 300) return {ok:false,reason:'short_or_unknown_duration'};
  if (video.is_live || ['is_upcoming','is_live'].includes(video.live_status)) return {ok:false,reason:'live_or_upcoming'};
  if (video.availability && !['public','unlisted'].includes(video.availability)) return {ok:false,reason:'restricted_source'};
  if ((video.age_limit || 0) >= 18) return {ok:false,reason:'age_restricted'};
  return {ok:true,number};
}
function mergeVerified(current, candidates) {
  const map = new Map(current.videos.map(v => [episodeNumber(v.title), v]));
  const added = [], conflicts = [];
  for (const entry of candidates) {
    const number = episodeNumber(entry.title);
    if (!number || !entry.sourceVerification) continue;
    if (map.has(number)) {
      if (map.get(number).url !== entry.url) conflicts.push({number,existingUrl:map.get(number).url,candidateUrl:entry.url});
      continue;
    }
    map.set(number, entry); added.push(number);
  }
  return {manifest:{...current,videos:[...map.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v)},added,conflicts};
}
function searchBatch(absent, searched, limit) {
  return [...absent].sort((a,b)=>(Date.parse(searched[a]?.at || '') || 0)-(Date.parse(searched[b]?.at || '') || 0)||a-b).slice(0,limit);
}
module.exports = {ALLOWED_CHANNELS,OFFICIAL_CHANNEL,episodeNumber,extractTitleDate,assessCandidate,mergeVerified,searchBatch};
