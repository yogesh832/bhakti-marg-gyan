// Metadata-only verification; this script never writes transcript/manifest rows.
const fs=require('fs'),path=require('path'),{execFile}=require('child_process'),{promisify}=require('util');
const run=promisify(execFile),root=path.resolve(__dirname,'..');
const {episodeNumber}=require('../services/ekantikDiscovery');
const inventory=JSON.parse(fs.readFileSync(path.join(root,'seed-progress/manual-source-search.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/ekantik-backfill.json')));
const file=path.join(root,'seed-progress/manual-source-verification.json');
function date(title){
 const m=String(title||'').match(/(?:^|[^\d])([0-3]?\d)\s*[-/. ]\s*([01]?\d)\s*[-/. ]\s*(20\d{2})(?!\d)/);
 if(!m)return null;const y=+m[3],mo=+m[2],day=+m[1],time=Date.UTC(y,mo-1,day),d=new Date(time);
 return d.getUTCFullYear()===y&&d.getUTCMonth()===mo-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):null;
}
const anchors=manifest.videos.filter(v=>!v.sourceVerification||v.sourceVerification.channelId==='UCEk1jBxAl6fe-_G37G7huQA').map(v=>({number:episodeNumber(v.title),date:date(v.title),url:v.url})).filter(v=>v.number&&v.date).sort((a,b)=>a.number-b.number);
const report={at:new Date().toISOString(),status:'running',verified:[],rejected:[],needsReview:[]};
function save(){fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));fs.renameSync(file+'.tmp',file);}
function consistency(number,title){
 const titleDate=date(title);if(!titleDate)return {ok:false,reason:'missing_unambiguous_title_date'};
 const collision=anchors.find(v=>v.date===titleDate&&v.number!==number);
 if(collision)return {ok:false,reason:'date_belongs_to_other_official_episode',officialEpisode:collision.number,titleDate};
 const lower=anchors.filter(v=>v.number<number).at(-1),upper=anchors.find(v=>v.number>number);
 if((lower&&titleDate<lower.date)||(upper&&titleDate>upper.date))return {ok:false,reason:'date_outside_official_neighbour_bounds',titleDate,lower,upper};
 return {ok:true,titleDate,lower,upper};
}
const candidates=[];
for(const r of Object.values(inventory.results))for(const candidate of r.matches){
 if(!/एकांतिक|एकान्तिक|ekantik/i.test(candidate.title)||candidate.duration<300){report.rejected.push({episode:r.episode,id:candidate.id,reason:'not_full_ekantik_video'});continue;}
 const check=consistency(r.episode,candidate.title);
 if(!check.ok){(check.reason==='missing_unambiguous_title_date'?report.needsReview:report.rejected).push({episode:r.episode,id:candidate.id,title:candidate.title,...check});continue;}
 candidates.push({episode:r.episode,...candidate,consistency:check});
}
async function verify(candidate){
 try{
  const {stdout}=await run('yt-dlp',['--skip-download','--dump-single-json','--no-playlist','--no-warnings','--socket-timeout','15','--retries','0',candidate.url],{windowsHide:true,timeout:60000,maxBuffer:12*1024*1024});
  const v=JSON.parse(stdout),check=consistency(candidate.episode,v.title);
  if(episodeNumber(v.title)!==candidate.episode||!check.ok||!Number.isFinite(v.duration)||v.duration<300||v.is_live||['is_live','is_upcoming'].includes(v.live_status)||(v.age_limit||0)>=18||!['public','unlisted'].includes(v.availability))throw Error('Full metadata verification rejected');
  report.verified.push({episode:candidate.episode,url:candidate.url,videoId:v.id,title:v.title,channel:v.channel,channelId:v.channel_id,duration:v.duration,uploadDate:v.upload_date,availability:v.availability,titleDate:check.titleDate,officialNeighbourBounds:{lower:check.lower,upper:check.upper},verifiedAt:new Date().toISOString(),identityCaveat:'Reupload title/date consistency checked; original recording identity not independently established'});
 }catch(error){report.rejected.push({episode:candidate.episode,id:candidate.id,url:candidate.url,reason:'video_metadata_unavailable_or_rejected',detail:String(error.message).slice(0,180)});}
 save();console.log(JSON.stringify({episode:candidate.episode,verified:report.verified.length,checked:report.verified.length+report.rejected.filter(r=>r.reason==='video_metadata_unavailable_or_rejected').length,total:candidates.length}));
}
async function main(){
 save();let index=0;async function worker(){while(index<candidates.length)await verify(candidates[index++]);}
 await Promise.all(Array.from({length:3},()=>worker()));report.status='complete';report.finishedAt=new Date().toISOString();save();
 console.log(JSON.stringify({verified:report.verified.length,rejected:report.rejected.length,needsReview:report.needsReview.length}));
}
if(require.main===module)main().catch(e=>{report.status='failed';report.error=String(e.message).slice(0,180);save();process.exitCode=1});
module.exports={date,consistency};
