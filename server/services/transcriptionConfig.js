const fs = require('fs');
const dotenv = require('dotenv');

function assertTranscriptionConfig(envFile, provider, effective = process.env) {
  const text = fs.readFileSync(envFile, 'utf8');
  const keys = provider === 'deepgram' ? ['DEEPGRAM_API_KEY'] : ['ASSEMBLYAI_API_KEY', 'ASSEMBLYAI_FALLBACK_API_KEY'];
  for (const key of keys) {
  const definitions = text.split(/\r?\n/).filter(line => new RegExp('^\\s*(?:export\\s+)?' + key + '\\s*=').test(line));
  if (definitions.length > 1) throw new Error('Duplicate ' + key + ' definitions; transcription paused until configuration is unambiguous');
  const parsed = dotenv.parse(text);
  if (parsed[key] && effective[key] !== parsed[key]) throw new Error(key + ' differs from local env file; transcription paused');
  }
}
module.exports = { assertTranscriptionConfig };
