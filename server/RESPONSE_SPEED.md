# Response latency changes

`POST /api/ask` keeps its source-grounded answer and citation contract.

- Hindi questions skip translation. Other questions share concurrent translations
  for the same trimmed question. Successful translations cache for ten minutes,
  with at most 300 entries. The entire translation stage has a three-second
  deadline and abort signal; failure uses the original query and is not cached.
- Groq/OpenAI SDK retries are disabled: the controller already owns fallback and
  its twelve-second provider budgets. Gemini model discovery has a two-second
  network timeout and uses the same abort signal.
- Explicit `TRANSCRIPT_SEARCH_PROVIDER=neon` never loads Mongo documents after
  an empty search. An empty result returns the existing no-answer response;
  a search failure returns HTTP 503. `hybrid` retains Mongo fallback.
- Neon full-text ranking limits candidates before loading metadata and adjacent
  continuation chunks. Source text, continuation, citation filtering and the
  existing substring fallback remain intact.
- Response timing now includes `translationMs`; `totalMs` measures from request
  handler entry through response construction rather than omitting translation.

Checks: `node --test server/tests/responseSpeed.test.js server/tests/sourceAttribution.test.js`

Read-only Neon comparison on 18 November 2026, same connection, alternating old
and new SQL for `मन शांत कैसे रखें`, five results per query:

| SQL | Four samples (ms) | Median (ms) |
| --- | --- | --- |
| Before | 1640, 508, 619, 613 | 616 |
| After | 538, 594, 712, 618 | 606 |

This small sample does not establish a material database speedup. Translation
deadline/cache and avoiding Mongo work are deterministic changes, not a measured
end-to-end AI speedup. No paid model requests were made for these checks.

Follow-up correctness fix: Hindi retrieval now searches original chunk `text`,
preserving combining marks, using migration `003_hindi_search_index.sql`.
The concurrent GIN index was applied to Neon; transcript text was not rewritten.
Question filler words are excluded and a small set of explicit retrieval synonyms
connects बच्चों/पुत्र/संतान and रखना variants. The original question and source
text remain unchanged. The old substring fallback retains its legacy normalized
column. The SQL timing samples above predate this correctness fix.

Question grammar such as `क्या करूं`, `आता है`, and `आ रहा है` is no longer
required as a lexical AND condition. Unique adjacent question phrases boost
matching passages before limiting results; length-normalized rank breaks ties.
This allows the anger question at the beginning of episode #1425 to match even
when its answer does not repeat the user's exact grammatical wording. Results
remain content-based; there is no episode-specific ranking override.

Development-only Postgres sockets can fall back to public DNS for `*.neon.tech`
when system DNS fails. The original hostname is preserved for TLS/SNI; production
and OS resolver settings are unchanged. ChatBox now treats non-2xx/error responses
as errors, rather than presenting database outages as missing transcript answers.
