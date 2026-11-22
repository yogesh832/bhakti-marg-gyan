// Read-only human-requested search inventory. Never publishes a candidate or transcript.
const fs=require('fs'),path=require('path'),{execFile}=require('child_process'),{promisify}=require('util');
const run=promisify(execFile),root=path.resolve(__dirname,'..');
const {episodeNumber,assessCandidate}=require('../services/ekantikDiscovery');
const file=path.join(root,'seed-progress/manual-source-search.json');
const state=JSON.parse(fs.readFileSync(path.join(root,'seed-progress/state.json')));
const report=process.argv.includes('--resume') && fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{startedAt:new Date().toISOString(),targetEpisodes:[...state.unresolved],results:{}};
report.status='running';
function save(){fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));fs.renameSync(file+'.tmp',file);}
async function search(number){
 const result={episode:number,queries:[],matches:[],errors:[],checkedAt:null};const seen=new Set();
 for(const query of [`#${number} एकांतिक वार्तालाप Bhajan Marg`,`#${number} Ekantik Vartalaap Darshan`]){
  result.queries.push(query);
  try{
   const {stdout}=await run('yt-dlp',['--flat-playlist','--dump-single-json','--no-warnings','--socket-timeout','15','--retries','0',`ytsearch10:${query}`],{windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
   for(const v of JSON.parse(stdout).entries||[]){
    if(episodeNumber(v.title)!==number || seen.has(v.id))continue;seen.add(v.id);
    const candidate={id:v.id,title:v.title,duration:v.duration,channel_id:v.channel_id,channel:v.channel,url:`https://www.youtube.com/watch?v=${v.id}`};
    result.matches.push({...candidate,preliminaryAssessment:assessCandidate(candidate,number)});
   }
  }catch(error){result.errors.push(String(error.message).slice(0,180));}
 }
 result.checkedAt=new Date().toISOString();report.results[number]=result;save();
 console.log(JSON.stringify({episode:number,checked:Object.keys(report.results).length,total:report.targetEpisodes.length,matches:result.matches.length,allowedCandidates:result.matches.filter(v=>v.preliminaryAssessment.ok).length,errors:result.errors.length}));
}
async function main(){
 save();let index=0;const pending=report.targetEpisodes.filter(n=>!report.results[n]);
 async function worker(){while(index<pending.length){const number=pending[index++];await search(number);}}
 await Promise.all(Array.from({length:4},()=>worker()));
 report.status='complete';report.finishedAt=new Date().toISOString();save();
 console.log('Search inventory complete; full video verification required before queueing');
}
main().catch(error=>{report.status='failed';report.error=String(error.message).slice(0,200);save();process.exitCode=1});
