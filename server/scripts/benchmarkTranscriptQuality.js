const fs=require("fs"),path=require("path");
const {performance}=require("perf_hooks");
const {prepareTranscript,parseJson3}=require("../services/transcriptQuality");
const fixture=path.resolve(__dirname,"../temp/quality8.hi.json3");
const corpus=fs.existsSync(fixture)?parseJson3(JSON.parse(fs.readFileSync(fixture)),728).map(s=>s.text).join(" ").split(/\s+/):"गुरु की कृपा से जीवन में भजन और सेवा का महत्व समझ में आता है".split(" ");
const results=[];
for(const size of [2000,8000,20000]){
 const segments=[];
 for(let i=0;i<size;i+=35){const count=Math.min(35,size-i),text=Array.from({length:count},(_,j)=>corpus[(i+j)%corpus.length]).join(" ");segments.push({text,startTime:i/2.2,endTime:(i+count)/2.2,source:"assemblyai"});}
 const duration=size/2.2;
 for(let i=0;i<3;i++)prepareTranscript(segments,duration);
 const times=[];for(let i=0;i<15;i++){const start=performance.now();prepareTranscript(segments,duration);times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);results.push({words:size,medianMs:+times[7].toFixed(2),p95Ms:+times[14].toFixed(2)});
}
const report={at:new Date().toISOString(),node:process.version,mode:"local deterministic normalization + validation + chunking; excludes ASR, network and database",results};
const output=path.resolve(__dirname,"../seed-progress/quality-benchmark.json");fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
