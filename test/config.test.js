// Prompt 02 — configuration is data. Manifests and brand configs are versioned,
// validated, and refuse code, formulas, secrets and unknown keys.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var C = require("../src/config.js");

function manifest() {
  return {
    $schema: "pi-presentation-manifest@1", presentationId: "demo", contentVersion: "1.0.0", locales: ["en", "es"],
    scenes: [
      { id: "gate", topic: null, narrationSec: { en: 0, es: 0 }, eligible: false },
      { id: "why", topic: "business", narrationSec: { en: 20, es: 24 } },
      { id: "what", topic: "product", narrationSec: { en: 30, es: 33 } }
    ],
    surfaces: { phone: { legacyOrder: ["gate", "why", "what"] }, desktop: { legacyOrder: ["why", "what"] } },
    ctas: { enroll: "business_next_step", shop: "product_next_step", calendar: "channel_link" },
    questions: [{ id: "timing", answers: ["now", "month", "looking"] }]
  };
}
function brand() {
  return {
    $schema: "pi-brand-config@1", brandId: "demo", configVersion: "1.0.0", customerId: "demo-customer",
    browser: {
      display: { platformName: "Demo" },
      terminology: { customer: { singular: "customer" }, business: { singular: "partner" } },
      domains: ["demo.example"], presentations: ["demo@1.0.0"], channels: ["email"],
      policies: { privacy: "2026-01-01" }, ruleVersion: "2.1.0", flags: { rules3: false }
    },
    server: { rpcSecretEnv: "RPC_SECRET" }
  };
}

test("a well-formed manifest and brand config pass", function () {
  assert.deepEqual(C.validateManifest(manifest()), { ok: true, errors: [] });
  assert.deepEqual(C.validateBrand(brand()), { ok: true, errors: [] });
});

test("scene identity is the id, not the position: each surface numbers its own way", function () {
  var p = C.toScenesConfig(manifest(), "es", "phone"), d = C.toScenesConfig(manifest(), "es", "desktop");
  assert.deepEqual(p.sceneIds, ["gate", "why", "what"]); assert.deepEqual(p.narration, [0, 24, 33]);
  assert.deepEqual(d.sceneIds, ["why", "what"]);         assert.deepEqual(d.narration, [24, 33]);
  assert.deepEqual(p.topics, [null, "business", "product"]);
  assert.deepEqual(p.eligible, [false, true, true]);
  assert.deepEqual(p.actions, { business: ["enroll"], product: ["shop"] });
  assert.deepEqual(p.questions, ["timing"]);
});

test("missing or wrong surface / locale gives no configuration, not a guess", function () {
  assert.equal(C.toScenesConfig(manifest(), "fr", "phone"), null);
  assert.equal(C.toScenesConfig(manifest(), "en", "tv"), null);
  var bad = manifest(); delete bad.scenes[1].narrationSec.es;
  assert.equal(C.toScenesConfig(bad, "en", "phone"), null);
});

test("manifests refuse duplicate ids, unknown scenes, unknown keys and invented CTA meanings", function () {
  var m = manifest(); m.scenes[2].id = "why";
  assert.ok(C.validateManifest(m).errors.some(function (e) { return /duplicate/.test(e); }));
  m = manifest(); m.surfaces.phone.legacyOrder.push("ghost");
  assert.ok(C.validateManifest(m).errors.some(function (e) { return /unknown scene/.test(e); }));
  m = manifest(); m.scenes[0].weight = 3;
  assert.ok(C.validateManifest(m).errors.some(function (e) { return /unknown key "weight"/.test(e); }));
  m = manifest(); m.ctas.enroll = "guaranteed_sale";
  assert.ok(!C.validateManifest(m).ok);
});

test("no code, no formula, no scoring rule can ride in configuration", function () {
  var b = brand(); b.browser.display.platformName = "function(){ return 1 }";
  assert.ok(!C.validateBrand(b).ok);
  b = brand(); b.browser.ruleVersion = "custom";
  assert.ok(C.validateBrand(b).errors.some(function (e) { return /ruleVersion/.test(e); }));
  b = brand(); b.browser.scoring = { intent: "views * 2" };
  assert.ok(C.validateBrand(b).errors.some(function (e) { return /unknown key "scoring"/.test(e); }));
  b = brand(); b.browser.flags.rules3 = "yes";
  assert.ok(!C.validateBrand(b).ok, "a flag must be a boolean");
  var m = manifest(); m.notes = ["${process.env.X}"];
  assert.ok(!C.validateManifest(m).ok);
});

test("secrets never sit in a brand config; `server` holds variable names only", function () {
  var b = brand(); b.server.rpcSecretEnv = "s3cr3t-value";
  assert.ok(C.validateBrand(b).errors.some(function (e) { return /environment variable name/.test(e); }));
  b = brand(); b.browser.display.apiKey = "abc";
  assert.ok(C.validateBrand(b).errors.some(function (e) { return /secret-shaped key/.test(e); }));
  b = brand(); b.browser.display.platformName = "sk_live_51Habc";
  assert.ok(C.validateBrand(b).errors.some(function (e) { return /secret value/.test(e); }));
  var v = C.browserView(brand());
  assert.ok(v && !("server" in v), "browserView leaked the server section");
  assert.ok(!/RPC_SECRET/.test(JSON.stringify(v)));
});

test("an invalid brand gives no browser view at all", function () {
  var b = brand(); b.customerId = "";
  assert.equal(C.browserView(b), null);
});
