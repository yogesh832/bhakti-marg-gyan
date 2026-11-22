// Compatibility entry point for the resumable source search.
require("./discoverEkantikSources").main().catch(error=>{console.error(String(error.message).slice(0,300));process.exitCode=1});
