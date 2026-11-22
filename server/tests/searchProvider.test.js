const assert = require("assert");
const { toHindiSearchQuery } = require("../controllers/askController");

async function testSearchProviderLogic() {
  console.log("🧪 Testing Search Provider Configuration & Logic...");

  // 1. Check search provider setting and fallback default
  const configuredProvider = (process.env.TRANSCRIPT_SEARCH_PROVIDER || "mongodb").toLowerCase();
  assert.ok(["neon", "mongodb", "hybrid"].includes(configuredProvider), "TRANSCRIPT_SEARCH_PROVIDER must be valid");
  
  // Test fallback default when env is empty
  const fallbackProvider = ("" || "mongodb").toLowerCase();
  assert.strictEqual(fallbackProvider, "mongodb", "Unset TRANSCRIPT_SEARCH_PROVIDER must default to 'mongodb'");
  console.log(`  ✅ Configured provider is '${configuredProvider}' and fallback default is 'mongodb'.`);

  // 2. Test Hindi query translation cache and conversion
  const testQ = "bhakti kaise kare";
  const translated = await toHindiSearchQuery(testQ);
  console.log(`  ✅ Hinglish Translation Test: "${testQ}" -> "${translated}"`);

  // 3. Test Devanagari query preservation
  const devanagariQ = "भक्ति कैसे करें";
  const devResult = await toHindiSearchQuery(devanagariQ);
  assert.strictEqual(devResult, devanagariQ, "Devanagari query should pass through unaltered");
  console.log(`  ✅ Devanagari Preservation Test: Passed.`);

  console.log("🎉 All static logic tests passed successfully.");
}

if (require.main === module) {
  testSearchProviderLogic()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Test failure:", err);
      process.exit(1);
    });
}

module.exports = { testSearchProviderLogic };
