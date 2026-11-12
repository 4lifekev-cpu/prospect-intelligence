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

test("a second revisit offers a walkthrough, once, with the scene's topic", function () {
  var b = boot(), offers = [];
  b.PI.config({ intercepts: true, intercept: function (o) { offers.push(o); }, scenes: { topics: (function () { var t = []; t[9] = "business"; return t; })() } });
  [8, 9, 8, 9, 8, 9, 8, 9].forEach(function (i) { b.PI.track("scene", { index: i, total: 23 }); b.c.tick(100 * 1000); });
  assert.deepEqual(plain(offers), [{ kind: "walkthrough", scene: 8, topic: null }]);
  assert.equal(b.p.dispatched[0].type, "pi:intercept");
});

test("no intercept in the first scenes, none in preview, two at most, with a cooldown", function () {
  var early = boot(), o1 = []; early.PI.config({ intercepts: true, intercept: function (o) { o1.push(o); } });
  [0, 1, 0, 1, 0].forEach(function (i) { early.PI.track("scene", { index: i, total: 23 }); });
  assert.equal(o1.length, 0, "scene 0 is too early to interrupt anyone");
  var pv = boot({ preview: true }), o2 = []; pv.PI.config({ intercepts: true, intercept: function (o) { o2.push(o); } });
  pv.PI.finish(); assert.equal(o2.length, 0);
  var b = boot(), o3 = [], body = b.p.el("DIV"); b.PI.config({ intercepts: true, intercept: function (o) { o3.push(o); } });
  b.PI.track("scene", { index: 6, total: 23 });
  for (var i = 0; i < 4; i++) { b.p.fire("click", { target: body, clientX: 5, clientY: 5 }); b.c.tick(100); }
  b.PI.track("scene", { index: 7, total: 23 }); b.PI.track("scene", { index: 6, total: 23 }); b.PI.track("scene", { index: 7, total: 23 }); b.PI.track("scene", { index: 6, total: 23 });
  assert.deepEqual(plain(o3.map(function (o) { return o.kind; })), ["help"], "the walkthrough came inside the cooldown");
  b.c.tick(120 * 1000); b.PI.finish();
  b.c.tick(120 * 1000); b.PI.track("scene", { index: 7, total: 23 }); b.PI.track("scene", { index: 6, total: 23 });
  assert.deepEqual(plain(o3.map(function (o) { return o.kind; })), ["help", "share_link"], "never more than two");
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
