const fs = require('fs'), path = require('path'), crypto = require('crypto');
const statusPath = path.resolve(__dirname, '../seed-progress/provider-status.json');
const hash = key => crypto.createHash('sha256').update(key).digest('hex');
function isCreditExhaustion(error) {
  const status = error.response?.status;
  if (status && ![400, 402].includes(status)) return false;
  return /negative.*balance|balance.*negative|insufficient.*(?:balance|funds|credit)|credits?.*(?:exhausted|depleted)|(?:exhausted|depleted).*credits?|top.?up required/i.test(error.message || '');
}
async function runWithAssemblyCredentials(operation, options = {}) {
  const keys = [...new Set(options.keys || [process.env.ASSEMBLYAI_API_KEY, process.env.ASSEMBLYAI_FALLBACK_API_KEY])].filter(Boolean);
  const read = options.read || (() => fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {});
  const write = options.write || (state => {fs.mkdirSync(path.dirname(statusPath), {recursive:true});fs.writeFileSync(statusPath+'.tmp',JSON.stringify(state,null,2));fs.renameSync(statusPath+'.tmp',statusPath);});
  let state = read();
  if (state.assemblyai?.blocked) {const e=new Error('AssemblyAI paused: credits unavailable');e.code='PROVIDER_BILLING_BLOCKED';throw e;}
  if (!keys.length) throw new Error('ASSEMBLYAI_API_KEY required');
  const exhausted = {...state.assemblyai?.exhaustedCredentialHashes};
  for (const key of keys) {
    if (exhausted[hash(key)]) continue;
    try { return await operation(key); }
    catch (error) {
      if (!isCreditExhaustion(error)) throw error;
      exhausted[hash(key)] = {at:new Date().toISOString(),reason:'credit_exhaustion'};
      state={...read(),assemblyai:{...read().assemblyai,exhaustedCredentialHashes:exhausted}};
      write(state);
    }
  }
  write({...read(),assemblyai:{...read().assemblyai,blocked:true,reason:'all_configured_credentials_exhausted',exhaustedCredentialHashes:exhausted,at:new Date().toISOString()}});
  const error = new Error('AssemblyAI credits exhausted for primary and available fallback; transcription paused');
  error.code = 'PROVIDER_NEEDS_ATTENTION'; throw error;
}
module.exports = {runWithAssemblyCredentials,isCreditExhaustion};
