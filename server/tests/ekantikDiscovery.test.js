const {test}=require('node:test'),assert=require('node:assert/strict');
const {episodeNumber,extractTitleDate,assessCandidate,mergeVerified,searchBatch}=require('../services/ekantikDiscovery');
const valid={id:'abcdefghijk',title:'#18 / एकांतिक वार्तालाप / 20-11-2022',channel_id:'UCEk1jBxAl6fe-_G37G7huQA',duration:451,availability:'public'};
test('dates, playlist positions and age clips cannot become episode IDs',()=>{
 assert.equal(episodeNumber('20-11-2022 Ekantik #18'),null);
 assert.equal(episodeNumber('18 year old saint'),null);
 assert.equal(assessCandidate({...valid,title:'#96 year old saint'},96).ok,false);
 assert.equal(assessCandidate(valid,19).ok,false);assert.equal(assessCandidate(valid,18).ok,true);
});
test('unapproved channels, shorts and restricted or missing duration are rejected',()=>{
 for(const changes of [{channel_id:'unknown'},{duration:10},{duration:null},{age_limit:18},{availability:'private'},{is_live:true}])
  assert.equal(assessCandidate({...valid,...changes},18).ok,false);
 assert.equal(assessCandidate({...valid,channel_id:'UCYW8IeqIRY_d5STvAUn2k5w'},18).ok,true);
});
test('new candidates cannot overwrite a previous selected source or provenance',()=>{
 const old={url:'https://youtube.com/watch?v=old',title:valid.title,sourceVerification:{kind:'human'}};
 const current={target:1421,videos:[old]};const next={url:'https://youtube.com/watch?v=new',title:valid.title,sourceVerification:{kind:'verified'}};
 const r=mergeVerified(current,[next]);assert.deepEqual(r.manifest.videos,[old]);assert.equal(r.conflicts.length,1);assert.deepEqual(r.added,[]);
 const added=mergeVerified(current,[{...next,title:'#19 Ekantik'}]);assert.deepEqual(added.added,[19]);
});
test('search resumes with unseen episodes before repeating already searched ones',()=>{
 const seen={18:{at:'2026-10-24T01:00:00Z'}};
 assert.deepEqual(searchBatch([18,74,75],seen,2),[74,75]);
 assert.deepEqual(searchBatch([18,74],{18:{at:'2026-10-24T01:00:00Z'},74:{at:'2026-10-24T02:00:00Z'}},1),[18]);
});
test('official1336 without a title date is accepted without inventing one; reuploads still need evidence',()=>{
 const title='#1336 Ekantik Vartalaap & Darshan/Shri Hit Premanand Govind Sharan Ji';
 assert.equal(assessCandidate({...valid,title},1336).ok,true);assert.equal(extractTitleDate(title),null);
 assert.equal(assessCandidate({...valid,title,channel_id:'UCYW8IeqIRY_d5STvAUn2k5w'},1336).reason,'missing_title_date');
});
test('literal compact dates in actual100/118 titles parse without changing title or inferring numbers',()=>{
 assert.deepEqual(extractTitleDate('#100/एकांतिक वार्तालाप #12/022023#/ekantik vartalap'),{raw:'12/022023',iso:'2023-02-12'});
 assert.deepEqual(extractTitleDate('#118 ekantik vartalap 2/32023/Radhakrishana'),{raw:'2/32023',iso:'2023-03-02'});
 assert.equal(extractTitleDate('#18 Ekantik without date'),null);assert.equal(extractTitleDate('31/022023'),null);
});
