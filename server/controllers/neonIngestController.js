const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { query } = require("../db/neonDb");
const { processVideo, getYouTubeId, transcribeAudioFile } = require("../services/autoSeeder");
const { saveVideoRecord } = require("../services/videoIngestion");
const router = express.Router();
const uploadsDir = path.resolve(__dirname, "../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir, limits: { fileSize: 500 * 1024 * 1024 } });
const errorResponse = (res, error) => res.status(error.code === "TRANSCRIPT_QUALITY" ? 422 : 500).json({ success: false, error: error.message, quality: error.report || null });
const formatVideo = v => ({
  _id: v.video_id, videoId: v.video_id, title: v.title, url: v.url,
  mediaUrl: v.media_url, sourceType: v.source_type, status: v.status,
  ingestDate: v.created_at, chunkCount: Number(v.chunk_count || 0),
  transcriptPreview: (v.preview || "") + (v.transcript_chars > 200 ? "..." : ""),
});
async function readVideo(videoId) {
 const v=(await query("SELECT * FROM videos WHERE video_id=$1",[videoId])).rows[0];
 if(!v)return null;
 const chunks=(await query("SELECT chunk_id AS \"chunkId\",chunk_index AS index,start_time AS \"startTime\",end_time AS \"endTime\",text,cleaned_text AS \"cleanedText\",source FROM transcript_chunks WHERE video_id=$1 ORDER BY chunk_index",[videoId])).rows;
 const quality=(await query("SELECT report FROM transcript_quality WHERE video_id=$1",[videoId])).rows[0]?.report;
 return {...formatVideo(v), transcript:v.transcript,chunks,chunkCount:chunks.length,quality};
}
router.post("/process", async(req,res)=>{
 try {
  const {videoId:raw,videoUrl,title}=req.body||{}, videoId=getYouTubeId(raw||videoUrl);
  if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId)||!videoUrl)return res.status(400).json({success:false,error:"Valid YouTube videoId and videoUrl required"});
  if(getYouTubeId(videoUrl)!==videoId)return res.status(400).json({success:false,error:"Video ID and URL mismatch"});
  const result=await processVideo({url:videoUrl,title,transcriptProvider:process.env.TRANSCRIPT_PROVIDER || "assemblyai"});
  const video=await readVideo(videoId);
  res.json({success:true,...video,ingestionStatus:result.status,transcriptSource:video.chunks[0]?.source});
 }catch(error){errorResponse(res,error);}
});
router.post("/upload", upload.single("video"), async(req,res)=>{
 let finalPath;
 try {
  if(!req.file)return res.status(400).json({success:false,error:"Missing video file"});
  const extension=path.extname(req.file.originalname||"").replace(/[^.a-zA-Z0-9]/g,"")||".mp4";
  const videoId=`upload-${Date.now()}-${req.file.filename}`;
  finalPath=path.join(uploadsDir,videoId+extension); fs.renameSync(req.file.path,finalPath);
  const result=await transcribeAudioFile(finalPath);
  const base=process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`;
  const mediaUrl=`${base}/uploads/${path.basename(finalPath)}`;
  const saved=await saveVideoRecord({videoId,title:req.body.title||req.file.originalname||"Uploaded Video",url:mediaUrl,mediaUrl,sourceType:"upload",segments:result.segments,duration:result.quality.duration});
  res.json({success:true,videoId,sourceType:"upload",mediaUrl,transcriptSource:result.source,chunkCount:saved.chunkCount,transcript:saved.transcript,quality:saved.quality});
 }catch(error){
  if(finalPath&&path.dirname(finalPath)===uploadsDir&&fs.existsSync(finalPath))fs.unlinkSync(finalPath);
  errorResponse(res,error);
 }
});
router.post("/reindex",async(req,res)=>{
 const ids=req.body?.videoIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=="string"))return res.status(400).json({success:false,error:"Provide 1–100 videoIds; broad estimated-timestamp reindex is disabled"});
 let updated=0;const rejected=[];
 for(const id of new Set(ids)){
  try {
   const v=await readVideo(id);if(!v)throw Error("Video not found");
   await saveVideoRecord({videoId:id,title:v.title,url:v.url,mediaUrl:v.mediaUrl,sourceType:v.sourceType,segments:v.chunks,duration:v.quality?.duration});updated++;
  }catch(error){rejected.push({videoId:id,error:error.message});}
 }
 res.status(rejected.length?422:200).json({success:!rejected.length,updated,rejected});
});
router.get("/videos",async(req,res)=>{
 try{
  const {rows}=await query("SELECT v.video_id,v.title,v.url,v.media_url,v.source_type,v.status,v.created_at,left(v.transcript,200) AS preview,length(v.transcript) AS transcript_chars,(SELECT count(*) FROM transcript_chunks c WHERE c.video_id=v.video_id) AS chunk_count FROM videos v ORDER BY v.created_at DESC LIMIT 100");
  res.json({success:true,videos:rows.map(formatVideo),total:rows.length});
 }catch(error){errorResponse(res,error);}
});
router.get("/videos/:videoId",async(req,res)=>{
 try{const v=await readVideo(req.params.videoId);if(!v)return res.status(404).json({success:false,error:"Video not found"});res.json({success:true,...v});}catch(error){errorResponse(res,error);}
});
router.delete("/videos/:videoId",async(req,res)=>{
 try{const r=await query("DELETE FROM videos WHERE video_id=$1 RETURNING video_id",[req.params.videoId]);res.status(r.rows.length?200:404).json({success:!!r.rows.length,message:r.rows.length?"Video deleted":"Video not found"});}catch(error){errorResponse(res,error);}
});
module.exports=router;
