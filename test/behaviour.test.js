// Behaviour signals (rules 2.1.0): encouragement, struggle, intercepts.
// Everything here is OBSERVED and SHOWN; nothing but an intercept YES scores.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var plain = function (v) { return JSON.parse(JSON.stringify(v)); };

function clock() {
  var t = Date.UTC(2026, 10, 10, 12, 0, 0);
  function FakeDate(a) { return arguments.length ? new Date(a) : new Date(t); }
  FakeDate.now = function () { return t; }; FakeDate.UTC = Date.UTC; FakeDate.parse = Date.parse;
  return { Date: FakeDate, tick: function (ms) { t += ms; } };
}
// A document just real enough: capture listeners by type, elements with
// matches()/parentElement/getAttribute, CustomEvent, and a timer queue.
function page() {
  var h = {}, timers = [], dispatched = [];
  var doc = {
    visibilityState: "visible",
    addEventListener: function (type, fn) { (h[type] = h[type] || []).push(fn); },
    dispatchEvent: function (ev) { dispatched.push(ev); return true; }
  };
  function el(tag, attrs, parent) {
    attrs = attrs || {};
    return { tagName: tag, parentElement: parent || null, getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
      matches: function (sel) { return sel.split(",").some(function (q) { q = q.trim();
        if (/^[a-z]+$/.test(q)) return q === tag.toLowerCase();
        var m = q.match(/^\[([a-z-]+)(?:=([a-z]+))?\]$/); return !!m && attrs[m[1]] != null && (!m[2] || attrs[m[1]] === m[2]); }); } };
  }
  function fire(type, ev) { (h[type] || []).forEach(function (fn) { fn(ev); }); }
  function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
  return { doc: doc, el: el, fire: fire, timers: timers, dispatched: dispatched, CustomEvent: CustomEvent,
    setTimeout: function (fn, ms) { timers.push(fn); return timers.length; }, clearTimeout: function () {},
    flush: function () { var q = timers.splice(0); q.forEach(function (f) { f(); }); } };
}
function boot(opts) {
  var c = clock(), p = page();
  var e = load({ query: "?u=dana" + ((opts && opts.preview) ? "&preview=1" : ""), globals: { Date: c.Date, document: p.doc, CustomEvent: p.CustomEvent, setTimeout: p.setTimeout, clearTimeout: p.clearTimeout, WeakMap: WeakMap } });
  return { PI: e.PI, c: c, p: p, e: e };
}
var BG = { tagName: "DIV" };

test("rage taps use the published definition: 4 taps, 200px, 300ms", function () {
  var b = boot(), body = b.p.el("DIV");
  b.PI.track("scene", { index: 5, total: 23 });
  for (var i = 0; i < 4; i++) { b.p.fire("click", { target: body, clientX: 100 + i * 10, clientY: 200 }); b.c.tick(250); }
  assert.deepEqual(plain(b.PI.signals().struggle), { 5: { rage: 1 } });
  // slow taps are not rage
  var s = boot(); s.PI.track("scene", { index: 5, total: 23 });
  for (i = 0; i < 6; i++) { s.p.fire("click", { target: s.p.el("BUTTON"), clientX: 100, clientY: 200 }); s.c.tick(400); }
  assert.deepEqual(plain(s.PI.signals().struggle), {});
});

test("a dead tap is a tap on nothing that changes nothing", function () {
  var b = boot(), deco = b.p.el("IMG", {}, b.p.el("DIV")), btn = b.p.el("SPAN", {}, b.p.el("BUTTON"));
  b.PI.track("scene", { index: 4, total: 23 });
  b.p.fire("click", { target: btn, clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), {}, "a tap inside a button is not dead");
  b.p.fire("click", { target: deco, clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), { 4: { dead: 1 } });
  // …but a tap-to-advance deck: the scene changed, so it was not dead
  b.p.fire("click", { target: deco, clientX: 1, clientY: 1 }); b.PI.track("scene", { index: 5, total: 23 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), { 4: { dead: 1 } });
});

test("mouse thrash needs six fast reversals; a phone never thrashes", function () {
  var b = boot(); b.PI.track("scene", { index: 6, total: 23 });
  for (var i = 0; i < 8; i++) { b.p.fire("pointermove", { pointerType: "mouse", clientX: i % 2 ? 0 : 200 }); b.c.tick(20); }
  assert.deepEqual(plain(b.PI.signals().struggle), { 6: { thrash: 1 } });
  var t = boot(); t.PI.track("scene", { index: 6, total: 23 });
  for (i = 0; i < 8; i++) { t.p.fire("pointermove", { pointerType: "touch", clientX: i % 2 ? 0 : 200 }); t.c.tick(20); }
  assert.deepEqual(plain(t.PI.signals().struggle), {});
});

test("hovering a call-to-action is recorded only when it rests there", function () {
  var b = boot(), cta = b.p.el("BUTTON", { "data-pi-cta": "enroll" });
  b.p.fire("pointerover", { target: cta }); b.c.tick(300); b.p.fire("pointerout", { target: cta, relatedTarget: BG });
  assert.deepEqual(plain(b.PI.signals().hovered), []);
  b.p.fire("pointerover", { target: cta }); b.c.tick(1200); b.p.fire("pointerout", { target: cta, relatedTarget: BG });
  assert.deepEqual(plain(b.PI.signals().hovered), ["enroll"]);
});

test("replaying a video is encouragement; a looping background clip is not", function () {
  var b = boot();
  var vid = { tagName: "VIDEO", controls: true, loop: false, currentTime: 0, duration: 95 };
  var bg = { tagName: "VIDEO", controls: false, loop: true, currentTime: 0, duration: 8 };
  b.p.fire("play", { type: "play", target: vid }); b.p.fire("ended", { type: "ended", target: vid }); b.p.fire("play", { type: "play", target: vid });
  for (var i = 0; i < 5; i++) { b.p.fire("play", { type: "play", target: bg }); b.p.fire("ended", { type: "ended", target: bg }); }
  assert.deepEqual(plain(b.PI.signals().enc), { media_done: 1, media_replay: 1 });
});

test("coming back after a long break to finish is a resume", function () {
  var b = boot(); b.PI.track("scene", { index: 8, total: 23 });
  b.p.doc.visibilityState = "hidden"; b.p.fire("visibilitychange", {}); b.c.tick(10 * 60 * 1000);
  b.p.doc.visibilityState = "visible"; b.p.fire("visibilitychange", {});
  assert.equal(b.PI.signals().enc.resume, 1);
});

test("an experience can report sharing, saving, the host panel and diligence", function () {
  var b = boot();
  ["share", "save", "host_panel_open", "faq", "disclosure", "interact"].forEach(function (k) { b.PI.track(k, {}); });
  assert.deepEqual(plain(b.PI.signals().enc), { share: 1, save: 1, host: 1, diligence: 2, interact: 1 });
});

test("encouragement and struggle are shown, and score nothing", function () {
  var PI = load().PI, secs = []; for (var i = 0; i < 23; i++) secs.push(20);
  var T = []; T[13] = "business";
  var plainSig = { totalDepth: 23, sceneSec: secs, finished: true };
  var rich = Object.assign({}, plainSig, { enc: { share: 1, media_replay: 2, host: 1 }, struggle: { 13: { rage: 2 } }, hovered: ["enroll"] });
  var a = PI.read(plainSig, { topics: T }), b = PI.read(rich, { topics: T });
  assert.deepEqual(plain(a.dims), plain(b.dims), "a behaviour signal moved a score");
  assert.equal(a.band, b.band);
  assert.deepEqual(plain(b.observed.encouraged.map(function (x) { return x.code; })), ["share", "host", "media_replay"]);
  assert.deepEqual(plain(b.observed.struggled), [{ code: "rage", scene: 13, n: 2, topic: "business" }]);
  assert.deepEqual(plain(b.observed.hovered), ["enroll"]);
  assert.equal(b.action.opener, "help_with_business", "where they struggled is the first thing to offer help with");
  assert.ok(b.evidence.types.indexOf("voluntary") > -1);
});

test("lingering is far past the narration, not merely watching", function () {
  var PI = load().PI, secs = [], nar = []; for (var i = 0; i < 23; i++) { secs.push(20); nar.push(15); }
  secs[15] = 31; secs[16] = 29;
  var r = PI.read({ totalDepth: 23, sceneSec: secs }, { narration: nar });
  assert.deepEqual(plain(r.observed.encouraged), [{ code: "lingered", scene: 15, sec: 31, topic: null }]);
});

test("intercepts are off unless the experience asks for them", function () {
  var b = boot(); b.PI.track("scene", { index: 5, total: 23 }); b.PI.track("scene", { index: 6, total: 23 });
  b.PI.track("scene", { index: 5, total: 23 }); b.PI.track("scene", { index: 6, total: 23 }); b.PI.track("scene", { index: 5, total: 23 });
  assert.equal(b.p.dispatched.length, 0);
});

// Every offer test names a registered experiment; holdoutPct 0 = everyone is offered.
var EXP = { id: "offer-test", holdoutPct: 0 };
// An experience that renders what it is offered and says so.
function renders(b, offers) { return function (o) { offers.push(o); b.PI.track("offer", { kind: o.kind, stage: "shown" }); }; }

test("a second revisit offers a walkthrough, once, with the scene's topic", function () {
  var b = boot(), offers = [];
  b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, offers), scenes: { topics: (function () { var t = []; t[9] = "business"; return t; })() } });
  [8, 9, 8, 9, 8, 9, 8, 9].forEach(function (i) { b.PI.track("scene", { index: i, total: 23 }); b.c.tick(100 * 1000); b.PI.track("offer", { kind: "walkthrough", stage: "dismissed" }); });
  assert.deepEqual(plain(offers), [{ id: "o1-walkthrough", kind: "walkthrough", type: "info", scene: 8, topic: null }]);
  assert.equal(b.p.dispatched.length, 0, "the callback and the event both delivered the same offer");
});

test("no intercept in the first scenes, none in preview, two at most, with a cooldown", function () {
  var early = boot(), o1 = []; early.PI.config({ intercepts: true, experiment: EXP, intercept: renders(early, o1) });
  [0, 1, 0, 1, 0].forEach(function (i) { early.PI.track("scene", { index: i, total: 23 }); });
  assert.equal(o1.length, 0, "scene 0 is too early to interrupt anyone");
  var pv = boot({ preview: true }), o2 = []; pv.PI.config({ intercepts: true, experiment: EXP, intercept: renders(pv, o2) });
  pv.PI.finish(); assert.equal(o2.length, 0);
  var b = boot(), o3 = [], body = b.p.el("DIV"); b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o3) });
  b.PI.track("scene", { index: 6, total: 23 });
  for (var i = 0; i < 4; i++) { b.p.fire("click", { target: body, clientX: 5, clientY: 5 }); b.c.tick(100); }
  assert.equal(o3.length, 0, "an offer interrupted the middle of a scene");
  b.PI.track("scene", { index: 7, total: 23 });                       // the next scene boundary: now the help offer may be made
  b.PI.track("offer", { kind: "help", stage: "dismissed" });
  b.PI.track("scene", { index: 6, total: 23 }); b.PI.track("scene", { index: 7, total: 23 }); b.PI.track("scene", { index: 6, total: 23 });
  assert.deepEqual(plain(o3.map(function (o) { return o.kind; })), ["help"], "the walkthrough came inside the cooldown");
  b.c.tick(120 * 1000); b.PI.finish(); b.PI.track("offer", { kind: "share_link", stage: "dismissed" });
  b.c.tick(120 * 1000); b.PI.track("scene", { index: 7, total: 23 }); b.PI.track("scene", { index: 6, total: 23 });
  assert.deepEqual(plain(o3.map(function (o) { return o.kind; })), ["help", "share_link"], "never more than two");
});

// ── 1.12.0: display, response and fulfilment are separate facts ──
test("no experiment, or the holdout arm: nothing is offered, and the snapshot says which arm", function () {
  var none = boot(), o = []; none.PI.config({ intercepts: true, intercept: renders(none, o) });
  none.PI.finish(); assert.equal(o.length, 0, "offers ran without a registered experiment");
  var held = boot(), h = []; held.PI.config({ intercepts: true, experiment: { id: "offer-test", holdoutPct: 99.9 }, intercept: renders(held, h) });
  held.PI.track("scene", { index: 5, total: 23 }); held.PI.finish();
  assert.equal(h.length, 0); assert.deepEqual(plain(held.PI.signals().ctx.x), { id: "offer-test", arm: "holdout" });
  // The server recomputes the same arm from the session and the experiment.
  var O = require("../src/outcomes.js"), b = boot(); b.PI.config({ intercepts: true, experiment: { id: "offer-test", holdoutPct: 50 } });
  var sig = b.PI.signals(); assert.equal(sig.ctx.x.arm, O.arm({ id: "offer-test", holdoutPct: 50 }, sig.session));
});

test("an eligibility decision with nothing rendered consumes no quota", function () {
  var b = boot(), seen = [];
  b.PI.config({ intercepts: true, experiment: EXP, intercept: function (o) { seen.push(o.kind); } });   // receives the offer, renders nothing
  b.PI.track("scene", { index: 5, total: 23 });
  [6, 5, 6, 5].forEach(function (i) { b.PI.track("scene", { index: i, total: 23 }); });
  assert.deepEqual(seen, ["walkthrough"]);
  b.c.tick(9000);                                                                                      // nobody rendered it
  b.PI.track("scene", { index: 6, total: 23 }); b.PI.track("scene", { index: 5, total: 23 });
  assert.deepEqual(seen, ["walkthrough", "walkthrough"], "an unrendered offer used up the kind");
  var sig = plain(b.PI.signals());
  assert.deepEqual(sig.offers, [{ kind: "walkthrough", n: 2 }], "offered twice, shown never");
  b.PI.track("offer", { kind: "walkthrough", stage: "shown" }); b.PI.track("offer", { kind: "walkthrough", stage: "shown" });
  assert.deepEqual(plain(b.PI.signals().offers), [{ kind: "walkthrough", n: 2, shown: true }], "a second shown for the same offer counted twice");
});

test("without a callback the offer goes to the document, once", function () {
  var b = boot(); b.PI.config({ intercepts: true, experiment: EXP });
  b.PI.track("scene", { index: 5, total: 23 }); b.PI.finish();
  assert.equal(b.p.dispatched.length, 1); assert.equal(b.p.dispatched[0].type, "pi:intercept"); assert.equal(b.p.dispatched[0].detail.kind, "share_link");
});

test("offers wait for a natural moment: not during a hold, a focused form field, or another offer", function () {
  var b = boot(), o = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o) });
  b.PI.track("scene", { index: 5, total: 23 });
  b.PI.hold("narration");
  [6, 5, 6, 5].forEach(function (i) { b.PI.track("scene", { index: i, total: 23 }); });
  assert.equal(o.length, 0, "an offer interrupted narration");
  b.PI.release("narration");
  assert.deepEqual(o.map(function (x) { return x.kind; }), ["walkthrough"], "the waiting offer was lost");
  var f = boot(), fo = []; f.PI.config({ intercepts: true, experiment: EXP, intercept: renders(f, fo) });
  f.p.doc.activeElement = { tagName: "INPUT" };
  f.PI.track("scene", { index: 5, total: 23 }); f.PI.finish();
  assert.equal(fo.length, 0, "an offer appeared over a form the visitor was typing in");
  f.p.doc.activeElement = null; f.PI.track("scene", { index: 6, total: 23 });
  assert.equal(fo.length, 1);
  assert.equal(f.PI.offer("pricing", { scene: 6 }), false, "a second offer was stacked on one still showing");
});

test("a short experience is never interrupted; it may ask one question at the end", function () {
  var b = boot(), o = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o) });
  [3, 4, 3, 4, 3, 4].forEach(function (i) { b.PI.track("scene", { index: i, total: 5 }); });
  assert.equal(b.PI.offer("pricing", { scene: 4 }), false); assert.equal(o.length, 0);
  b.PI.finish();
  assert.equal(o.length, 0, "a short experience got a share offer");
  assert.equal(b.PI.offer("question", { atEnd: true }), true);
  assert.equal(o[0].kind, "question"); assert.equal(o[0].question, "direction");
});

test("limits survive a reload: the same browser, the same day", function () {
  var c = clock(), p = page(), store = {};
  function start() { return load({ query: "?u=dana", store: store, globals: { Date: c.Date, document: p.doc, CustomEvent: p.CustomEvent, setTimeout: p.setTimeout, clearTimeout: p.clearTimeout, WeakMap: WeakMap } }); }
  var a = start(), o = []; a.PI.config({ intercepts: true, experiment: EXP, intercept: function (x) { o.push(x.kind); a.PI.track("offer", { kind: x.kind, stage: "shown" }); } });
  a.PI.track("scene", { index: 5, total: 23 }); a.PI.finish();
  assert.deepEqual(o, ["share_link"]);
  Object.assign(store, a.store);
  c.tick(200 * 1000);
  var b = start(), o2 = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: function (x) { o2.push(x.kind); b.PI.track("offer", { kind: x.kind, stage: "shown" }); } });
  b.PI.track("scene", { index: 5, total: 23 }); b.PI.finish();
  assert.deepEqual(o2, [], "the reload offered the same thing again");
  assert.equal(b.PI.offer("pricing", { scene: 5 }), true, "one offer was left for this visit");
  assert.equal(b.PI.offer("help", { scene: 5 }), false);
});

test("an information offer never becomes a contact request, under either rule version", function () {
  var b = boot(), o = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o) });
  for (var i = 0; i < 12; i++) { b.PI.track("scene", { index: i, total: 23 }); b.c.tick(30000); }
  assert.equal(b.PI.offer("help", { scene: 11 }), true);
  var before = plain(b.PI.read()), before3 = plain(b.PI.read(b.PI.signals(), { rules: "3.0.0" }));
  b.PI.track("offer", { kind: "help", stage: "accepted" });
  b.PI.track("offer", { kind: "help", stage: "requested", channel: "text" });      // not a contact offer: ignored
  b.PI.track("offer", { kind: "help", stage: "fulfilled" });
  var sig = plain(b.PI.signals()), after = plain(b.PI.read()), after3 = plain(b.PI.read(b.PI.signals(), { rules: "3.0.0" }));
  assert.deepEqual(sig.offers, [{ kind: "help", n: 1, shown: true, out: "accepted", ful: true }]);
  assert.deepEqual(sig.requests, []); assert.deepEqual(sig.intercepts, [{ kind: "help", answer: "info" }]);
  assert.deepEqual(after.dims.intent, before.dims.intent, "opening a simpler explanation raised intent under 2.1.0");
  assert.equal(after3.request.state, before3.request.state); assert.equal(after3.request.permitsContact, false);
  assert.equal(b.e.beacons.filter(function (x) { return /prospect-alert/.test(x.url); }).length, 0, "self-service help alerted the affiliate");
});

test("dismissing an offer is recorded and costs nothing", function () {
  var b = boot(), o = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o) });
  for (var i = 0; i < 12; i++) { b.PI.track("scene", { index: i, total: 23 }); b.c.tick(30000); }
  var before = plain(b.PI.read()), before3 = plain(b.PI.read(b.PI.signals(), { rules: "3.0.0" }));
  b.PI.offer("pricing", { scene: 11 }); b.PI.track("offer", { kind: "pricing", stage: "dismissed" });
  b.PI.track("offer", { kind: "pricing", stage: "accepted" });                     // too late: it was dismissed
  var after = plain(b.PI.read()), after3 = plain(b.PI.read(b.PI.signals(), { rules: "3.0.0" }));
  assert.deepEqual(after.dims, before.dims); assert.equal(after.band, before.band);
  assert.deepEqual(after3.dims, before3.dims); assert.equal(after3.temperature.band, before3.temperature.band);
  assert.deepEqual(plain(b.PI.signals().offers), [{ kind: "pricing", n: 1, shown: true, out: "dismissed" }]);
});

test("a contact offer is a request only after yes AND a channel the prospect can be reached on; it alerts once", function () {
  var b = boot(), o = []; b.e.win.TENANT = null;
  b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o), notify: "/.netlify/functions/prospect-alert" });
  for (var i = 0; i < 12; i++) { b.PI.track("scene", { index: i, total: 23 }); b.c.tick(30000); }
  assert.equal(b.PI.offer("contact", { scene: 11, about: "pricing" }), true); assert.equal(o[0].about, "pricing"); assert.equal(o[0].type, "contact");
  b.PI.track("offer", { kind: "contact", stage: "requested", channel: "text" });   // before a yes: nothing
  assert.deepEqual(plain(b.PI.signals().requests), []);
  b.PI.track("offer", { kind: "contact", stage: "accepted" });
  assert.equal(plain(b.PI.read(b.PI.signals(), { rules: "3.0.0" })).request.permitsContact, false, "a yes alone was treated as a request");
  b.PI.track("offer", { kind: "contact", stage: "requested", channel: "text" });   // no phone number given: not usable
  b.PI.track("offer", { kind: "contact", stage: "requested", channel: "carrier-pigeon" });
  assert.deepEqual(plain(b.PI.signals().requests), []);
  b.PI.track("contact", { name: "Sam", phone: "801-555-0100" });
  b.PI.track("offer", { kind: "contact", stage: "requested", channel: "text" });
  b.PI.track("offer", { kind: "contact", stage: "requested", channel: "call" });   // the same request again: one request
  var sig = plain(b.PI.signals()), r3 = plain(b.PI.read(sig, { rules: "3.0.0" }));
  assert.deepEqual(sig.requests, [{ kind: "intercept", channel: "text" }]);
  assert.equal(r3.request.state, "requested"); assert.deepEqual(r3.request.sources, ["intercept"]); assert.deepEqual(r3.request.channels, ["text"]);
  assert.deepEqual(sig.offers, [{ kind: "contact", n: 1, shown: true, out: "accepted", req: "text" }]);
  b.PI.finish();
  var alerts = b.e.beacons.filter(function (x) { return /prospect-alert/.test(x.url); });
  assert.equal(alerts.length, 1, "expected exactly one alert, got " + alerts.length);
  assert.equal(JSON.parse(alerts[0].body).handle, "dana");
});

test("a share is counted when it happens, not when someone taps yes", function () {
  var b = boot(), o = []; b.PI.config({ intercepts: true, experiment: EXP, intercept: renders(b, o) });
  b.PI.track("scene", { index: 5, total: 23 }); b.PI.finish();
  b.PI.track("offer", { kind: "share_link", stage: "accepted" });
  assert.equal(b.PI.signals().enc.share, undefined, "accepting was counted as sharing");
  b.PI.track("offer", { kind: "share_link", stage: "fulfilled" });
  assert.equal(b.PI.signals().enc.share, 1);
});

test("questions: one at a time, the actual answer stored, volunteered answers never asked again", function () {
  var b = boot();
  assert.equal(b.PI.nextQuestion(), "direction");
  b.PI.track("answer", { key: "direction", value: "business" });
  assert.equal(b.PI.signals().lean, "builder"); assert.equal(b.PI.nextQuestion(), "timing");
  b.PI.track("answer", { key: "timing", value: "later" });
  assert.equal(b.PI.signals().answers.timing, "later", "'later' was mapped to a different answer");
  assert.deepEqual(plain(b.PI.read().dims.urgency), { measured: false, why: "answered_unscored", value: "later" });
  assert.deepEqual(plain(b.PI.read(b.PI.signals(), { rules: "3.0.0", questions: ["timing"] }).dims.urgency), { state: "measured", value: "later", kind: "self_report" });
  assert.equal(b.PI.nextQuestion(), "help");
  b.PI.track("answer", { key: "help", value: "cost" }); b.PI.track("answer", { key: "help", value: "<b>free text</b>" });
  assert.equal(b.PI.signals().answers.help, "cost"); assert.equal(b.PI.nextQuestion(), null);
  assert.deepEqual(plain(b.PI.signals().requests), [], "asking for cost details became a contact request");
  // A path chosen on the welcome screen already answers "direction".
  var p = boot(); p.PI.track("path", { path: "wealth" });
  assert.equal(p.PI.nextQuestion(), "timing");
  p.PI.track("answer", { key: "timing", value: "skipped" }); assert.equal(p.PI.nextQuestion(), "help", "a skipped question was asked again");
  p.PI.track("answer", { key: "direction", value: "products" });
  assert.notEqual(p.PI.signals().lean, "customer", "an answer overrode the path the prospect chose");
});

test("a YES to help is the prospect asking for contact, and scores as that", function () {
  var PI = load().PI, secs = []; for (var i = 0; i < 23; i++) secs.push(20);
  var sig = { totalDepth: 23, sceneSec: secs, finished: true };
  var no = PI.read(Object.assign({}, sig, { intercepts: [{ kind: "help", answer: "no" }] }), {});
  var yes = PI.read(Object.assign({}, sig, { intercepts: [{ kind: "help", answer: "yes" }] }), {});
  assert.equal(no.band, "warm"); assert.equal(yes.band, "molten");
  assert.ok(yes.dims.intent.reasons.some(function (r) { return r.code === "asked_contact"; }));
  var share = PI.read(Object.assign({}, sig, { intercepts: [{ kind: "share_link", answer: "yes" }] }), {});
  assert.equal(share.band, "warm", "agreeing to share is encouragement, not a request");
});

test("intercept answers are a closed vocabulary", function () {
  var b = boot();
  b.PI.track("intercept", { kind: "help", answer: "<b>yes</b>" }); b.PI.track("intercept", { kind: "x".repeat(40), answer: "yes" });
  b.PI.track("intercept", { kind: "share_link", answer: "yes" });
  assert.deepEqual(plain(b.PI.signals().intercepts), [{ kind: "share_link", answer: "yes" }]);
  assert.equal(b.PI.signals().enc.share, 1);
});
