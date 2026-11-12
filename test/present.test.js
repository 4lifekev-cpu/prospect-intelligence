// What the engine is willing to SHOW, as opposed to what it thinks.
//
// 12 September 2026. Every score is a sigmoid with a negative intercept, so the
// model's floor is not zero — and an experience that asks for a name and a path
// before it shows anything buys two taps' worth of score before the prospect has
// seen a single claim. The result was a card in the 55-80 range for the two
// commonest sessions there are: the bounce, and the two-tap bounce.
//
// These tests assert the SHAPE of the guarantee, not the arithmetic of one fix.
// They should still pass if the anchor moves or the gate is retuned.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");

var T0 = 1757000000000;
function read(sig) { return load().PI.analyze(Object.assign({ startedAt: T0, lastEventAt: T0 + 20000, totalDepth: 24 }, sig)); }
function shown(sig) { var PI = load().PI, r = read(sig); return PI.present(r.scores, r.conversion.confidence); }

test("a visitor who did nothing is never published as a score", function () {
  var v = shown({ maxDepth: 0 });
  assert.equal(v.ready, false, "a read with no evidence must not be renderable");
});

test("the two-tap bounce — name, one path, gone by screen 2 — is not a warm lead", function () {
  var raw = read({ maxDepth: 2, name: "Dana", path: "protect" });
  var v = shown({ maxDepth: 2, name: "Dana", path: "protect" });
  assert.ok(raw.scores.customer >= 60, "precondition: the raw model still scores this high (" + raw.scores.customer + ")");
  assert.ok(v.scores.customer < 45, "the two-tap bounce was published as " + v.scores.customer + " — an affiliate would call that person");
});

test("a builder path does not buy a high score on its own either", function () {
  var v = shown({ maxDepth: 2, name: "Dana", path: "wealth" });
  assert.ok(v.scores.builder < 45, "picking 'wealth' and leaving published " + v.scores.builder);
});

test("a prospect who watched the whole thing keeps very nearly their full score", function () {
  var sig = { maxDepth: 24, name: "Dana", path: "protect", interactions: 4, questions: ["a", "b"], lastEventAt: T0 + 400000 };
  var raw = read(sig), v = shown(sig);
  assert.equal(v.ready, true, "a complete, engaged read must be renderable");
  assert.ok(raw.scores.customer - v.scores.customer <= 8,
    "earned score lost too much: " + raw.scores.customer + " -> " + v.scores.customer);
});

test("shrinkage is monotonic in engagement — deeper is never published lower", function () {
  var last = -1;
  [0, 2, 6, 12, 18, 24].forEach(function (d) {
    var v = shown({ maxDepth: d, name: "Dana", path: "protect", interactions: Math.floor(d / 6) });
    var c = v.ready ? v.scores.customer : 0;
    assert.ok(c >= last, "customer fit went DOWN from depth " + d + " (" + last + " -> " + c + ")");
    last = c;
  });
});

test("no published score can sit below the stranger's anchor", function () {
  var PI = load().PI;
  var v = PI.present({ a: 0, b: 50, c: 100 }, 0);
  Object.keys(v.scores).forEach(function (k) { assert.equal(v.scores[k], PI.PRESENT.anchor); });
});

test("present() reads a stored row exactly as it reads a live profile", function () {
  var PI = load().PI;
  var row = { customer: 72, trust: 60 };            // the shape that comes back off the database
  var v = PI.present(row, 39);
  assert.deepEqual(Object.keys(v.scores).sort(), ["customer", "trust"]);
  assert.ok(v.scores.customer < 72 && v.scores.trust < 60, "a stored row must be shrunk too, or history keeps lying");
});

test("the frozen model is untouched — present() never mutates the read", function () {
  var PI = load().PI, r = PI.analyze({ maxDepth: 12, name: "Dana", path: "wealth", totalDepth: 24 });
  var before = JSON.stringify(r.scores);
  PI.present(r.scores, r.conversion.confidence);
  assert.equal(JSON.stringify(r.scores), before, "present() wrote through to the read");
});

// ── the drop flag, which had never once fired ────────────────────────────────
test("leaving on screen 2 with nothing asked for marks the session as a drop", function () {
  var e = load();
  e.PI.track("name", { name: "Dana" });
  e.PI.track("path", { path: "protect", label: "Protection" });
  e.PI.track("scene", { index: 2, total: 24 });
  e.PI.finish();
  assert.equal(e.PI.signals().droppedEarly, true, "a two-screen exit is still not being counted as a drop");
});

test("a prospect who tapped the CTA is never called a drop, however shallow", function () {
  var e = load();
  e.PI.track("scene", { index: 1, total: 24 });
  e.PI.track("cta", { action: "enroll" });
  e.PI.finish();
  assert.equal(e.PI.signals().droppedEarly, false, "someone who asked to enrol was written off as a bounce");
});

test("a prospect who watched it through is not a drop", function () {
  var e = load();
  e.PI.track("scene", { index: 24, total: 24 });
  e.PI.finish();
  assert.equal(e.PI.signals().droppedEarly, false);
});

test("the drop penalty actually reaches the read", function () {
  var PI = load().PI;
  var base = { name: "Dana", path: "protect", maxDepth: 2, totalDepth: 24, startedAt: T0, lastEventAt: T0 + 20000 };
  var without = PI.analyze(base);
  var with_ = PI.analyze(Object.assign({}, base, { droppedEarly: true }));
  assert.ok(with_.scores.trust < without.scores.trust, "trust is unmoved by a drop");
  assert.ok(with_.conversion.probability < without.conversion.probability, "conversion probability is unmoved by a drop");
  assert.equal(with_.stage.key, "precontemplation");
});

// ── the server half must agree with the browser half, exactly ────────────────
test("profile-shape.present() and engine.present() never disagree", function () {
  var PI = load().PI;
  var shape = require("../src/profile-shape.js");
  // Engine values cross a vm boundary and carry that context's Object prototype;
  // compare values, as model.test.js does.
  var plain = function (v) { return JSON.parse(JSON.stringify(v)); };
  assert.deepEqual(plain(shape.PRESENT), plain(PI.PRESENT), "the two halves hold different constants");
  var keys = ["customer", "builder", "leadership", "intent", "urgency", "trust"];
  for (var conf = 0; conf <= 100; conf += 1) {
    for (var raw = 0; raw <= 100; raw += 7) {
      var sc = {}; keys.forEach(function (k) { sc[k] = raw; });
      var a = PI.present(sc, conf), b = shape.present(sc, conf);
      assert.equal(a.ready, b.ready, "ready disagrees at conf " + conf);
      assert.deepEqual(plain(a.scores), plain(b.scores), "scores disagree at raw " + raw + " conf " + conf);
    }
  }
});
