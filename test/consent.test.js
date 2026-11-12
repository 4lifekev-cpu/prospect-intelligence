// Analytics permission fails closed (Prompt 05, D3).
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");

var VENTURE = { piNotify: "/.netlify/functions/prospect-alert", storagePrefix: "vt_" };
function hook(initial) {
  var st = initial || "unset", waiting = [];
  return {
    granted: function () { return st === "granted"; }, state: function () { return st; },
    whenGranted: function (fn) { if (st === "granted") fn(); else if (st !== "denied") waiting.push(fn); },
    set: function (v) { st = v; if (v === "granted") { var q = waiting.splice(0); q.forEach(function (f) { f(); }); } },
    waiting: waiting
  };
}
function busy(e) {
  e.PI.track("contact", { name: "Sam", email: "sam@example.test", phone: "801-555-0100" });
  for (var i = 0; i < 12; i++) e.PI.track("scene", { index: i, total: 23 });
  e.PI.track("cta", { action: "enroll" }); e.PI.finish();
}
function keys(store) { return Object.keys(store).filter(function (k) { return /^vt_/.test(k); }); }

test("no consent hook on the page: nothing identified, stored, sent or alerted", function () {
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: false });
  busy(e);
  assert.equal(e.beacons.length, 0, "something was uploaded without a consent hook");
  assert.deepEqual(keys(e.store), [], "an identifier or identity was written without permission");
});

test("declined: nothing identified, stored, sent or alerted", function () {
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: hook("denied") });
  busy(e);
  assert.equal(e.beacons.length, 0); assert.deepEqual(keys(e.store), []);
});

test("not yet answered: nothing leaves; the engine asks the module to ask", function () {
  var h = hook("unset"), e = load({ TENANT: VENTURE, query: "?u=dana", consent: h });
  assert.equal(h.waiting.length, 1, "the engine did not register with the consent module, so no banner would ask");
  busy(e);
  assert.equal(e.beacons.length, 0); assert.deepEqual(keys(e.store), []);
});

test("granted later in the session: the read as it stands is saved then, and alerts flow", function () {
  var h = hook("unset"), e = load({ TENANT: VENTURE, query: "?u=dana", consent: h });
  e.PI.track("contact", { name: "Sam", email: "sam@example.test" });
  for (var i = 0; i < 8; i++) e.PI.track("scene", { index: i, total: 23 });
  assert.equal(e.beacons.length, 0);
  h.set("granted");
  var saved = e.beacons.filter(function (b) { return /pi-profile/.test(b.url); });
  assert.equal(saved.length, 1); assert.equal(JSON.parse(saved[0].body).event, "visit", "the catch-up save goes as the server's \"visit\" event (D17)");
  assert.ok(keys(e.store).length > 0, "identifier and identity are written once permission exists");
  e.PI.track("cta", { action: "enroll" });
  assert.ok(e.beacons.some(function (b) { return /prospect-alert/.test(b.url); }));
});

test("withdrawn mid-session: the held alert is cancelled and nothing more is sent", function () {
  var timers = [], h = hook("granted");
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: h, globals: {
    setTimeout: function (fn) { timers.push(fn); return timers.length; }, clearTimeout: function (id) { timers[id - 1] = null; } } });
  e.PI.track("scene", { index: 3, total: 23 });
  e.PI.track("contact", { name: "Sam", email: "sam@example.test" });   // a contact alert is HELD, not sent
  var before = e.beacons.length;
  h.set("denied");
  e.PI.track("scene", { index: 9, total: 23 });                         // observation stops and the session is dropped
  timers.forEach(function (f) { if (f) f(); });                         // the idle timer would have released the alert
  e.PI.finish();
  assert.equal(e.beacons.length, before, "something was sent after permission was withdrawn");
  assert.equal(e.PI.signals().maxDepth, 0, "observations from before the withdrawal were kept");
});

test("preview never asks for permission and never sends", function () {
  var h = hook("unset"), e = load({ TENANT: VENTURE, query: "?u=dana&preview=1", consent: h });
  assert.equal(h.waiting.length, 0, "an affiliate previewing their own link was asked for analytics permission");
  h.set("granted"); busy(e);
  assert.equal(e.beacons.length, 0);
});

test("a venture that needs no permission says so in its tenant record", function () {
  var e = load({ TENANT: Object.assign({ piConsentRequired: false }, VENTURE), query: "?u=dana", consent: false });
  busy(e);
  assert.ok(e.beacons.length > 0);
  var strict = load({ TENANT: Object.assign({ piConsentRequired: "false" }, VENTURE), query: "?u=dana", consent: false });
  busy(strict);
  assert.equal(strict.beacons.length, 0, "only an explicit boolean false opts out");
});

test("a consent hook that throws is a no", function () {
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: { granted: function () { throw new Error("boom"); } } });
  busy(e);
  assert.equal(e.beacons.length, 0);
});

test("the presentation keeps working without permission: every call returns, nothing throws", function () {
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: hook("denied") });
  assert.doesNotThrow(function () { busy(e); e.PI.profile(); e.PI.read(); e.PI.signals(); });
});

test("already granted on an earlier page: no catch-up callback, every upload has an address", function () {
  // Regression: a module holding a "yes" calls whenGranted back at once. Before
  // the fix that ran mid-initialisation and posted a profile to `undefined`.
  var calls = 0, h = hook("granted"), w = h.whenGranted;
  h.whenGranted = function (fn) { calls++; return w(fn); };
  var e = load({ TENANT: VENTURE, query: "?u=dana", consent: h });
  assert.equal(calls, 0, "registered a catch-up for consent that already existed");
  busy(e);
  assert.ok(e.beacons.length > 0, "nothing was sent with consent granted");
  e.beacons.forEach(function (b) { assert.equal(typeof b.url, "string", "an upload had no address"); });
  assert.ok(!e.beacons.some(function (b) { return /"event":"visit"/.test(b.body || ""); }), "a catch-up persist fired on load");
});

// ── intake capability (1.9.0) ────────────────────────────────────────────────
function fetcher(calls, token) {
  return function (url, o) {
    calls.push({ url: url, body: o && o.body });
    return { then: function (f) { var j = f({ ok: true, json: function () { return { cap: token }; } }); return { then: function (g) { g(j); return { catch: function () {} }; } }; } };
  };
}
var SESSION = Object.assign({ piSession: "/.netlify/functions/pi-session", piScenesV3: { manifest: "demo-deck@1.0.0" } }, VENTURE);

test("capability: asked for once with permission, sent with every upload, never stored on the device", function () {
  var calls = [];
  var e = load({ TENANT: SESSION, query: "?u=dana", globals: { fetch: fetcher(calls, "aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb") } });
  busy(e);
  var asks = calls.filter(function (c) { return /pi-session/.test(c.url); });
  assert.equal(asks.length, 1, "asked " + asks.length + " times");
  var ask = JSON.parse(asks[0].body);
  assert.deepEqual(Object.keys(ask).sort(), ["handle", "presentation", "session"], "the request carries more than it needs");
  assert.equal(ask.presentation, "demo-deck@1.0.0"); assert.equal(ask.handle, "dana");
  var ups = e.beacons.filter(function (b) { return /pi-profile/.test(b.url); }).map(function (b) { return JSON.parse(b.body); });
  assert.ok(ups.length > 0 && ups.every(function (u) { return u.cap === "aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb"; }), "an upload left without the capability");
  assert.equal(ups[0].newVisit, true);
  assert.ok(!JSON.stringify(e.store).match(/aaaaaaaaaaaa/), "the capability was written to storage");
});

test("capability: not asked for without permission, in preview, or when the venture names no endpoint", function () {
  var calls = [];
  busy(load({ TENANT: SESSION, query: "?u=dana", consent: hook("denied"), globals: { fetch: fetcher(calls, "x") } }));
  busy(load({ TENANT: SESSION, query: "?u=dana&preview=1", globals: { fetch: fetcher(calls, "x") } }));
  busy(load({ TENANT: VENTURE, query: "?u=dana", globals: { fetch: fetcher(calls, "x") } }));
  assert.equal(calls.filter(function (c) { return /pi-session/.test(c.url); }).length, 0);
});

test("capability: until it arrives the visit is not claimed, so the first accepted upload counts it", function () {
  var pending = function () { return { then: function () { return { then: function () { return { catch: function () {} }; } }; } }; };
  var e = load({ TENANT: SESSION, query: "?u=dana", globals: { fetch: pending } });
  busy(e);
  var ups = e.beacons.filter(function (b) { return /pi-profile/.test(b.url); }).map(function (b) { return JSON.parse(b.body); });
  assert.ok(ups.length > 1 && ups.every(function (u) { return u.newVisit === true && u.cap === undefined; }));
});
