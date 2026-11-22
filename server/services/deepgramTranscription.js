const fs = require('fs');
const axios = require('axios');

function segmentsFromResponse(data) {
  const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  let prior = -1;
  for (const w of words) {
    // Adjacent words may overlap in the source alignment. A start moving back
    // is invalid only when the entire word precedes the previous word's start.
    // Keep source order/text and timestamps; never shift words to force order.
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start || w.end < prior) {
      const error = new Error('Deepgram quality rejected: invalid source word timestamps ' + JSON.stringify({start:w.start,end:w.end,previousStart:prior}));
      error.code = 'TRANSCRIPT_QUALITY'; throw error;
    }
    prior = w.start;
  }
  // Like AssemblyAI, group source words into timed speech spans. A provider can
  // assign a word a zero-length interval; preserve it inside its source span,
  // never fabricate a duration or silently drop the word.
  const segments = [];
  for (let i = 0; i < words.length; i += 45) {
    const group = words.slice(i, i + 45);
    segments.push({text:group.map(w=>w.punctuated_word || w.word || '').join(' '),startTime:Math.min(...group.map(w=>w.start)),endTime:Math.max(...group.map(w=>w.end)),source:'deepgram'});
  }
  return segments;
}

async function transcribeWithDeepgram(audioPath, client = axios) {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY required');
  try {
    const response = await client.post('https://api.deepgram.com/v1/listen', fs.createReadStream(audioPath), {
      headers: { Authorization: 'Token ' + process.env.DEEPGRAM_API_KEY, 'Content-Type': 'application/octet-stream' },
      params: { model: 'nova-3', language: 'hi', punctuate: true },
      timeout: 900000, maxBodyLength: Infinity, maxContentLength: Infinity,
    });
    const words = response.data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    console.log('Deepgram timing metadata: ' + JSON.stringify({words:words.length,zeroDurationWords:words.filter(w=>w.start===w.end).length,duration:response.data.metadata?.duration}));
    const segments = segmentsFromResponse(response.data);
    return { segments, transcript: segments.map(s => s.text).join(' '), source: 'deepgram' };
  } catch (error) {
    if (error.code === 'TRANSCRIPT_QUALITY') throw error;
    // Never retain axios request/config objects containing credentials.
    const status = error.response?.status;
    const failure = new Error('Deepgram request failed' + (status ? ': HTTP ' + status : ': network/timeout error'));
    failure.code = [401, 402, 403, 429].includes(status) ? 'PROVIDER_NEEDS_ATTENTION' : 'DEEPGRAM_REQUEST_FAILED';
    throw failure;
  }
}
module.exports = { segmentsFromResponse, transcribeWithDeepgram };
