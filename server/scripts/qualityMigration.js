// Read-only Mongo source, exclusively gated Neon destination. Never estimate timing.
const path = require("path");
require("dotenv").config({path:path.resolve(__dirname,"../.env"),quiet:true});
const mongoose=require("mongoose");
const Video=require("../models/videoModel");
const {getPool}=require("../db/neonDb");
const {runMigrations}=require("../migrations/runMigrations");
const {prepareTranscript}=require("../services/transcriptQuality");
const {saveVideoRecord}=require("../services/videoIngestion");
async function main(){
 const dryRun=process.argv.includes("--dry-run");
 const summary={dryRun,imported:0,alreadyPresent:0,rejected:0,errors:[]};
 try{
  if(!dryRun)await runMigrations();
  await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:15000});
  // Both live and dry-run preserve existing good Neon records.
  const existing=new Set((await getPool().query("SELECT video_id FROM videos WHERE status='done'")).rows.map(v=>v.video_id));
  for await(const v of Video.find({status:"done"}).lean().cursor()){
   if(existing.has(v.videoId)){summary.alreadyPresent++;continue;}
   try{
    const segments=v.chunks||[],duration=v.meta?.quality?.duration;
    prepareTranscript(segments,duration);
    if(!dryRun)await saveVideoRecord({videoId:v.videoId,title:v.title,url:v.url,mediaUrl:v.mediaUrl,sourceType:v.sourceType,segments,duration});
    summary.imported++;
   }catch(error){summary.rejected++;if(summary.errors.length<25)summary.errors.push({videoId:v.videoId,error:error.message});}
  }
  console.log(JSON.stringify(summary,null,2));
  if(summary.rejected)process.exitCode=2;
 }finally{await mongoose.disconnect();if(getPool())await getPool().end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
