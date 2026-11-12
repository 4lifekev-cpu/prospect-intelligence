// The evidence read (rules 2.0.0). These tests pin the PROPERTIES the read
// promises — nothing observed scores nothing, a required field earns nothing,
// every point has a reason — and one worked example whose arithmetic is
// published. Retuning a weight at a validation gate should break the worked
// example and the golden set, and nothing else.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var golden = require("./golden-read.json");
var plain = function (v) { return JSON.parse(JSON.stringify(v)); };

// A clock the test owns, so "seconds on a scene" is exact.
function clock(start) {
  var t = start || Date.UTC(2026, 10, 9, 18, 0, 0);
  function FakeDate(a) { return arguments.length ? new Date(a) : new Date(t); }
  FakeDate.now = function () { return t; }; FakeDate.UTC = Date.UTC; FakeDate.parse = Date.parse;
  return { Date: FakeDate, tick: function (sec) { t += sec * 1000; }, set: function (ms) { t = ms; } };
}
function sum(reasons) { return reasons.reduce(function (n, r) { return n + r.pts; }, 0); }
// 23 scenes; scenes 12-14 are the business case, 15-17 the product.
var TOPICS = []; [12, 13, 14].forEach(function (i) { TOPICS[i] = "business"; }); [15, 16, 17].forEach(function (i) { TOPICS[i] = "product"; });
function base(over) {
  return Object.assign({ totalDepth: 23, sceneSec: [], ctaActions: [], answers: {}, revisits: {}, phoneOffered: true }, over || {});
}
function watched(n, sec) { var a = []; for (var i = 0; i < 23; i++) a.push(i < n ? (sec || 20) : 0); return a; }

test("nothing observed scores nothing, on every dimension", function () {
  var PI = load().PI, r = PI.read(base(), {});
  assert.equal(r.band, "none"); assert.equal(r.evidence.strength, "thin");
  ["intent", "customer", "builder", "openness"].forEach(function (d) { assert.equal(r.dims[d].score, 0, d + " has a floor above zero"); });
  assert.equal(r.approach, null, "a session with no read is given no archetype");
  assert.equal(r.action.timing, "none");
});

test("a required name and email earn nothing", function () {
  var PI = load().PI;
  var a = PI.read(base(), {}), b = PI.read(base({ name: "Dana", email: "dana@example.test" }), {});
  assert.deepEqual(plain(a.dims), plain(b.dims));
  assert.equal(b.band, "none");
});

test("choosing a path alone is a direction, not a read", function () {
  var PI = load().PI, r = PI.read(base({ path: "income", lean: "builder" }), { topics: TOPICS });
  assert.equal(r.dims.builder.score, 40); assert.equal(r.dims.intent.score, 0);
  assert.equal(r.band, "none", "two taps on the welcome screen must not publish a band");
});

test("every point carries a reason, and the reasons sum to the score", function () {
  var PI = load().PI;
  Object.keys(golden).forEach(function (k) {
    var r = PI.read(golden[k].signals, golden[k].opts);
    Object.keys(r.dims).forEach(function (d) {
      if (r.dims[d].measured) assert.equal(sum(r.dims[d].reasons), r.dims[d].score, k + "." + d);
    });
  });
});

test("the published worked example: 17 of 23 scenes, income path, finished, asked for contact", function () {
  var PI = load().PI, secs = watched(23, 20);
  [3, 7, 9, 16, 19, 21].forEach(function (i) { secs[i] = 2; });          // six skipped in under 4s
  var r = PI.read(base({ path: "income", lean: "builder", sceneSec: secs, finished: true, ctaActions: ["text"], revisits: { 12: 2 } }), { topics: TOPICS });
  assert.equal(r.evidence.qualified, 17); assert.equal(r.evidence.share, 74);
  assert.equal(r.dims.intent.score, 52);      // 22 views + 10 finished + 20 asked
  assert.equal(r.dims.builder.score, 70);     // 40 path + 30 × 3/3
  assert.equal(r.dims.customer.score, 20);    // 30 × 2/3
  assert.equal(r.dims.openness.score, 40);    // asked; no phone volunteered
  assert.deepEqual(plain(r.dims.urgency), { measured: false, why: "not_asked" });
  assert.equal(r.band, "molten"); assert.equal(r.evidence.strength, "solid");
  assert.equal(r.approach.key, "ready_now"); assert.equal(r.approach.rule, "asked_next_step");
  assert.equal(r.action.timing, "within_hour"); assert.equal(r.action.opener, "ask_about_business");
  var enroll = r.wouldChange.filter(function (w) { return w.if === "tapped_enroll"; })[0];
  assert.equal(enroll.intent, 77, "an enroll tap is worth exactly its 25 points");
  assert.ok(r.wouldChange.some(function (w) { return w.if === "no_reply_3d" && w.band === "warm"; }));
});

test("a request without a viewing is its own band, never Molten", function () {
  var PI = load().PI, r = PI.read(base({ sceneSec: watched(2), ctaActions: ["enroll"] }), {});
  assert.equal(r.band, "request"); assert.equal(r.action.timing, "now");
  assert.notEqual(r.evidence.strength, "solid");
});

test("a link tap is not a request", function () {
  var PI = load().PI, r = PI.read(base({ sceneSec: watched(10), ctaActions: ["website", "social"] }), {});
  assert.equal(r.band, "cool"); assert.equal(r.dims.intent.score, 13);
  assert.notEqual(r.approach.key, "ready_now", "the model called any tap 'booked'; the read does not");
});

test("bands without a request: cool under 25, warm 25-49, hot from 50", function () {
  var PI = load().PI;
  assert.equal(PI.read(base({ sceneSec: watched(12) }), {}).band, "cool");                                   // 16
  assert.equal(PI.read(base({ sceneSec: watched(23), finished: true }), {}).band, "warm");                   // 40
  assert.equal(PI.read(base({ sceneSec: watched(23), finished: true, returning: true }), {}).band, "hot");   // 55
});

test("a scene needs half its narration, and never less than the floor", function () {
  var PI = load().PI, narration = []; narration[0] = 60;
  var s = base({ sceneSec: [20, 5, 3] });
  assert.equal(PI.read(s, {}).evidence.qualified, 2, "4-second floor");
  assert.equal(PI.read(s, { narration: narration }).evidence.qualified, 1, "scene 0 needs 30s of its 60");
});

test("what was not measured says so, and is never a zero", function () {
  var PI = load().PI;
  var es = PI.read(base({ sceneSec: watched(23), phoneOffered: false }), {});
  assert.deepEqual(plain(es.dims.openness), { measured: false, why: "phone_not_offered" });
  var asked = PI.read(base({ sceneSec: watched(23), answers: { timing: "month" } }), {});
  assert.equal(asked.dims.urgency.score, 60);
  var noTopics = PI.read(base({ sceneSec: watched(23) }), {});
  assert.deepEqual(plain(noTopics.dims.builder.notes), ["topics_not_configured"]);
});

test("the venture's own traffic is never scored", function () {
  var PI = load().PI, r = PI.read(base({ sceneSec: watched(23), finished: true, ctaActions: ["enroll"] }), { internal: true });
  assert.equal(r.band, "excluded"); assert.equal(r.approach, null);
});

test("there is no probability anywhere in the read, and it says it is unvalidated", function () {
  var PI = load().PI, r = PI.read(golden.full_watch_asked.signals, golden.full_watch_asked.opts);
  assert.ok(!/probab|likely|confidence/i.test(JSON.stringify(r)));
  assert.deepEqual(plain(r.rules), { version: "2.1.0", status: "unvalidated" });
});

test("every golden evidence read is reproduced exactly (src and dist)", function () {
  [load().PI, load({ dist: true }).PI].forEach(function (PI) {
    Object.keys(golden).forEach(function (k) {
      assert.deepEqual(plain(PI.read(golden[k].signals, golden[k].opts)), golden[k].read, "rules drift on case " + k);
    });
  });
});

/* ── the collector ─────────────────────────────────────────────────────── */

test("scrubbing through a deck leaves no qualified views", function () {
  var c = clock(), e = load({ query: "?u=dana", globals: { Date: c.Date } });
  for (var i = 0; i < 23; i++) { e.PI.track("scene", { index: i, total: 23 }); c.tick(1); }
  var r = e.PI.read();
  assert.equal(r.evidence.qualified, 0); assert.equal(r.band, "none");
});

test("watching is counted, and going back is noticed without the deck saying so", function () {
  var c = clock(), e = load({ query: "?u=dana", globals: { Date: c.Date } });
  [0, 1, 2, 3].forEach(function (i) { e.PI.track("scene", { index: i, total: 23 }); c.tick(12); });
  e.PI.track("scene", { index: 1, total: 23 }); c.tick(30);
  var s = e.PI.signals();
  assert.deepEqual(plain(s.sceneSec.slice(0, 4)), [12, 42, 12, 12]);
  assert.equal(s.backtracks, 1, "backtracks was 0 for everyone: no deck ever sent PI.track('back')");
  assert.deepEqual(plain(s.revisits), { 1: 1 });
  assert.equal(e.PI.read().evidence.qualified, 4);
});

test("time in a hidden tab is not watching", function () {
  var c = clock(), handlers = {}, doc = { visibilityState: "visible", addEventListener: function (n, f) { handlers[n] = f; } };
  var e = load({ query: "?u=dana", globals: { Date: c.Date, document: doc } });
  e.PI.track("scene", { index: 0, total: 23 }); c.tick(2);
  doc.visibilityState = "hidden"; handlers.visibilitychange(); c.tick(600);
  doc.visibilityState = "visible"; handlers.visibilitychange(); c.tick(1);
  assert.equal(e.PI.signals().sceneSec[0], 3);
});

test("a return is the same browser on a later day", function () {
  var c = clock(), e = load({ query: "?u=dana", globals: { Date: c.Date } });
  e.PI.track("scene", { index: 0, total: 23 });
  assert.equal(e.PI.signals().returning, false);
  c.tick(26 * 3600);
  var again = load({ query: "?u=dana", globals: { Date: c.Date }, store: e.store });
  again.PI.track("scene", { index: 0, total: 23 });
  assert.equal(again.PI.signals().returning, true);
});

test("answers are a closed vocabulary; nothing free-form is kept about a person", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("answer", { key: "timing", value: "<b>soon</b>" }); e.PI.track("answer", { key: "mood", value: "curious" });
  assert.deepEqual(plain(e.PI.signals().answers), { timing: null, experience: null });
  e.PI.track("answer", { key: "timing", value: "now" }); e.PI.track("answer", { key: "experience", value: "yes" });
  assert.deepEqual(plain(e.PI.signals().answers), { timing: "now", experience: "yes" });
});

test("the persisted payload carries the read and stays inside the endpoint's limits", function () {
  var c = clock(), e = load({ query: "?u=dana", globals: { Date: c.Date } });
  e.PI.track("name", { name: "A".repeat(80) }); e.PI.track("path", { path: "income", label: "Extra income" });
  for (var i = 0; i < 64; i++) { e.PI.track("scene", { index: i, total: 64 }); c.tick(25); }
  for (i = 63; i >= 0; i--) { e.PI.track("scene", { index: i, total: 64 }); c.tick(5); }
  e.PI.track("answer", { key: "timing", value: "now" }); e.PI.track("cta", { action: "enroll" }); e.PI.track("cta", { action: "text" });
  var p = JSON.parse(e.beacons.filter(function (b) { return /pi-profile/.test(b.url); }).pop().body);
  assert.equal(p.intelligence.read.schema, "pi-read-v3");
  assert.ok(JSON.stringify(p.signals).length <= 4096, "signals over 4 KB: " + JSON.stringify(p.signals).length);
  assert.ok(JSON.stringify(p.intelligence).length <= 8192, "intelligence over 8 KB: " + JSON.stringify(p.intelligence).length);
});

test("preview still sends nothing", function () {
  var e = load({ query: "?u=dana&preview=1" });
  e.PI.track("scene", { index: 3, total: 23 }); e.PI.track("cta", { action: "enroll" }); e.PI.finish();
  assert.equal(e.beacons.length, 0);
});
