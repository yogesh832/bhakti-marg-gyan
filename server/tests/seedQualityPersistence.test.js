const { test } = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db/neonDb");
const { requireQuality } = require("../services/transcriptQuality");
let calls = [], failInsert = false, acquired = 0, released = 0;
db.getClient = async () => { acquired++; return {
 query: async sql => { calls.push(sql); if(failInsert && sql.startsWith("INSERT INTO transcript_chunks"))throw new Error("simulated chunk insert failure"); return {rows:[{count:1}]}; },
 release: () => { released++; }
}; };
const { syncSeedToNeon } = require("../services/syncSeedToNeon");
const chunks=[{index:0,startTime:0,endTime:10,text:"गुरु की कृपा से भजन का मार्ग मिलता है",source:"youtube-caption"}];
const record=()=>({videoId:"test",title:"#8",url:"https://www.youtube.com/watch?v=test",status:"done",transcript:chunks[0].text,chunks,meta:{quality:requireQuality(chunks,10)}});
test("quality failure prevents acquiring a write connection",async()=>{
 const v=record();delete v.meta.quality;await assert.rejects(syncSeedToNeon(v),/quality gate/);assert.equal(acquired,0);
});
test("failed chunk write rolls back; done record never commits",async()=>{
 calls=[];failInsert=true;await assert.rejects(syncSeedToNeon(record()),/simulated/);
 assert(calls.includes("ROLLBACK"));assert(!calls.includes("COMMIT"));assert.equal(released,1);
});
test("video, full chunk set and quality report commit together",async()=>{
 calls=[];failInsert=false;await syncSeedToNeon(record());
 assert(calls.some(sql=>sql.includes("INSERT INTO transcript_quality")));assert.equal(calls.at(-1),"COMMIT");assert.equal(released,2);
});
