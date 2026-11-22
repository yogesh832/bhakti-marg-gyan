const {test}=require("node:test");
const assert=require("node:assert/strict");
const {assertAssemblyAvailable}=require("../services/providerAvailability");
test("known provider billing failure stops before any upload",()=>{
 assert.throws(()=>assertAssemblyAvailable({assemblyai:{blocked:true}}),e=>e.code==="PROVIDER_BILLING_BLOCKED");
 assert.doesNotThrow(()=>assertAssemblyAvailable({assemblyai:{blocked:false}}));
});
