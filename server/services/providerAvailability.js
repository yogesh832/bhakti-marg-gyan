const fs=require("fs"),path=require("path");
const statusPath=path.resolve(__dirname,"../seed-progress/provider-status.json");
function assertAssemblyAvailable(status) {
 const current=status || (fs.existsSync(statusPath)?JSON.parse(fs.readFileSync(statusPath,"utf8")):{});
 if(current.assemblyai?.blocked){const error=new Error("AssemblyAI paused: negative account balance; top-up required before ASR retries");error.code="PROVIDER_BILLING_BLOCKED";throw error;}
}
function recordBillingFailure(detail) {
 if(!/negative.*balance|insufficient.*(?:balance|funds)|top up/i.test(String(detail)))return;
 fs.mkdirSync(path.dirname(statusPath),{recursive:true});
 fs.writeFileSync(statusPath,JSON.stringify({assemblyai:{blocked:true,reason:"negative_account_balance",at:new Date().toISOString()}},null,2));
}
module.exports={assertAssemblyAvailable,recordBillingFailure};
