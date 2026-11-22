const { test, before, after }=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");
const db=require("../db/neonDb");
let writes=[];
db.query=async sql=>{
 if(sql.startsWith("SELECT * FROM videos"))return {rows:[{video_id:"legacy",title:"Legacy",source_type:"youtube",status:"done",transcript:"text"}]};
 if(sql.startsWith("SELECT chunk_id"))return {rows:[{text:"legacy text",startTime:0,endTime:10,source:"estimated"}]};
 if(sql.startsWith("SELECT report"))return {rows:[]};
 return {rows:[{video_id:"new-neon-only",title:"New video",status:"done",source_type:"upload",chunk_count:3,preview:"visible",transcript_chars:7}]};
};
require("../services/syncSeedToNeon").syncSeedToNeon=async v=>{writes.push(v);return v.chunks.length;};
const ingestion=require("../services/videoIngestion");
const seeder=require("../services/autoSeeder");
const bad=()=>({segments:[{text:"bad",startTime:5,endTime:2,source:"assemblyai"}],quality:{duration:10},source:"assemblyai"});
seeder.transcribeAudioFile=async()=>bad();
seeder.processVideo=async()=>ingestion.saveVideoRecord({videoId:"abcdefghijk",segments:bad().segments,duration:10});
const app=express();app.use(express.json());app.use("/api/ingest",require("../controllers/ingestController"));
let server,base;
before(async()=>{server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));base=`http://127.0.0.1:${server.address().port}/api/ingest`;});
after(async()=>{await new Promise(r=>server.close(r));});
test("manual URL quality rejection is HTTP 422 and performs no write",async()=>{
 const r=await fetch(base+"/process",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({videoId:"abcdefghijk",videoUrl:"https://www.youtube.com/watch?v=abcdefghijk"})});
 assert.equal(r.status,422);assert.equal((await r.json()).success,false);assert.equal(writes.length,0);
});
test("file upload cannot bypass gate and failed temporary media is removed",async()=>{
 const fs=require("fs"),path=require("path"),dir=path.resolve(__dirname,"../uploads");const before=fs.readdirSync(dir);
 const form=new FormData();form.append("video",new Blob(["test media"]),"test.mp4");
 const r=await fetch(base+"/upload",{method:"POST",body:form});assert.equal(r.status,422);
 assert.equal(writes.length,0);assert.deepEqual(fs.readdirSync(dir),before);
});
test("reindex requires explicit targets and rejects estimated timing",async()=>{
 const post=body=>fetch(base+"/reindex",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 assert.equal((await post({})).status,400);const r=await post({videoIds:["legacy"]});assert.equal(r.status,422);assert.equal((await r.json()).updated,0);assert.equal(writes.length,0);
});
test("Neon-only ingests are visible in video list",async()=>{
 const r=await fetch(base+"/videos");assert.equal(r.status,200);const data=await r.json();assert.equal(data.videos[0].videoId,"new-neon-only");assert.equal(data.videos[0].chunkCount,3);
});
test("common save removes exact artifacts, preserves speech and upload media",async()=>{
 const saved=await ingestion.saveVideoRecord({videoId:"clean",sourceType:"upload",mediaUrl:"/uploads/a.mp4",segments:[{text:"[संगीत] नमस्ते मित्रों",startTime:0,endTime:5,source:"assemblyai"},{text:"[संगीत] नमस्ते मित्रों",startTime:0,endTime:5,source:"assemblyai"},{text:"राधा राधा",startTime:5,endTime:10,source:"assemblyai"}],duration:10});
 assert.equal(saved.transcript,"नमस्ते मित्रों राधा राधा");assert.equal(writes.length,1);assert.equal(writes[0].mediaUrl,"/uploads/a.mp4");assert.equal(saved.quality.wordAccuracy,"unverified_source_transcription");
});
test("common save rejects prompt wrappers and unverified duration",async()=>{
 await assert.rejects(ingestion.saveVideoRecord({segments:[{text:"You are a knowledgeable assistant specializing in summarizing",startTime:0,endTime:10,source:"assemblyai"}],duration:10}),/contamination/);
 await assert.rejects(ingestion.saveVideoRecord({segments:bad().segments}),/duration required/);
 assert.equal(writes.length,1);
});
