// Behaviour the consumers rely on: configuration seams, identity, payloads.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");

// A venture's tenant record carries its alert endpoint (D15). Tests that expect
// an alert load the engine the way a venture page does: with that record.
var VENTURE = { piNotify: "/.netlify/functions/prospect-alert" };
var TENANT = { piNotify: "/.netlify/functions/prospect-alert", storagePrefix: "vt_", piIdentityKeys: { name: "vt_deck_name", email: "vt_deck_email" },
  piPaths: { grow: { motivation: "Growth", lean: "builder" } } };

test("the public API is exactly what the README promises", function () {
  var PI = load().PI;
  assert.deepEqual(Object.keys(PI).sort(), ["PRESENT", "RULES", "RULES3", "ack", "analyze", "config", "finish", "hold", "nextQuestion", "notify", "offer", "present", "profile", "read", "release", "reset", "signals", "track", "version"]);
  assert.equal(PI.version, 2);
});

test("the affiliate handle comes from ?u= and is never a display name", function () {
  var e = load({ TENANT: VENTURE, query: "?u=dana" });
  assert.equal(e.PI.config().rep, "dana");
  e.PI.track("scene", { index: 5, total: 24 }); e.PI.track("cta", { action: "enroll" });
  var alert = JSON.parse(e.beacons.filter(function (b) { return /prospect-alert/.test(b.url); })[0].body);
  assert.equal(alert.handle, "dana");
  assert.ok(!("intelligence" in alert) && !("emailHtml" in alert), "the alert payload carries only the flat read");
});

test("storage keys are namespaced by the venture's storagePrefix", function () {
  var e = load({ query: "?u=dana", TENANT: TENANT });
  e.PI.track("name", { name: "Sam" });
  assert.ok(e.store.vt_prospect_id, "identity was not remembered under the prefix");
  e.PI.track("scene", { index: 3, total: 24 }); e.PI.track("cta", { action: "enroll" });
  assert.ok(e.store.vt_prospect, "the prospect key was not created under the prefix");
  var p = JSON.parse(e.beacons.filter(function (b) { return /pi-profile/.test(b.url); })[0].body);
  assert.equal(p.prospect, e.store.vt_prospect);
  var bare = load({ query: "?u=dana" }); bare.PI.track("name", { name: "Sam" });
  assert.ok(bare.store.pi_prospect_id, "without a tenant record the engine uses its own pi_ prefix");
});

test("a prospect who introduced themselves on the venture's deck is picked up from its keys", function () {
  var e = load({ query: "?u=dana", TENANT: TENANT, store: { vt_deck_name: "Sam", vt_deck_email: "sam@example.test" } });
  assert.equal(e.PI.signals().name, "Sam"); assert.equal(e.PI.signals().email, "sam@example.test");
  // …and via PI.config() when the keys arrive after load.
  var late = load({ query: "?u=dana", store: { any_name: "Rae" } });
  assert.equal(late.PI.signals().name, null);
  late.PI.config({ identityKeys: { name: "any_name" } });
  assert.equal(late.PI.signals().name, "Rae");
});

test("identity survives a reload, and hydration runs after the rep-handle guard", function () {
  var first = load({ TENANT: VENTURE, query: "?u=dana" });
  first.PI.track("contact", { name: "Sam", email: "sam@example.test", method: "email" });
  var again = load({ TENANT: VENTURE, query: "?u=dana", store: first.store });
  assert.equal(again.PI.signals().name, "Sam"); assert.equal(again.PI.signals().email, "sam@example.test");
  var alertBody = function () { again.PI.track("scene", { index: 20, total: 24 }); again.PI.track("cta", { action: "enroll" });
    return JSON.parse(again.beacons.filter(function (b) { return /prospect-alert/.test(b.url); })[0].body); };
  var a = alertBody();
  assert.equal(a.prospectName, "Sam"); assert.equal(a.prospectEmail, "sam@example.test");
});

test("the path vocabulary comes from the tenant record or PI.config({paths}) — never the engine", function () {
  var e = load({ TENANT: TENANT }); e.PI.track("path", { path: "grow" });
  assert.equal(e.PI.profile().dna.primaryMotivation, "Growth");
  var f = load(); f.PI.config({ paths: { calm: { motivation: "Peace of mind", lean: "customer" } } }); f.PI.track("path", { path: "calm" });
  assert.equal(f.PI.profile().dna.primaryMotivation, "Peace of mind");
  assert.equal(f.PI.config().paths, undefined, "paths is not a CFG field");
});

test("the alert endpoint comes from the tenant record or PI.config(), and from the link never (D15)", function () {
  function alerts(e) { return e.beacons.filter(function (b) { return !/pi-profile/.test(b.url); }).map(function (b) { return b.url; }); }
  // the tenant record sets it
  var t = load({ TENANT: VENTURE, query: "?u=dana" });
  assert.equal(t.PI.config().notify, "/.netlify/functions/prospect-alert");
  // a hostile link cannot move it, and cannot plant email or site either
  var h = load({ TENANT: VENTURE, query: "?u=dana&notify=https://evil.example/steal&email=x@evil.example&site=https://evil.example" });
  assert.equal(h.PI.config().notify, "/.netlify/functions/prospect-alert");
  assert.equal(h.PI.config().email, null); assert.equal(h.PI.config().site, null);
  h.PI.track("contact", { name: "Sam", email: "sam@example.test", phone: "801-555-0100" });
  h.PI.track("scene", { index: 20, total: 24 }); h.PI.track("cta", { action: "enroll" }); h.PI.finish();
  assert.ok(alerts(h).length > 0, "the alert still goes out");
  assert.ok(h.beacons.every(function (b) { return !/evil/.test(b.url); }), "something was sent to the link's address");
  assert.deepEqual(alerts(h).filter(function (u) { return u !== "/.netlify/functions/prospect-alert"; }), []);
  // window globals no longer count either
  var g = load({ query: "?u=dana", globals: { PI_NOTIFY_URL: "https://evil.example/a", HS_NOTIFY_URL: "https://evil.example/b", H2_NOTIFY_URL: "https://evil.example/c" } });
  assert.equal(g.PI.config().notify, null);
  // with neither the record nor config: no alert at all, but the profile is still saved
  var n = load({ query: "?u=dana&notify=/x/alert" });
  assert.equal(n.PI.config().notify, null);
  n.PI.track("scene", { index: 20, total: 24 }); n.PI.track("cta", { action: "enroll" });
  assert.deepEqual(alerts(n), [], "no endpoint means no alert, not a guessed one");
  assert.ok(n.beacons.some(function (b) { return /pi-profile/.test(b.url); }), "the profile is still persisted");
  // PI.config() is the code-side override, and wins over the record
  var c = load({ TENANT: VENTURE, query: "?u=dana&notify=/x/alert" }); c.PI.config({ notify: "/y/alert", persist: "/y/profile" });
  c.PI.track("scene", { index: 3, total: 24 }); c.PI.track("cta", { action: "enroll" });
  assert.ok(c.beacons.some(function (b) { return b.url === "/y/alert"; }));
  assert.ok(c.beacons.some(function (b) { return b.url === "/y/profile"; }));
  assert.ok(!c.beacons.some(function (b) { return b.url === "/x/alert"; }));
});

test("consent: PI_CONSENT (or the older HSConsent) not granted means nothing is persisted", function () {
  ["PI_CONSENT", "HSConsent"].forEach(function (name) {
    var g = {}; g[name] = { granted: function () { return false; } };
    var e = load({ query: "?u=dana", consent: false, globals: g });
    e.PI.track("scene", { index: 3, total: 24 }); e.PI.finish();
    assert.ok(!e.beacons.some(function (b) { return /pi-profile/.test(b.url); }), name + ": persisted without consent");
  });
});

test("the persist payload carries the whole read and claims the first visit once", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("scene", { index: 3, total: 24 }); e.PI.track("cta", { action: "enroll" }); e.PI.finish();
  var ps = e.beacons.filter(function (b) { return /pi-profile/.test(b.url); }).map(function (b) { return JSON.parse(b.body); });
  assert.ok(ps.length >= 2);
  assert.equal(ps[0].newVisit, true); assert.equal(ps[1].newVisit, false);
  assert.equal(ps[0].intelligence.schema, "h2-intel-v2");
  assert.match(ps[0].prospect, /^p_[a-z0-9]+$/);
});

test("the top band is Molten; a cool exit stays quiet", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("scene", { index: 1, total: 24 }); e.PI.notify("exit");
  assert.ok(!e.beacons.some(function (b) { return /prospect-alert/.test(b.url); }));
  var s = e.win; // the engine never emits the old name
  // The model lives in src/evaluate.js since 1.7.0.
  var src = require("node:fs").readFileSync(require("node:path").join(require("./_run.js").ROOT, "src", "evaluate.js"), "utf8");
  assert.ok(/heat >= 80 \? "Molten"/.test(src)); void s;
});

test("preview: the read is computed and nothing leaves the browser", function () {
  var e = load({ query: "?u=dana&preview=1" });
  assert.equal(e.PI.config().preview, true);
  e.PI.track("contact", { name: "Sam", email: "sam@example.test" }); e.PI.track("scene", { index: 20, total: 24 });
  e.PI.track("cta", { action: "enroll" }); e.PI.finish(); e.PI.notify("exit");
  assert.deepEqual(e.beacons, [], "preview sent something");
  assert.ok(e.PI.profile().scores.intent > 0, "the read is still computed in preview");
  var f = load({ query: "?u=dana" }); f.PI.config({ preview: true }); f.PI.track("cta", { action: "enroll" });
  assert.deepEqual(f.beacons, [], "PI.config({preview}) did not stop sending");
});

/* ── 26 September 2026 · the contact alert waits for a true read ─────────── */
function alerts(e) { return e.beacons.filter(function (b) { return /prospect-alert/.test(b.url); }).map(function (b) { return JSON.parse(b.body); }); }
function withTimers() {
  var timers = [];
  return { globals: { setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }, clearTimeout: function (id) { if (timers[id - 1]) timers[id - 1].fn = null; } }, timers: timers };
}

test("typing an email does not send the alert; finishing the deck does — with the finished read", function () {
  var t = withTimers(); var e = load({ TENANT: VENTURE, query: "?u=dana", globals: t.globals });
  e.PI.track("scene", { index: 1, total: 24 });
  e.PI.track("contact", { name: "Kev", email: "kev@example.test", method: "email" }); e.PI.notify("hot_lead");
  assert.equal(alerts(e).length, 0, "the alert went out at scene 1, before anything was watched");
  for (var i = 2; i <= 23; i++) e.PI.track("scene", { index: i, total: 24 });
  e.PI.finish();
  var a = alerts(e);
  assert.equal(a.length, 1, "exactly one alert after the finish");
  assert.equal(a[0].prospectEmail, "kev@example.test");
  assert.equal(a[0].furthestScene, 23, "the read is the finished one, not the welcome screen");
  assert.equal(a[0].totalScenes, 24);
  assert.ok(a[0].score > 22, "a finished prospect is not published as a cool window-shopper: " + a[0].score);
});

test("a contact that goes quiet is released by the idle timer, and by leaving the page", function () {
  var t = withTimers(); var e = load({ TENANT: VENTURE, query: "?u=dana", globals: t.globals });
  e.PI.track("contact", { email: "kev@example.test", method: "email" }); e.PI.notify("hot_lead");
  e.PI.track("scene", { index: 4, total: 24 });
  assert.equal(alerts(e).length, 0);
  var last = t.timers[t.timers.length - 1];
  assert.equal(last.ms, 3 * 60 * 1000, "idle release is three minutes");
  last.fn();
  assert.equal(alerts(e).length, 1, "the idle timer released the contact alert");
  assert.equal(alerts(e)[0].furthestScene, 4);

  var f = load({ TENANT: VENTURE, query: "?u=dana", globals: withTimers().globals });
  f.PI.track("contact", { email: "kev@example.test", method: "email" }); f.PI.notify("hot_lead");
  f.PI.track("scene", { index: 2, total: 24 });
  f.PI.notify("exit");
  assert.equal(alerts(f).length, 1, "leaving the page releases the contact alert even when the read is cool");
});

test("a CTA after a held contact sends one email, not two; a finish after that only sends when the read moved", function () {
  var t = withTimers(); var e = load({ TENANT: VENTURE, query: "?u=dana", globals: t.globals });
  e.PI.track("contact", { email: "kev@example.test", method: "email" }); e.PI.notify("hot_lead");
  e.PI.track("scene", { index: 3, total: 24 });
  e.PI.track("cta", { action: "enroll" });
  assert.equal(alerts(e).length, 1, "one email for the CTA, carrying the contact");
  assert.equal(alerts(e)[0].event, "cta");
  e.PI.track("scene", { index: 4, total: 24 }); e.PI.finish();
  assert.equal(alerts(e).length, 1, "one scene further is not news");
  var g = load({ TENANT: VENTURE, query: "?u=dana", globals: withTimers().globals });
  g.PI.track("contact", { email: "kev@example.test", method: "email" }); g.PI.notify("hot_lead");
  g.PI.track("scene", { index: 3, total: 24 }); g.PI.track("cta", { action: "enroll" });
  for (var i = 4; i <= 23; i++) g.PI.track("scene", { index: i, total: 24 });
  g.PI.finish();
  assert.equal(alerts(g).length, 2, "finishing twenty scenes later IS news — an upgrade goes out");
  assert.equal(alerts(g)[1].finished, true);
});
