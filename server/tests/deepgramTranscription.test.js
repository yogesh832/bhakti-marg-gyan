const {test}=require('node:test');
const assert=require('node:assert/strict');
const {segmentsFromResponse,transcribeWithDeepgram}=require('../services/deepgramTranscription');
const {prepareTranscript}=require('../services/transcriptQuality');
const wrap=words=>({results:{channels:[{alternatives:[{words}]}]}});
test('Deepgram preserves genuine repeats and exact word timestamps with full chunk coverage',()=>{
 const words=Array.from({length:100},(_,i)=>({word:'राम',punctuated_word:'राम',start:i,end:i+0.8}));
 const segments=segmentsFromResponse(wrap(words));
 assert.equal(segments.length,3);assert.equal(segments[2].endTime,99.8);
 const result=prepareTranscript(segments,100);
 assert.equal(result.transcript,words.map(w=>w.word).join(' '));
});
test('zero-length source words survive inside exact source-timed spans; reversed times reject',()=>{
 const segments=segmentsFromResponse(wrap([{word:'जय',start:0,end:0},{word:'राम',start:0,end:1}]));
 assert.deepEqual(segments,[{text:'जय राम',startTime:0,endTime:1,source:'deepgram'}]);
 assert.throws(()=>segmentsFromResponse(wrap([{word:'राम',start:2,end:1}])),e=>e.code==='TRANSCRIPT_QUALITY');
});
test('real episode9/1055 overlapping alignments preserve text and exact span bounds',()=>{
 for(const [previous,start,end] of [[298.82,298.775,299.17502],[158.52,158.28,158.68]]) {
  const result=segmentsFromResponse(wrap([{word:'जय',start:previous,end:previous+0.1},{word:'राम',start,end}]));
  assert.equal(result[0].text,'जय राम');assert.equal(result[0].startTime,start);
  assert.equal(result[0].endTime,Math.max(previous+0.1,end));
 }
 assert.throws(()=>segmentsFromResponse(wrap([{word:'जय',start:10,end:11},{word:'राम',start:2,end:3}])),e=>e.code==='TRANSCRIPT_QUALITY');
});
test('Deepgram missing or invalid source timestamps cannot pass persistence gate',()=>{
 assert.throws(()=>prepareTranscript(segmentsFromResponse(wrap([{word:'कथा'}])),100),e=>e.code==='TRANSCRIPT_QUALITY');
 assert.throws(()=>prepareTranscript(segmentsFromResponse({}),100),e=>e.code==='TRANSCRIPT_QUALITY');
});
test('Deepgram credit/auth/rate failures stop queue without exposing request secret',async()=>{
 const prior=process.env.DEEPGRAM_API_KEY;process.env.DEEPGRAM_API_KEY='test-secret';
 try {for(const status of [401,402,403,429]){
 await assert.rejects(transcribeWithDeepgram(__filename,{post:async(url,stream,config)=>{
 stream.destroy();assert.equal(config.params.language,'hi');assert.equal(config.params.model,'nova-3');
 throw {response:{status},config:{secret:'test-secret'}};
 }}),e=>e.code==='PROVIDER_NEEDS_ATTENTION'&&!e.message.includes('test-secret')&&!e.config);
 }}finally{if(prior===undefined)delete process.env.DEEPGRAM_API_KEY;else process.env.DEEPGRAM_API_KEY=prior;}
});
