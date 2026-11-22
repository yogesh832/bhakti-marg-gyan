// Compatibility entry point; prompt-wrapped Mongo writes are retired.
const { processVideo, getYouTubeId } = require("./autoSeeder");
const { query } = require("../db/neonDb");
async function fetchTranscript(videoId, videoUrl) {
 if(getYouTubeId(videoUrl)!==videoId)throw new Error("Video ID and URL mismatch");
 await processVideo({url:videoUrl,transcriptProvider:process.env.TRANSCRIPT_PROVIDER || "assemblyai"});
 const video=(await query("SELECT transcript FROM videos WHERE video_id=$1 AND status='done'",[videoId])).rows[0];
 if(!video)throw new Error("Video was not saved");
 return {success:true,transcript:video.transcript};
}
module.exports=fetchTranscript;
