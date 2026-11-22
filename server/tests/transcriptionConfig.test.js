const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {assertTranscriptionConfig}=require('../services/transcriptionConfig');
test('duplicate and shadowed credentials stop before provider requests without exposing values',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'transcription-config-'));const file=path.join(dir,'.env');
 try {
  fs.writeFileSync(file,'ASSEMBLYAI_API_KEY=new-test\nASSEMBLYAI_API_KEY=old-test\n');
  assert.throws(()=>assertTranscriptionConfig(file,'assemblyai',{ASSEMBLYAI_API_KEY:'old-test'}),e=>/Duplicate/.test(e.message)&&!e.message.includes('old-test'));
  fs.writeFileSync(file,'ASSEMBLYAI_API_KEY=new-test\n');
  assert.throws(()=>assertTranscriptionConfig(file,'assemblyai',{ASSEMBLYAI_API_KEY:'old-test'}),/differs from local env/);
  assert.doesNotThrow(()=>assertTranscriptionConfig(file,'assemblyai',{ASSEMBLYAI_API_KEY:'new-test'}));
 }finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
