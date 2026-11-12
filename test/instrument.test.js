// Prompt 03 — presentation instrumentation: scope, identity, friction named
// for what it is, media that proves viewing, idle and lifecycle, transport.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var plain = function (v) { return JSON.parse(JSON.stringify(v)); };
var SERVER_EVENTS = ["visit", "scene", "cta", "contact", "finished", "exit"];

function clock() {
  var t = Date.UTC(2026, 10, 11, 12, 0, 0);
  function FakeDate(a) { return arguments.length ? new Date(a) : new Date(t); }
  FakeDate.now = function () { return t; }; FakeDate.UTC = Date.UTC; FakeDate.parse = Date.parse;
  return { Date: FakeDate, tick: function (ms) { t += ms; } };
}
// A page with registered roots, a body, a MutationObserver and window events.
function page(opts) {
  opts = opts || {};
  var h = {}, wh = {}, timers = [], observers = [], rootEls = [];
  function el(tag, attrs, parent) {
    attrs = attrs || {};
    var e = { tagName: tag, parentElement: parent || null, attrs: attrs,
      getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
      hasAttribute: function (k) { return attrs[k] != null; },
      setAttribute: function (k, v) { attrs[k] = String(v); },
      matches: function (sel) { return sel.split(",").some(function (q) { q = q.trim();
        if (/^[a-z]+$/.test(q)) return q === tag.toLowerCase();
        var m = q.match(/^\[([a-z-]+)(?:=([a-z]+))?\]$/); return !!m && attrs[m[1]] != null && (!m[2] || attrs[m[1]] === m[2]); }); } };
    if (attrs["data-pi-root"] != null) rootEls.push(e);
    return e;
  }
  var doc = {
    visibilityState: "visible", documentElement: { lang: opts.lang || "en" }, body: {},
    addEventListener: function (type, fn) { (h[type] = h[type] || []).push(fn); },
    dispatchEvent: function () { return true; },
    querySelector: function (q) { return q === "[data-pi-root]" ? (rootEls[0] || null) : null; },
    querySelectorAll: function () { return []; }
  };
  function MO(cb) { this.cb = cb; this.on = false; observers.push(this); }
  MO.prototype.observe = function () { this.on = true; };
  MO.prototype.disconnect = function () { this.on = false; };
  return {
    doc: doc, el: el, timers: timers, h: h, wh: wh,
    fire: function (type, ev) { (h[type] || []).forEach(function (fn) { fn(ev); }); },
    win: function (type, ev) { (wh[type] || []).forEach(function (fn) { fn(ev || {}); }); },
    mutate: function () { observers.forEach(function (o) { if (o.on) o.cb([]); }); },
    MutationObserver: MO,
    setTimeout: function (fn) { timers.push(fn); return timers.length; }, clearTimeout: function () {},
    flush: function () { var q = timers.splice(0); q.forEach(function (f) { f(); }); }
  };
}
function boot(opts) {
  opts = opts || {};
  var c = clock(), p = page(opts), fetches = [];
  var globals = { Date: c.Date, document: p.doc, setTimeout: p.setTimeout, clearTimeout: p.clearTimeout, WeakMap: WeakMap,
    MutationObserver: opts.noObserver ? undefined : p.MutationObserver,
    addEventListener: function (type, fn) { (p.wh[type] = p.wh[type] || []).push(fn); },
    fetch: function (u, o) { fetches.push({ url: u, body: o.body }); return { catch: function () {} }; } };
  if (opts.beaconRefuses) globals.navigator = { sendBeacon: function () { return false; } };
  var e = load({ query: "?u=dana", TENANT: opts.TENANT, globals: globals });
  if (opts.rules) e.PI.config({ rules: opts.rules });
  return { PI: e.PI, c: c, p: p, e: e, fetches: fetches };
}
function video(p, parent, attrs) {
  var v = p.el("VIDEO", Object.assign({}, attrs || {}), parent);
  v.controls = true; v.loop = false; v.duration = 100; v.currentTime = 0; v.currentSrc = "https://example.test/media/intro.mp4?x=1";
  return v;
}
function play(b, v, from, to) {
  v.currentTime = from; b.p.fire("play", { type: "play", target: v });
  for (var t = from + 1; t <= to; t++) { v.currentTime = t; b.p.fire("timeupdate", { type: "timeupdate", target: v }); }
}

/* ── scope ─────────────────────────────────────────────────────────────── */
test("with a registered root, taps outside it are not collected and the surface comes from the root", function () {
  var b = boot(), deck = b.p.el("DIV", { "data-pi-root": "phone" }), inside = b.p.el("IMG", {}, deck), outside = b.p.el("IMG", {});
  b.PI.track("scene", { index: 3, total: 24 });
  b.p.fire("click", { target: outside, clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), {}, "a tap outside the deck was collected");
  b.p.fire("click", { target: inside, clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), { 3: { dead: 1 } });
  var ctx = b.PI.signals().ctx;
  assert.equal(ctx.scope, "root"); assert.equal(ctx.sf, "phone"); assert.equal(ctx.l, "en");
});

test("without any registered root the whole document is used, and the snapshot says so", function () {
  var b = boot(); b.PI.track("scene", { index: 1, total: 24 });
  b.p.fire("click", { target: b.p.el("IMG", {}), clientX: 1, clientY: 1 }); b.p.flush();
  assert.equal(b.PI.signals().ctx.scope, "document");
  assert.deepEqual(plain(b.PI.signals().struggle), { 1: { dead: 1 } });
});

/* ── identity ──────────────────────────────────────────────────────────── */
test("scenes carry stable ids; seen and eligible ids explain the denominator", function () {
  var M = { manifest: "demo@1.2.0", actions: { business: ["enroll"], product: ["shop"] }, questions: [],
    surfaces: { desktop: { sceneIds: ["welcome", "why", "what", "close"], topics: [null, "business", "product", null], eligible: [true, true, true, false], narration: { en: [10, 20, 30, 0] } } } };
  var b = boot({ TENANT: { piScenesV3: M } });
  b.PI.track("scene", { index: 0, total: 4, key: "welcome", surface: "desktop" });
  b.c.tick(3000); b.PI.track("scene", { index: 1, total: 4, key: "why" });
  var ctx = b.PI.signals().ctx;
  assert.deepEqual(plain(ctx.seen), ["welcome", "why"]);
  assert.deepEqual(plain(ctx.elig), ["welcome", "why", "what"], "the closing scene is not eligible and must not be in the denominator");
  assert.equal(ctx.p, "demo"); assert.equal(ctx.cv, "1.2.0"); assert.equal(ctx.sf, "desktop");
  assert.match(ctx.e, /^s_[a-z0-9]+-\d+$/);
});

/* ── friction ──────────────────────────────────────────────────────────── */
test("a control that answers is not dead; one that never answers is a dead control", function () {
  var b = boot({ rules: "3.0.0" }), btn = b.p.el("BUTTON", {});
  b.PI.track("scene", { index: 4, total: 23 });
  b.p.fire("click", { target: btn, clientX: 1, clientY: 1 }); b.p.mutate(); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), {}, "a control that changed the page was called dead");
  b.p.fire("click", { target: btn, clientX: 50, clientY: 50 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), { 4: { deadctl: 1, dead: 1 } });
});

test("a slow control that says it is busy gets time; a scene change also counts as an answer", function () {
  var b = boot({ rules: "3.0.0" }), btn = b.p.el("BUTTON", { "aria-busy": "true" });
  b.PI.track("scene", { index: 2, total: 23 });
  b.p.fire("click", { target: btn, clientX: 1, clientY: 1 });
  b.p.flush(); b.c.tick(3000); b.p.flush(); b.c.tick(3000);
  b.p.mutate(); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), {}, "a busy control that finished was called dead");
  var n = boot({ rules: "3.0.0" }), go = n.p.el("BUTTON", {});
  n.PI.track("scene", { index: 2, total: 23 });
  n.p.fire("click", { target: go, clientX: 1, clientY: 1 }); n.PI.track("scene", { index: 3, total: 23 }); n.p.flush();
  assert.deepEqual(plain(n.PI.signals().struggle), {});
});

test("a busy control that never finishes is dead once its patience runs out", function () {
  var b = boot({ rules: "3.0.0" }), btn = b.p.el("BUTTON", { "aria-busy": "true" });
  b.PI.track("scene", { index: 2, total: 23 });
  b.p.fire("click", { target: btn, clientX: 1, clientY: 1 });
  for (var i = 0; i < 30; i++) { b.p.flush(); b.c.tick(600); }
  assert.deepEqual(plain(b.PI.signals().struggle), { 2: { deadctl: 1, dead: 1 } });
});

test("with no way to see a change, a control is never called dead", function () {
  var b = boot({ rules: "3.0.0", noObserver: true }), btn = b.p.el("BUTTON", {});
  b.PI.track("scene", { index: 2, total: 23 });
  b.p.fire("click", { target: btn, clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), {});
  assert.equal(b.PI.signals().ctx.avail.ack, false);
});

test("under 3.0.0 a tap on a non-control is an unhandled surface tap, not a dead control", function () {
  var b = boot({ rules: "3.0.0" });
  b.PI.track("scene", { index: 6, total: 23 });
  b.p.fire("click", { target: b.p.el("IMG", {}), clientX: 1, clientY: 1 }); b.p.flush();
  assert.deepEqual(plain(b.PI.signals().struggle), { 6: { unhandled: 1 } });
});

test("a script error just after a tap is recorded with no message", function () {
  var b = boot(); b.PI.track("scene", { index: 7, total: 23 });
  b.p.fire("click", { target: b.p.el("BUTTON", {}), clientX: 1, clientY: 1 }); b.c.tick(500);
  b.p.win("error", { message: "secret stack trace" });
  var st = plain(b.PI.signals().struggle);
  assert.equal(st[7].errtap, 1);
  assert.ok(!/secret/.test(JSON.stringify(b.PI.signals())), "the error text was stored");
  b.c.tick(5000); b.p.win("error", {});
  assert.equal(plain(b.PI.signals().struggle)[7].errtap, 1, "an error long after any tap was attributed to it");
});

test("friction thresholds can be tuned only inside fixed bounds", function () {
  var b = boot(); b.PI.config({ friction: { rage: { taps: 1, px: 9999 }, ackMs: 10 } });
  var body = b.p.el("DIV"); b.PI.track("scene", { index: 5, total: 23 });
  for (var i = 0; i < 2; i++) { b.p.fire("click", { target: body, clientX: 100, clientY: 200 }); b.c.tick(100); }
  assert.ok(!(plain(b.PI.signals().struggle)[5] || {}).rage, "two taps counted as rage: the lower bound (3) was not applied");
});

/* ── media ─────────────────────────────────────────────────────────────── */
test("seeking to the end and ending does not prove a video was watched", function () {
  var b = boot({ rules: "3.0.0" }), v = video(b.p, null);
  b.PI.track("scene", { index: 9, total: 23 });
  play(b, v, 0, 20);
  b.p.fire("seeking", { type: "seeking", target: v }); v.currentTime = 99; b.p.fire("seeked", { type: "seeked", target: v });
  v.currentTime = 100; b.p.fire("timeupdate", { type: "timeupdate", target: v }); b.p.fire("ended", { type: "ended", target: v });
  var m = b.PI.signals().ctx.media[0];
  assert.equal(m.id, "intro.mp4"); assert.equal(m.done, false); assert.ok(m.w >= 19 && m.w <= 21, "watched " + m.w);
  assert.ok(!(b.PI.signals().enc || {}).media_done, "an ended event alone counted as watched");
});

test("watching 90% completes it; pause then play is a resume, a restart after viewing is a replay", function () {
  var b = boot({ rules: "3.0.0" }), v = video(b.p, null);
  b.PI.track("scene", { index: 9, total: 23 });
  play(b, v, 0, 40); b.p.fire("pause", { type: "pause", target: v });
  play(b, v, 40, 95); b.p.fire("ended", { type: "ended", target: v });
  var m = b.PI.signals().ctx.media[0];
  assert.equal(m.done, true); assert.equal(m.pl, 1); assert.equal(m.rs, 1); assert.equal(m.rp, 0);
  assert.equal(b.PI.signals().enc.media_done, 1);
  play(b, v, 0, 3);
  m = b.PI.signals().ctx.media[0];
  assert.equal(m.rp, 1); assert.equal(b.PI.signals().enc.media_replay, 1);
});

test("a resume near the start is not a replay (D11); stalls are counted", function () {
  var b = boot({ rules: "3.0.0" }), v = video(b.p, null);
  b.PI.track("scene", { index: 9, total: 23 });
  play(b, v, 0, 0.5); b.p.fire("pause", { type: "pause", target: v });
  b.p.fire("waiting", { type: "waiting", target: v });
  play(b, v, 0.5, 4);
  var m = b.PI.signals().ctx.media[0];
  assert.equal(m.rp, 0); assert.equal(m.stl, 1);
  assert.ok(!(b.PI.signals().enc || {}).media_replay);
});

test("a looping background clip is never counted", function () {
  var b = boot({ rules: "3.0.0" }), v = video(b.p, null); v.loop = true; v.controls = false;
  play(b, v, 0, 30);
  assert.deepEqual(plain(b.PI.signals().ctx.media), []);
});

/* ── foreground time, idle, lifecycle ──────────────────────────────────── */
test("under 3.0.0 a long quiet stretch is uncertain, not attention; a playing video is not quiet", function () {
  var b = boot({ rules: "3.0.0" });
  b.PI.track("scene", { index: 1, total: 23 }); b.c.tick(300000); b.PI.track("scene", { index: 2, total: 23 });
  var s = b.PI.signals();
  assert.equal(s.sceneSec[1], 120, "five quiet minutes were credited as attention");
  assert.equal(s.ctx.unc, 180);
  var w = boot({ rules: "3.0.0" }), v = video(w.p, null);
  w.PI.track("scene", { index: 1, total: 23 }); play(w, v, 0, 1); w.c.tick(300000); w.PI.track("scene", { index: 2, total: 23 });
  assert.equal(w.PI.signals().sceneSec[1], 300, "passive video viewing was punished");
});

test("the default read keeps crediting quiet time, but records it as uncertain", function () {
  var b = boot();
  b.PI.track("scene", { index: 1, total: 23 }); b.c.tick(300000); b.PI.track("scene", { index: 2, total: 23 });
  assert.equal(b.PI.signals().sceneSec[1], 300); assert.equal(b.PI.signals().ctx.unc, 180);
});

test("hidden time is not counted; a back/forward-cache return restarts the clock once", function () {
  var b = boot();
  b.PI.track("scene", { index: 3, total: 23 }); b.c.tick(10000);
  b.p.doc.visibilityState = "hidden"; b.p.fire("visibilitychange", {}); b.c.tick(60000);
  b.p.doc.visibilityState = "visible"; b.p.fire("visibilitychange", {}); b.c.tick(5000);
  assert.equal(b.PI.signals().sceneSec[3], 15);
  b.p.win("pagehide", {}); b.c.tick(60000);
  b.p.win("pageshow", { persisted: true }); b.p.win("pageshow", { persisted: true }); b.c.tick(4000);
  assert.equal(b.PI.signals().sceneSec[3], 19, "bfcache restore double-counted or never restarted");
});

test("touch, keyboard and scroll count as input; a phone never records hover", function () {
  var b = boot({ rules: "3.0.0" }), deck = b.p.el("DIV", { "data-pi-root": "phone" }), x = b.p.el("DIV", {}, deck);
  b.PI.track("scene", { index: 1, total: 24 });
  for (var i = 0; i < 5; i++) { b.c.tick(100000); b.p.fire(i % 2 ? "keydown" : "touchstart", { target: x }); }
  b.PI.track("scene", { index: 2, total: 24 });
  assert.equal(b.PI.signals().ctx.unc, 0, "regular touch and key input was treated as idle");
  assert.deepEqual(plain(b.PI.signals().hovered), []);
});

test("loading the engine twice does not double listeners or uploads", function () {
  var b = boot();
  var before = (b.p.h.click || []).length;
  var fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "evaluate.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "..", "src", "engine.js"), "utf8"), b.e.win);
  assert.equal((b.p.h.click || []).length, before, "a second copy added its own click listener");
  assert.equal(b.e.win.PI, b.PI, "a second copy replaced PI");
});

/* ── transport ─────────────────────────────────────────────────────────── */
test("every profile upload uses an event name the server accepts (D17)", function () {
  var b = boot();
  b.PI.track("scene", { index: 2, total: 23 }); b.PI.track("cta", { action: "enroll" }); b.PI.track("hot_lead", {}); b.PI.finish();
  var saved = b.e.beacons.filter(function (x) { return /pi-profile/.test(x.url); }).map(function (x) { return JSON.parse(x.body).event; });
  assert.ok(saved.length >= 2, "nothing was saved");
  saved.forEach(function (ev) { assert.ok(SERVER_EVENTS.indexOf(ev) > -1, "the server rejects event \"" + ev + "\""); });
  assert.ok(saved.indexOf("cta") > -1, "the CTA save is missing");
});

test("a refused beacon falls back to one keepalive request; a queued one does not", function () {
  var b = boot({ beaconRefuses: true });
  b.PI.track("cta", { action: "enroll" });
  assert.ok(b.fetches.some(function (f) { return /pi-profile/.test(f.url); }), "a refused beacon was simply dropped");
  assert.ok(b.PI.signals().ctx.tx.r >= 1 && b.PI.signals().ctx.tx.f >= 1);
  var ok = boot(); ok.PI.track("cta", { action: "enroll" });
  assert.equal(ok.fetches.length, 0, "a queued beacon was sent twice");
});

test("signals stay under the endpoint's 4 KB cap however much a session holds", function () {
  var b = boot({ rules: "3.0.0" });
  for (var i = 0; i < 80; i++) { b.PI.track("scene", { index: i, total: 80, key: "scene-with-a-long-stable-identifier-" + i }); b.c.tick(1000); }
  for (i = 0; i < 6; i++) { var v = video(b.p, null, { "data-pi-media": "clip-number-" + i + "-with-a-long-name" }); play(b, v, 0, 3); }
  for (i = 0; i < 6; i++) b.PI.track("intercept", { kind: "help", answer: "yes" });
  b.PI.track("cta", { action: "enroll" });
  var saved = b.e.beacons.filter(function (x) { return /pi-profile/.test(x.url); });
  var last = JSON.parse(saved[saved.length - 1].body);
  assert.ok(JSON.stringify(last.signals).length <= 4000, "signals " + JSON.stringify(last.signals).length + " bytes");
});

test("a failing tracker never breaks the page", function () {
  var b = boot(); b.p.doc.querySelector = function () { throw new Error("boom"); };
  assert.doesNotThrow(function () {
    b.PI.track("scene", { index: 1, total: 23 });
    b.p.fire("click", { target: b.p.el("BUTTON", {}), clientX: 1, clientY: 1 }); b.p.flush();
    b.PI.signals(); b.PI.finish();
  });
});
