const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { getPool } = require("../db/neonDb");
const { fetchYouTubeCaptionTranscript } = require("../services/autoSeeder");
const { parseJson3, requireQuality, buildSafeChunks, prepareTranscript } = require("../services/transcriptQuality");
const { syncSeedToNeon } = require("../services/syncSeedToNeon");
const progress = path.resolve(__dirname, "../seed-progress");
async function main() {
 const state = JSON.parse(fs.readFileSync(path.join(progress, "state.json")));
 const targets = Object.entries(state.results).filter(([,v]) => v.status === "done").map(([n,v]) => ({ n: +n, id:v.videoId })).sort((a,b) => (a.n===8?-1:b.n===8?1:a.n-b.n));
 const reportPath=path.join(progress,"quality-audit.json");
 const report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath)):{results:{}};
 try {
  for(const {n,id} of targets){
   if(report.results[n]?.status==='repaired')continue;
   try {
    const old=(await getPool().query("SELECT * FROM videos WHERE video_id=$1",[id])).rows[0];
    if(!old)throw new Error('Seeded record missing');
    let result;
    const fixture=path.resolve(__dirname,'../temp/quality8.hi.json3');
    if(n===8&&fs.existsSync(fixture)){
     const duration=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../temp/quality8.info.json'))).duration;
     const segments=parseJson3(JSON.parse(fs.readFileSync(fixture)),duration);
     result={segments,quality:requireQuality(segments,duration)};
    }else result=await fetchYouTubeCaptionTranscript(id,old.url);
    if(!result)throw new Error('No captions available for safe repair');
    const prepared=prepareTranscript(result.segments,result.quality.duration);
    const {chunks,transcript}=prepared;
    await syncSeedToNeon({videoId:id,title:old.title,url:old.url,status:'done',transcript,chunks,meta:{quality:prepared.quality}});
    const check=(await getPool().query('SELECT transcript_hash,(SELECT count(*)::int FROM transcript_chunks WHERE video_id=$1) AS chunks FROM videos WHERE video_id=$1',[id])).rows[0];
    if(check.chunks!==chunks.length)throw new Error('Persisted chunk count mismatch');
    report.results[n]={status:'repaired',id,beforeCharacters:old.transcript.length,afterCharacters:transcript.length,chunks:chunks.length,quality:prepared.quality};
    console.log(`REPAIRED #${n}: ${old.transcript.length} -> ${transcript.length} chars, ${chunks.length} chunks`);
   }catch(error){report.results[n]={status:'failed',id,error:error.message};console.log(`AUDIT FAILED #${n}: ${error.message}`);}
   report.updatedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  }
  report.complete=targets.every(({n})=>report.results[n]?.status==='repaired');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({complete:report.complete,total:targets.length,failed:Object.entries(report.results).filter(([,v])=>v.status==='failed').map(([n,v])=>({n,error:v.error}))}));
 }finally{await getPool().end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
