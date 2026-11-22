// Public metadata only: no Codex/model calls, cookies, or transcript storage.
const fs=require('fs'),path=require('path'),{execFile}=require('child_process'),{promisify}=require('util');
const run=promisify(execFile);
const {ALLOWED_CHANNELS,OFFICIAL_CHANNEL,episodeNumber:n,extractTitleDate,assessCandidate,mergeVerified,searchBatch}=require('../services/ekantikDiscovery');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'seed-progress');
const manifestPath=path.join(root,'config/ekantik-backfill.json'),progressPath=path.join(dir,'discovery-progress.json');
const DAY=24*3600000;
const read=(p,fallback)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;
function write(p,value){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2));fs.renameSync(p+'.tmp',p);}
async function metadata(url,flat=true,limit=10){
 const args=['--dump-single-json','--no-warnings','--socket-timeout','20','--retries','1'];
 if(flat)args.push('--flat-playlist','--playlist-end',String(limit));else args.push('--skip-download','--no-playlist');
 args.push(url);
 const {stdout}=await run('yt-dlp',args,{windowsHide:true,timeout:flat?120000:150000,maxBuffer:40*1024*1024});
 return JSON.parse(stdout);
}
async function main(){
 const started=Date.now(),budget=9*60000;
 const progress=read(progressPath,{searched:{},broad:{}});progress.searched ||= {};progress.broad ||= {};
 const report={at:new Date().toISOString(),added:[],searched:[],errors:[],rejected:{},conflicts:[],stages:[]};
 let manifest=read(manifestPath),known=new Set(manifest.videos.map(v=>n(v.title)));
 const absent=()=>Array.from({length:manifest.target},(_,i)=>i+1).filter(x=>!known.has(x));
 const checked=new Set();
 async function consider(v,source,expected){
  const number=n(v.title);
  if(!number || known.has(number) || number>manifest.target || (expected && number!==expected))return;
  if(v.channel_id && !ALLOWED_CHANNELS.has(v.channel_id)){report.rejected.unapproved_channel=(report.rejected.unapproved_channel||0)+1;return;}
  if(checked.has(v.id))return;checked.add(v.id);
  try{
   const full=await metadata('https://www.youtube.com/watch?v='+v.id,false);
   const assessment=assessCandidate(full,number,manifest.target);
   if(!assessment.ok){report.rejected[assessment.reason]=(report.rejected[assessment.reason]||0)+1;return;}
   const parsedDate=extractTitleDate(full.title);
   const entry={url:'https://www.youtube.com/watch?v='+full.id,title:full.title,sourceVerification:{kind:full.channel_id===OFFICIAL_CHANNEL?'official-source-discovery':'alternative-on-user-referenced-channel',channel:full.channel,channelId:full.channel_id,duration:full.duration,titleDate:parsedDate?.iso||null,titleDateToken:parsedDate?.raw||null,uploadDate:full.upload_date,verifiedAt:new Date().toISOString(),discoverySource:source,...(full.channel_id===OFFICIAL_CHANNEL?{}:{referenceEpisode:361})}};
   const merged=mergeVerified(read(manifestPath),[entry]);manifest=merged.manifest;
   manifest.refreshedAt=new Date().toISOString();write(manifestPath,manifest);
   known=new Set(manifest.videos.map(x=>n(x.title)));report.added.push(...merged.added);report.conflicts.push(...merged.conflicts);
   if(merged.added.length)console.log('VERIFIED SOURCE #'+number+' '+entry.url);
   write(path.join(dir,'discovery.json'),{...report,status:'running',numberedUrls:known.size,missingNumbers:absent()});
  }catch(error){report.errors.push({stage:'verify',videoId:v.id,error:String(error.message).slice(0,220)});}
 }
 async function scan(url,label,limit=10000){
  console.log('Discovery: '+label);report.stages.push(label);
  progress.activeStage=label;write(progressPath,progress);
  try{const data=await metadata(url,true,limit);for(const v of data.entries||[]){if(Date.now()-started>=budget)return false;await consider(v,label);}return true;}
  catch(error){report.errors.push({stage:label,error:String(error.message).slice(0,220)});return false;}
 }
 // Rotate one daily channel scan before targeted searches so it cannot starve.
 progress.broadAttemptAt ||= {};
 const channel=[...ALLOWED_CHANNELS].filter(c=>Date.now()-(progress.broad[c]||0)>=DAY)
  .sort((a,b)=>(progress.broadAttemptAt[a]||0)-(progress.broadAttemptAt[b]||0))[0];
 if(channel){
  progress.broadAttemptAt[channel]=Date.now();write(progressPath,progress);
  if(await scan('https://www.youtube.com/channel/'+channel+'/videos','channel uploads '+channel))progress.broad[channel]=Date.now();
  write(progressPath,progress);
 }
 // Search each unresolved number, rotating across passes instead of repeating the first few.
 const batch=searchBatch(absent(),progress.searched,12);
 for(const number of batch){
  if(Date.now()-started>=budget)break;
  console.log('Searching missing episode #'+number);const sources=[];
  progress.activeEpisode=number;progress.activeStage='targeted episode search';write(progressPath,progress);
  for(const channel of ALLOWED_CHANNELS)sources.push(['https://www.youtube.com/channel/'+channel+'/search?query='+encodeURIComponent('#'+number+' Ekantik'),'channel search '+channel]);
  sources.push(['ytsearch10:#'+number+' Ekantik Vartalap Bhajan Marg','public title search']);
  let completed=true;
  for(const [url,label] of sources){
   if(known.has(number))break;
   if(Date.now()-started>=budget){completed=false;break;}
   try{const data=await metadata(url,true,10);for(const v of data.entries||[])await consider(v,label,number);}
   catch(error){report.errors.push({stage:label,number,error:String(error.message).slice(0,220)});}
  }
  if(completed){progress.searched[number]={at:new Date().toISOString(),found:known.has(number)};report.searched.push(number);write(progressPath,progress);}
 }
 if(Date.now()-(progress.lastPlaylistRefresh||0)>=DAY && Date.now()-started<budget){
  const index=read(path.join(root,'temp/bhajan-playlists.json'),{entries:[]});
  const playlists=index.entries.filter(p=>{const range=p.title?.match(/^Ekantik\((\d+)-(\d+)\)$/);return range?absent().some(x=>x>=+range[1]&&x<=+range[2]):/Ekantik Vartalaap \(एकांतिक/.test(p.title||'');});
  let complete=true;
  for(const p of playlists){if(Date.now()-started>=budget){complete=false;break;}await scan(p.url,'official playlist '+p.title);}
  if(complete)progress.lastPlaylistRefresh=Date.now();write(progressPath,progress);
 }
 report.numberedUrls=known.size;report.missingNumbers=absent();report.finishedAt=new Date().toISOString();report.status='complete';
 delete progress.activeEpisode;progress.activeStage='idle';
 write(path.join(dir,'discovery.json'),report);write(progressPath,progress);
 console.log(JSON.stringify({added:report.added,numberedUrls:known.size,unresolved:report.missingNumbers.length,searched:report.searched.length,errors:report.errors.length}));
}
if(require.main===module)main().catch(error=>{console.error(String(error.message).slice(0,300));process.exitCode=1});
module.exports={main};
