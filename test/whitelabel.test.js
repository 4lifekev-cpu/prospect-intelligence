// A third brand runs on the same engine by configuration and an adapter alone.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var cp = require("node:child_process");
var crypto = require("node:crypto");
var { load, ROOT } = require("./_run.js");
var DIR = path.join(ROOT, "sandbox", "third-brand");
var sha = function (s) { return crypto.createHash("sha256").update(s).digest("hex"); };
var read = function (p) { return fs.readFileSync(p, "utf8"); };
var admin = function (args, cwd) { return cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "admin.mjs")].concat(args), { encoding: "utf8", cwd: cwd || ROOT }); };

test("the third brand's vendored engine is the release, byte for byte", function () {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "vendor.mjs"), "--consumer", DIR, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  var rel = JSON.parse(read(path.join(ROOT, "release.json"))), lock = JSON.parse(read(path.join(DIR, "pi.lock.json")));
  assert.equal(lock.version, rel.version);
  Object.keys(lock.sha256).forEach(function (k) { assert.equal(lock.sha256[k], rel.sha256[k], k); });
  assert.equal(read(path.join(DIR, "vendor", "prospect-intelligence.js")), read(path.join(ROOT, "dist", "prospect-intelligence.js")));
});

test("the engine itself was not changed for this brand: it does not know the brand exists", function () {
  ["src", "dist", "schema", "tools"].forEach(function (d) {
    fs.readdirSync(path.join(ROOT, d)).forEach(function (f) {
      var p = path.join(ROOT, d, f); if (!fs.statSync(p).isFile()) return;
      assert.equal(/meadowlark|copperline/i.test(read(p)), false, d + "/" + f + " names a sandbox brand");
    });
  });
  assert.equal(/meadowlark/i.test(read(path.join(ROOT, "signals.json"))), false);
});

test("the vendored copies work under their vendored names", function () {
  var T = require(path.join(DIR, "vendor", "pi-tenancy.js")), C = require(path.join(DIR, "vendor", "pi-config.js")), I = require(path.join(DIR, "vendor", "pi-integrations.js"));
  var b = { brand: JSON.parse(read(path.join(DIR, "brand.json"))), appearance: JSON.parse(read(path.join(DIR, "appearance.json"))), manifests: [JSON.parse(read(path.join(DIR, "presentation.json")))] };
  assert.deepEqual(T.validateBundle(b, C).errors, []);
  var p = T.publish(T.empty(), b, { role: "owner", tenant: "meadowlark-co" }, Date.parse("2026-11-12T12:00:00Z"), C);
  assert.equal(p.ok, true);
  assert.equal(I.API_VERSION, require("../src/integrations.js").API_VERSION);
  var adapter = require(path.join(DIR, "scripts", "pi-adapter.cjs"));
  assert.equal(adapter.name, "meadowlark"); assert.equal(typeof adapter.evaluator, "object");
});

test("the provisioning tool validates, publishes, rolls back and disables without touching another brand", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-admin-")), reg = path.join(tmp, "registry.json");
  var a = path.join(tmp, "a"), b = path.join(tmp, "b");
  fs.cpSync(DIR, a, { recursive: true, filter: function (s) { return !/[\\/](site|vendor)([\\/]|$)/.test(s); } });
  fs.cpSync(a, b, { recursive: true });
  ["brand.json", "appearance.json"].forEach(function (f) {
    fs.writeFileSync(path.join(b, f), read(path.join(b, f)).replace(/"brandId": "meadowlark"/, '"brandId": "copperline"').replace(/"customerId": "meadowlark-co"/, '"customerId": "copperline-co"'));
  });
  assert.equal(admin(["validate", a]).status, 0);
  assert.equal(admin(["publish", a, "--registry", reg]).status, 1, "no actor, no publish");
  assert.equal(admin(["publish", a, "--registry", reg, "--actor", "affiliate"]).status, 1);
  assert.equal(admin(["publish", a, "--registry", reg, "--actor", "owner", "--tenant", "copperline-co"]).status, 1, "another customer's owner");
  assert.equal(fs.existsSync(reg), false, "a refused publish writes nothing");
  assert.equal(admin(["publish", a, "--registry", reg, "--actor", "owner"]).status, 0);
  assert.equal(admin(["publish", b, "--registry", reg, "--actor", "owner"]).status, 0);
  var v1 = JSON.parse(read(reg)).deployments.meadowlark.active, other = JSON.stringify(JSON.parse(read(reg)).deployments.copperline);
  var ap = JSON.parse(read(path.join(a, "appearance.json"))); ap.colors.accent = "#AA5500"; fs.writeFileSync(path.join(a, "appearance.json"), JSON.stringify(ap));
  assert.equal(admin(["publish", a, "--registry", reg, "--actor", "admin"]).status, 0);
  assert.notEqual(JSON.parse(read(reg)).deployments.meadowlark.active, v1);
  assert.equal(admin(["rollback", "meadowlark", "--registry", reg, "--actor", "owner", "--tenant", "copperline-co"]).status, 1);
  assert.equal(admin(["rollback", "meadowlark", "--registry", reg, "--actor", "owner"]).status, 0);
  assert.equal(JSON.parse(read(reg)).deployments.meadowlark.active, v1, "rollback restores the earlier version");
  assert.equal(admin(["disable", "meadowlark", "--registry", reg, "--actor", "owner"]).status, 0);
  var after = JSON.parse(read(reg));
  assert.equal(after.deployments.meadowlark.status, "disabled");
  assert.equal(JSON.stringify(after.deployments.copperline), other, "the other brand is exactly as it was");
  var h = admin(["health", "--registry", reg]);
  assert.match(h.stdout, /meadowlark\s+disabled/); assert.match(h.stdout, /copperline\s+enabled/);
  // A broken brand is refused, with the reason.
  ap.logo.url = "http://x.example/a.png"; fs.writeFileSync(path.join(a, "appearance.json"), JSON.stringify(ap));
  var bad = admin(["validate", a]); assert.equal(bad.status, 1); assert.match(bad.stderr, /logo/);
});

test("the preview is built from the brand's files, carries its look and none of anyone else's", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-preview-"));
  fs.cpSync(DIR, tmp, { recursive: true });
  assert.equal(admin(["preview", tmp]).status, 0);
  var html = read(path.join(tmp, "site", "index.html")), mail = read(path.join(tmp, "site", "email-preview.html")), tenant = read(path.join(tmp, "site", "tenant.js"));
  assert.match(html, /Meadowlark Home/); assert.match(html, /#2F6B4F/); assert.match(html, /stylist/); assert.match(html, /noindex/);
  assert.match(mail, /Meadowlark Home/); assert.match(mail, /cannot send email until its sending domain is verified/);
  [html, mail, tenant].forEach(function (s) { assert.equal(/gold|silver|metals|transfer factor|at cost/i.test(s), false, "another brand's words"); });
  assert.equal(/<script[^>]+src="https?:/.test(html), false, "no third-party script");
  // The committed preview is what the tool writes today.
  ["index.html", "tenant.js", "email-preview.html"].forEach(function (f) { assert.equal(sha(read(path.join(tmp, "site", f))), sha(read(path.join(DIR, "site", f))), "sandbox/third-brand/site/" + f + " is stale: run tools/admin.mjs preview"); });
  // Text in a brand file cannot become markup or script on the page.
  var b = JSON.parse(read(path.join(tmp, "brand.json"))); b.browser.display.platformName = "A & B";
  fs.writeFileSync(path.join(tmp, "brand.json"), JSON.stringify(b)); assert.equal(admin(["preview", tmp]).status, 0);
  assert.match(read(path.join(tmp, "site", "index.html")), /A &amp; B/);
});

test("the same engine, configured as the third brand, reads a visit and keeps to consent", function () {
  var win = {}; new Function("window", read(path.join(DIR, "site", "tenant.js")))(win);
  var TEN = win.TENANT;
  var e = load({ dist: true, TENANT: TEN });
  for (var i = 0; i < 6; i++) e.PI.track("scene", { index: i, total: 6 });
  e.PI.track("cta", { action: "join" });
  var r = e.PI.read();
  assert.equal(r.rules.version, "2.1.0");
  assert.ok(r.band, "a band is produced");
  assert.ok(Object.keys(e.store).every(function (k) { return k.indexOf("meadowlark_") === 0; }), "storage is under this brand's prefix only: " + Object.keys(e.store));
  // The brand's own link parameter names the stylist; with it, an agreed visit is kept and sent once.
  assert.equal(TEN.piRepParam, "s");
  var k = load({ dist: true, TENANT: TEN, query: "?s=wren" });
  k.PI.track("scene", { index: 0, total: 6 }); k.PI.track("cta", { action: "join" });
  assert.ok(k.beacons.length > 0, "an upload was attempted");
  assert.equal(JSON.parse(k.beacons[0].body).handle, "wren");
  assert.ok(Object.keys(k.store).length > 0 && Object.keys(k.store).every(function (x) { return x.indexOf("meadowlark_") === 0; }), "storage is under this brand's prefix only: " + Object.keys(k.store));
  // An unsafe parameter name in a brand's settings is ignored, not used.
  var odd = load({ dist: true, TENANT: Object.assign({}, TEN, { piRepParam: "__proto__" }), query: "?__proto__=x&u=finch" });
  odd.PI.track("cta", { action: "join" });
  assert.equal(JSON.parse(odd.beacons[0].body).handle, "finch");
  // Declined: nothing kept, nothing sent.
  var d = load({ dist: true, TENANT: TEN, query: "?s=wren", consent: { granted: function () { return false; }, state: function () { return "denied"; } } });
  d.PI.track("scene", { index: 0, total: 6 }); d.PI.track("cta", { action: "join" });
  assert.deepEqual(Object.keys(d.store), []); assert.equal(d.beacons.length, 0);
  // The read is the same engine's read: identical events under a different brand's settings and prefix give the same numbers.
  var other = load({ dist: true, TENANT: Object.assign({}, TEN, { storagePrefix: "copperline_" }) });
  for (i = 0; i < 6; i++) other.PI.track("scene", { index: i, total: 6 });
  other.PI.track("cta", { action: "join" });
  assert.deepEqual(JSON.parse(JSON.stringify(other.PI.read().dims)), JSON.parse(JSON.stringify(r.dims)));
});
