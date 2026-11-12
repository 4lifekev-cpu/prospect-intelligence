// Rules 3.0.0 — the truth table for every case Prompt 01 names.
// 2.1.0 stays the default and stays replayable; legacy goldens are untouched
// (model.test.js, read.test.js).
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var dict = require("../signals.json");
var plain = function (v) { return JSON.parse(JSON.stringify(v)); };
var V3 = { rules: "3.0.0" };
function o(extra) { return Object.assign({ rules: "3.0.0" }, extra || {}); }
function w(n, sec, total) { var a = []; for (var i = 0; i < (total || 23); i++) a.push(i < n ? (sec || 20) : 0); return a; }
function s(over) { return Object.assign({ totalDepth: 23, sceneSec: [], ctaActions: [], answers: {}, revisits: {} }, over || {}); }
function sum(r) { return r.reduce(function (n, x) { return n + x.pts; }, 0); }
var PI = load().PI;
var TOP = []; [12, 13, 14].forEach(function (i) { TOP[i] = "business"; }); [15, 16, 17].forEach(function (i) { TOP[i] = "product"; });

test("2.1.0 stays the default; 3.0.0 is opt-in and says so", function () {
  assert.equal(PI.read(s(), {}).rules.version, "2.1.0");
  var r = PI.read(s(), V3);
  assert.deepEqual(plain(r.rules), { version: "3.0.0", status: "unvalidated" });
  assert.equal(r.schema, "pi-read-v4");
  var e = load({ query: "?u=dana" }); e.PI.config({ rules: "3.0.0" });
  assert.equal(e.PI.read().rules.version, "3.0.0"); assert.equal(e.PI.profile().read.schema, "pi-read-v4");
});

test("empty data: insufficient evidence, scores hidden, no trait or probability", function () {
  var r = PI.read(s(), V3);
  assert.equal(r.temperature.band, "insufficient"); assert.equal(r.evidence.strength, "insufficient");
  ["intent", "customer", "builder"].forEach(function (d) { assert.deepEqual(plain(r.dims[d]), { state: "insufficient" }, d); });
  assert.equal(r.approach, null); assert.equal(r.request.state, "none");
  assert.ok(!/probab|likely|percent|confidence/i.test(JSON.stringify(r)));
});

test("answer states: unavailable, not asked, skipped, declined, measured", function () {
  var full = { sceneSec: w(23), finished: true };
  assert.equal(PI.read(s(full), V3).dims.urgency.state, "unavailable", "the presentation never offered the question");
  assert.equal(PI.read(s(full), o({ questions: ["timing"] })).dims.urgency.state, "not_asked");
  assert.equal(PI.read(s(Object.assign({ answerStates: { timing: "skipped" } }, full)), o({ questions: ["timing"] })).dims.urgency.state, "skipped");
  assert.equal(PI.read(s(Object.assign({ answerStates: { timing: "declined" } }, full)), o({ questions: ["timing"] })).dims.urgency.state, "declined");
  var m = PI.read(s(Object.assign({ answers: { timing: "looking" } }, full)), o({ questions: ["timing"] })).dims.urgency;
  assert.equal(m.state, "measured"); assert.equal(m.score, 20); assert.equal(m.kind, "self_report");
});

test("a measured zero is a zero, not missing", function () {
  var r = PI.read(s({ sceneSec: w(23) }), o({ topics: TOP }));
  assert.deepEqual(plain(r.dims.openness.state), "measured"); assert.equal(r.dims.openness.score, 0);
});

test("the intent ceiling is honest: 40 on a first visit, 55 after a return, no forced hot", function () {
  var first = PI.read(s({ sceneSec: w(23), finished: true }), V3);
  assert.equal(first.dims.intent.score, 40); assert.equal(first.dims.intent.ceilingWithoutRequest, 40);
  assert.equal(first.temperature.band, "warm", "a full first watch is warm, not hot");
  assert.equal(first.dims.intent.kind, "rules_index");
  var back = PI.read(s({ sceneSec: w(23), finished: true, returning: true }), V3);
  assert.equal(back.dims.intent.score, 55); assert.equal(back.dims.intent.ceilingWithoutRequest, 55); assert.equal(back.temperature.band, "hot");
});

test("requests are separate from temperature", function () {
  var r = PI.read(s({ sceneSec: w(23), finished: true, requests: [{ kind: "contact_form", channel: "email" }] }), V3);
  assert.equal(r.request.state, "requested"); assert.equal(r.request.permitsContact, true);
  assert.equal(r.temperature.band, "hot", "the request moves intent, and is reported on its own");
  assert.equal(r.action.timing, "within_hour");
});

test("a short experience is readable by its own coverage rule", function () {
  var teaser = PI.read(s({ totalDepth: 2, sceneSec: [12, 14], finished: true }), V3);
  assert.equal(teaser.coverage.needViews, 1); assert.equal(teaser.coverage.sufficient, true);
  assert.notEqual(teaser.temperature.band, "insufficient");
  var long = PI.read(s({ sceneSec: w(2) }), V3);
  assert.equal(long.coverage.needViews, 3); assert.equal(long.temperature.band, "insufficient");
  var blink = PI.read(s({ totalDepth: 2, sceneSec: [2, 0] }), V3);
  assert.equal(blink.temperature.band, "insufficient", "a two-scene deck still needs real exposure");
});

test("an explicit request is actionable even with minimal exposure", function () {
  var r = PI.read(s({ sceneSec: w(1, 3), requests: [{ kind: "callback", channel: "call" }] }), V3);
  assert.equal(r.request.state, "requested"); assert.equal(r.action.timing, "now");
  assert.equal(r.evidence.strength, "partial");
});

test("one tap is one fact: repeated taps and duplicate telemetry do not inflate", function () {
  var once = PI.read(s({ sceneSec: w(23), ctaActions: ["enroll"] }), V3);
  var many = PI.read(s({ sceneSec: w(23), ctaActions: ["enroll", "enroll", "ENROLL", "enroll"] }), V3);
  assert.deepEqual(plain(once.dims), plain(many.dims));
  assert.deepEqual(plain(many.observed.clicked), ["enroll"]);
  var twoSources = PI.read(s({ sceneSec: w(23), ctaActions: ["text"], requests: [{ kind: "contact_form", channel: "text" }, { kind: "contact_form", channel: "text" }] }), V3);
  assert.equal(twoSources.dims.intent.reasons.filter(function (x) { return x.code === "requested_contact" || x.code === "opened_contact_link"; }).length, 1);
  assert.deepEqual(plain(twoSources.request.channels), ["text"]);
});

test("reasons always sum to the score, and a cap is its own reason", function () {
  var maxed = PI.read(s({ sceneSec: w(23), finished: true, returning: true, ctaActions: ["enroll", "text"], requests: [{ kind: "callback", channel: "call" }] }), V3);
  var I = maxed.dims.intent;
  assert.equal(I.score, 100); assert.equal(sum(I.reasons), 100);
  // Under 3.0.0 weights every dimension tops out at exactly 100, so the cap
  // reason cannot appear yet. It exists so a future weight change keeps the
  // sum-equals-score guarantee; this pins that it is not silently firing now.
  assert.ok(!I.reasons.some(function (x) { return x.code === "cap"; }));
  ["customer", "builder", "openness"].forEach(function (d) { if (maxed.dims[d].state === "measured") assert.equal(sum(maxed.dims[d].reasons), maxed.dims[d].score, d); });
});

test("an email request is measurable with no phone field; phone and SMS are not intent", function () {
  var r = PI.read(s({ sceneSec: w(23), phoneOffered: false, requests: [{ kind: "contact_form", channel: "email" }] }), V3);
  assert.equal(r.dims.openness.state, "measured"); assert.equal(r.dims.openness.score, 40); assert.equal(r.dims.openness.ceiling, 40);
  assert.deepEqual(plain(r.request.channels), ["email"]);
  var noPhone = PI.read(s({ sceneSec: w(23), finished: true }), V3);
  var phone = PI.read(s({ sceneSec: w(23), finished: true, phone: "801-555-0100", smsConsent: true }), V3);
  assert.equal(phone.dims.intent.score, noPhone.dims.intent.score, "a phone number is not buying intent");
  assert.equal(phone.dims.openness.score, 60); assert.equal(phone.request.state, "none");
});

test("clicked, submitted, requested, confirmed, started and verified are different facts", function () {
  var cal = PI.read(s({ sceneSec: w(23), ctaActions: ["calendar"] }), V3);
  assert.equal(cal.request.state, "next_step"); assert.equal(cal.request.permitsContact, false); assert.equal(cal.outcomes.booking, "unconfirmed");
  var booked = PI.read(s({ sceneSec: w(23), ctaActions: ["calendar"], bookingConfirmed: true }), V3);
  assert.equal(booked.request.state, "confirmed"); assert.equal(booked.outcomes.booking, "confirmed");
  var enroll = PI.read(s({ sceneSec: w(23), ctaActions: ["enroll"], checkoutStarted: true, enrollmentVerified: true }), V3);
  assert.equal(enroll.request.state, "next_step"); assert.equal(enroll.request.permitsContact, false, "an enroll tap is not contact consent");
  assert.equal(enroll.outcomes.enrollment, "unverified", "the browser can never verify an enrollment");
  assert.equal(enroll.outcomes.checkout, "started");
  var form = PI.read(s({ sceneSec: w(23), requests: [{ kind: "contact_form", channel: "email" }] }), V3);
  assert.deepEqual(plain(form.request.sources), ["contact_form"]);
  var cb = PI.read(s({ sceneSec: w(23), requests: [{ kind: "callback", channel: "call" }] }), V3);
  assert.deepEqual(plain(cb.request.sources), ["callback"]);
});

test("help, pricing, walkthrough, sharing and saving are never permission to contact", function () {
  ["help", "walkthrough", "pricing", "share_link", "send_media"].forEach(function (k) {
    var r = PI.read(s({ sceneSec: w(23), intercepts: [{ kind: k, answer: "yes" }], enc: { share: 1, save: 1 } }), V3);
    assert.equal(r.request.state, "none", k); assert.equal(r.request.permitsContact, false, k);
  });
  var ask = PI.read(s({ sceneSec: w(23), intercepts: [{ kind: "contact", answer: "yes" }] }), V3);
  assert.equal(ask.request.state, "requested"); assert.deepEqual(plain(ask.request.sources), ["intercept"]);
});

test("questions are a bounded count; their words never enter the stored snapshot", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("question", { q: "How much does it cost to start?" }); e.PI.track("question", { q: "Is there a contract?" });
  var snap = e.PI.signals();
  assert.equal(snap.questions, 2); assert.ok(!/cost|contract/.test(JSON.stringify(snap)));
  var r = e.PI.read(s({ sceneSec: w(23), questions: 2 }), V3);
  assert.equal(r.approach.describe, "asked_questions"); assert.equal(r.approach.key, "researcher");
  var legacy = e.PI.analyze(Object.assign(s({ sceneSec: w(23) }), { questions: 2, maxDepth: 22 }));
  assert.equal(legacy.meta.questions, 2, "the frozen model still reads a count");
});

test("experience is a self-report, never a leadership score", function () {
  var r = PI.read(s({ sceneSec: w(23), answers: { experience: "yes" } }), o({ questions: ["experience"] }));
  assert.deepEqual(plain(r.dims.experience), { state: "measured", value: "yes", kind: "self_report" });
  assert.ok(!("leadership" in r.dims));
});

test("the primary label describes behaviour; the legacy archetype key survives", function () {
  var r = PI.read(s({ path: "income", lean: "builder", sceneSec: w(23) }), o({ topics: TOP }));
  assert.equal(r.approach.describe, "reviewing_business"); assert.equal(r.approach.key, "dreamer"); assert.equal(r.approach.name, "The Dreamer");
});

test("no claim about the future: nothing says 'no reply'", function () {
  var r = PI.read(s({ sceneSec: w(23), finished: true, requests: [{ kind: "callback", channel: "call" }] }), V3);
  assert.ok(!/reply/.test(JSON.stringify(r.wouldChange)));
});

test("bounded lists keep their true totals", function () {
  var enc = { share: 1, save: 1, host: 1, diligence: 1, interact: 1, media_replay: 1, media_done: 1, resume: 1 };
  var secs = w(23, 50);
  var r = PI.read(s({ sceneSec: secs, enc: enc }), V3);
  assert.equal(r.observed.encouraged.length, 12); assert.equal(r.observed.encouragedTotal, 31);
});

test("internal traffic is excluded and given nothing", function () {
  var r = PI.read(s({ sceneSec: w(23), ctaActions: ["enroll"] }), o({ internal: true }));
  assert.equal(r.temperature.band, "excluded"); assert.equal(r.approach, null); assert.deepEqual(plain(r.wouldChange), []);
});

test("every code the read can emit is in the signal dictionary", function () {
  var golden = require("./golden-read-v3.json"), seen = {};
  Object.keys(golden).forEach(function (k) {
    var r = PI.read(golden[k].signals, golden[k].opts);
    Object.keys(r.dims).forEach(function (d) { (r.dims[d].reasons || []).forEach(function (x) { seen[x.code] = 1; }); if (r.dims[d].state) assert.ok(dict.states[r.dims[d].state], "state " + r.dims[d].state); });
    assert.ok(dict.request_states[r.request.state], "request state " + r.request.state);
    if (r.approach) assert.ok(dict.describe[r.approach.describe], "describe " + r.approach.describe);
  });
  Object.keys(seen).forEach(function (c) { assert.ok(dict.signals[c] && dict.signals[c].display, "no dictionary entry for " + c); });
});

test("every golden 3.0.0 read is reproduced exactly (src and dist)", function () {
  var golden = require("./golden-read-v3.json");
  [load().PI, load({ dist: true }).PI].forEach(function (P) {
    Object.keys(golden).forEach(function (k) { assert.deepEqual(plain(P.read(golden[k].signals, golden[k].opts)), golden[k].read, "rules drift on case " + k); });
  });
});

test("a 3.0.0 read is stored in the row, and the payload stays inside the endpoint's limits", function () {
  var shape = require("../src/profile-shape.js");
  var e = load({ query: "?u=dana" }); e.PI.config({ rules: "3.0.0" });
  e.PI.track("path", { path: "income", label: "Extra income" });
  for (var i = 0; i < 64; i++) e.PI.track("scene", { index: i, total: 64 });
  for (i = 63; i >= 0; i--) e.PI.track("scene", { index: i, total: 64 });
  e.PI.track("contact_request", { channel: "email" }); e.PI.track("cta", { action: "enroll" });
  var p = JSON.parse(e.beacons.filter(function (b) { return /pi-profile/.test(b.url); }).pop().body);
  assert.equal(p.intelligence.read.schema, "pi-read-v4");
  assert.ok(JSON.stringify(p.signals).length <= 4096, "signals " + JSON.stringify(p.signals).length);
  assert.ok(JSON.stringify(p.intelligence).length <= 8192, "intelligence " + JSON.stringify(p.intelligence).length);
  var row = shape.toProfileRow(p.intelligence, { tenant: "t", prospect: "p_abcdef", handle: "dana" });
  assert.equal(row.profile.read.schema, "pi-read-v4");
  assert.deepEqual(plain(row.profile.read.request), plain(p.intelligence.read.request));
});
