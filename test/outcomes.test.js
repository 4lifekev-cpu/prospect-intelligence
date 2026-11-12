// Outcomes: events, the frozen read, labels, the split and the report (Prompt 10).
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var O = require("../src/outcomes.js");

var DAY = 86400000, T0 = Date.parse("2026-09-01T12:00:00Z"), NOW = T0 + 90 * DAY;
function at(d) { return new Date(T0 + d * DAY).toISOString(); }
function snap(d, o) { o = o || {}; return { id: o.id || d, receivedAt: at(d), presentation: o.p || "demo-deck@1.0.0", excludedReason: o.ex || null,
  read: o.read || { schema: "pi-read-v4", temperature: { band: o.band || "warm" }, request: { state: o.req ? "contact" : "none" }, observed: { finished: !!o.fin, struggledTotal: o.fr || 0 } } }; }
function ev(kind, d, o) { return Object.assign({ kind: kind, occurredAt: at(d), verification: "affiliate_reported" }, o || {}); }
var CTX = { source: "affiliate", actor: "dana", now: NOW };

test("an event is validated; verification comes from the source, never from the caller", function () {
  var ok = O.validate({ kind: "conversation_held", occurredAt: at(3) }, CTX);
  assert.equal(ok.ok, true); assert.equal(ok.event.verification, "affiliate_reported"); assert.equal(ok.event.actor, "dana");
  assert.equal(O.validate({ kind: "business_enrollment", verification: "provider_verified" }, CTX).ok, false, "a caller named its own verification");
  assert.equal(O.validate({ kind: "business_enrollment" }, { source: "provider", sourceId: "billing", actor: "provider:billing", now: NOW }).event.verification, "provider_verified");
  assert.equal(O.validate({ kind: "won" }, CTX).ok, false);
  assert.equal(O.validate({ kind: "follow_up_later" }, CTX).ok, false, "follow up later without a date");
  assert.equal(O.validate({ kind: "follow_up_later", followUpOn: "2026-12-20" }, CTX).event.followUpOn, "2026-12-20");
  assert.equal(O.validate({ kind: "declined", followUpOn: "2026-12-20" }, CTX).ok, false);
  var future = O.validate({ kind: "reply_received", occurredAt: new Date(NOW + DAY).toISOString() }, CTX);
  assert.equal(future.event.occurredAt, new Date(NOW).toISOString()); assert.equal(future.event.occurredAtTrusted, false, "a future event time was trusted");
  assert.equal(O.validate({ kind: "reply_received", occurredAt: "2019-01-01" }, CTX).ok, false);
  assert.equal(O.validate({ kind: "reply_received" }, { source: "affiliate", now: NOW }).ok, false, "no actor");
});

test("the read is frozen before the first action; later reads never replace it", function () {
  var snaps = [snap(0, { band: "cool" }), snap(1, { band: "warm" }), snap(5, { band: "hot" })];
  var first = O.firstAction([ev("outreach_attempted", 2), ev("conversation_held", 4)], null);
  var fz = O.freeze(snaps, first);
  assert.equal(fz.read.temperature.band, "warm", "the read after outreach leaked in");
  assert.equal(O.freeze([snap(3)], O.firstAction([ev("outreach_attempted", 2)])), null, "a read from after the action was used");
  assert.equal(O.freeze([snap(0, { ex: "internal" }), snap(1, { ex: "no_consent" })], null), null, "an excluded read was eligible");
  assert.equal(O.freeze(snaps, null).read.temperature.band, "hot", "with no action the latest read stands");
  assert.equal(O.firstAction([ev("conversation_held", 4)], at(1)), T0 + DAY, "an intercept shown is an action");
  assert.equal(O.firstAction([ev("declined", 1, { voidedAt: at(2) })], null), null, "a voided event still counted as an action");
});

test("the leakage fixture is rejected", function () {
  var good = { frozen: { at: at(1), read: {} }, firstActionAt: at(2), features: { band: "warm" } };
  assert.equal(O.assertNoLeakage(good), true);
  assert.throws(function () { O.assertNoLeakage(Object.assign({}, good, { frozen: { at: at(3), read: {} } })); }, /not earlier/);
  assert.throws(function () { O.assertNoLeakage(Object.assign({}, good, { features: { band: "warm", enrolled: true } })); }, /describes the outcome/);
  assert.throws(function () { O.assertNoLeakage(Object.assign({}, good, { features: { outcomeCount: 2 } })); }, /describes the outcome/);
  assert.throws(function () { O.assertNoLeakage(Object.assign({}, good, { frozen: { at: at(1), read: { outcomes: { enrollment: "verified" } } } })); }, /confirmed outcome/);
  assert.throws(function () { O.assertNoLeakage({ features: {} }); }, /no frozen read/);
});

test("unknown is not failure; open windows are censored; purchase is never enrollment", function () {
  assert.deepEqual(O.label(at(0), [], "conversation", NOW), { state: "unknown" });
  assert.deepEqual(O.label(at(0), [], "conversation", T0 + 5 * DAY), { state: "censored" });
  assert.equal(O.label(at(0), [ev("conversation_held", 3)], "conversation", NOW).state, "positive");
  assert.equal(O.label(at(0), [ev("conversation_held", 20)], "conversation", NOW).state, "unknown", "an event outside the window counted");
  assert.deepEqual(O.label(at(0), [ev("declined", 2)], "enrollment", T0 + 5 * DAY), { state: "negative", reason: "declined" });
  assert.equal(O.label(at(0), [ev("outreach_attempted", 1)], "enrollment", NOW).reason, "worked_no_enrollment");
  var bought = [ev("product_purchase", 4, { verification: "provider_verified" })];
  assert.equal(O.label(at(0), bought, "purchase", NOW).verification, "provider_verified");
  assert.notEqual(O.label(at(0), bought, "enrollment", NOW).state, "positive", "a purchase was counted as an enrollment");
  assert.equal(O.label(at(0), [ev("business_enrollment", 4, { voidedAt: at(5) })], "enrollment", NOW).state, "unknown", "a voided event still counted");
});

function prospect(i, o) { o = o || {};
  return { tenant: o.tenant || "vt", group: "p_" + i, identity: o.identity, snapshots: [snap(o.day || 0, { band: o.band, req: o.req, fin: o.fin })].concat(o.more || []), outcomes: o.outcomes || [] }; }

test("repeat visits are one row, and one person never sits on both sides of the split", function () {
  var a = prospect(1, { more: [snap(1), snap(2)], outcomes: [ev("conversation_held", 6)] });
  var rows = O.build([a], { now: NOW });
  assert.equal(rows.length, 1); assert.equal(rows[0].visits, 3);
  // The same verified person on two browsers, one read before the cutoff and one after.
  var both = O.build([prospect(2, { identity: "h1", day: 0 }), prospect(3, { identity: "h1", day: 40 }), prospect(4, { day: 40 })], { now: NOW });
  var s = O.split(both, at(30));
  assert.equal(O.assertSplit(s), true);
  assert.equal(s.train.length, 2, "the person's later read did not follow them into train"); assert.equal(s.test.length, 1);
  assert.throws(function () { O.assertSplit({ train: [both[0]], test: [both[1]] }); }, /both sides/);
});

test("the first report says the data is insufficient, suppresses small cells and makes no prediction", function () {
  var ps = []; for (var i = 0; i < 12; i++) ps.push(prospect(i, { band: i < 6 ? "hot" : "cool", outcomes: i < 4 ? [ev("conversation_held", 3)] : i < 8 ? [ev("declined", 3)] : [] }));
  var r = O.report(O.build(ps, { now: NOW }));
  var tt = r.tenants.vt, c = tt.presentations["demo-deck@1.0.0"].conversation;
  assert.equal(tt.sufficient, false); assert.match(tt.insufficient, /Not enough recorded outcomes/);
  assert.equal(c.counts.unknown, 4, "unknown was folded into something else"); assert.equal(c.counts.negative, 4); assert.equal(c.counts.positive, 4);
  assert.equal(c.counts.coverage, 66.7);
  assert.equal(c.byBand.hot.suppressed, "small_cohort"); assert.equal(c.byBand.hot.rate, undefined, "a rate for 6 people was shown");
  assert.equal(tt.gates.A.met, false); assert.equal(tt.gates.C.met, false);
  assert.ok(!/probab|% likely|caus(es|ed)\b/i.test(JSON.stringify(r).replace(/not predictions and not causes|No probability is published/g, "")), "the report predicts or claims a cause");
  assert.equal(r.pooled, null);
});

test("tenants are reported separately; pooling needs an explicit permission", function () {
  var ps = []; for (var i = 0; i < 30; i++) ps.push(prospect(i, { tenant: i % 2 ? "vt" : "other", outcomes: [ev(i % 3 ? "declined" : "conversation_held", 2)] }));
  var rows = O.build(ps, { now: NOW });
  var r = O.report(rows);
  assert.deepEqual(Object.keys(r.tenants).sort(), ["other", "vt"]); assert.equal(r.pooled, null);
  assert.equal(r.tenants.vt.presentations["demo-deck@1.0.0"].conversation.overall.n, 15);
  assert.ok(O.report(rows, { pooled: true }).pooled.conversation.overall.n === 30);
});

test("baselines are reported beside the bands: explicit request and completion", function () {
  var ps = []; for (var i = 0; i < 40; i++) ps.push(prospect(i, { req: i < 20, fin: i % 2 === 0, outcomes: [ev(i < 15 ? "conversation_held" : "declined", 2)] }));
  var b = O.report(O.build(ps, { now: NOW })).tenants.vt.presentations["demo-deck@1.0.0"].conversation.baselines;
  assert.equal(b.explicitRequest.yes.rate, 75); assert.equal(b.explicitRequest.no.rate, 0);
  assert.equal(b.completed.yes.n, 20);
});

test("presentation quality is about the presentation and hides small cohorts", function () {
  var ss = []; for (var i = 0; i < 20; i++) ss.push(Object.assign(snap(0, { fin: i < 10, req: i < 12, fr: i < 5 ? 2 : 0 }), { requestAt: at(0), firstResponseAt: i < 12 ? at(0.5) : null, fulfilled: i < 9 }));
  ss.push(snap(0, { ex: "internal", fin: true })); ss.push(snap(0, { p: "tiny@1.0.0" }));
  var q = O.quality(ss);
  var d = q["demo-deck@1.0.0"];
  assert.equal(d.sessions, 20, "excluded traffic was counted"); assert.equal(d.completionRate, 50); assert.equal(d.explicitRequestRate, 60);
  assert.equal(d.requestFulfilment, 75); assert.equal(d.medianHoursToResponse, 12); assert.equal(d.frictionPerSession, 0.5);
  assert.equal(q["tiny@1.0.0"].suppressed, "small_cohort");
  assert.ok(!/name|email|group|prospect/i.test(JSON.stringify(q)), "a prospect appears in the presentation view");
});

test("intercept impact needs a registered randomized holdout and shows harm beside benefit", function () {
  var exp = { id: "offer-help-1", holdoutPct: 50, registeredAt: at(0) };
  assert.equal(O.arm(exp, "s_abc"), O.arm(exp, "s_abc"), "the arm is not stable");
  assert.equal(O.impact({ id: "x", holdoutPct: 50 }, []).reason, "unregistered");
  var ss = []; for (var i = 0; i < 400; i++) { var s = snap(1, {}), a = O.arm(exp, "s_" + i);
    s.session = "s_" + i; s.read.observed.finished = a === "holdout" ? i % 2 === 0 : i % 4 === 0; s.read.request.state = a === "exposed" && i % 3 === 0 ? "contact" : "none"; ss.push(s); }
  ss.push(Object.assign(snap(-5, { fin: true }), { session: "s_before" }));           // before registration: ignored
  var r = O.impact(exp, ss);
  assert.equal(r.ok, true); assert.equal(r.exposure.exposed + r.exposure.holdout, 400);
  assert.ok(r.exposure.holdout > 150 && r.exposure.holdout < 250, "the holdout is not near half: " + r.exposure.holdout);
  assert.ok(r.completionHarm > 15, "completion harm is not shown: " + r.completionHarm);
  assert.ok(r.explicitRequest.exposed > r.explicitRequest.holdout);
  assert.equal(O.impact(exp, ss.slice(0, 12)).reason, "insufficient");
});

test("the module is pure and names no venture", function () {
  var src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "outcomes.js"), "utf8");
  assert.ok(!/require\(|process\.|Date\.now\(|fetch\(|localStorage/.test(src), "outcomes.js reaches outside itself");
});
