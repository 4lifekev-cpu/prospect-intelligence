// The model is frozen. These reads were produced by the engine as it ran in
// production on 5 Sep 2026, before the extraction. If any of them changes, the
// science changed — and that is a versioned decision, not a side effect.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var golden = require("./golden.json");
// Reads come out of a vm context with its own Object prototype; compare values.
var plain = function (v) { return JSON.parse(JSON.stringify(v)); };

test("every golden read is reproduced exactly (src)", function () {
  var PI = load().PI;
  Object.keys(golden).forEach(function (k) {
    assert.deepEqual(plain(PI.analyze(golden[k].signals)), golden[k].read, "model drift on case " + k);
  });
});

test("every golden read is reproduced exactly (dist)", function () {
  var PI = load({ dist: true }).PI;
  Object.keys(golden).forEach(function (k) {
    assert.deepEqual(plain(PI.analyze(golden[k].signals)), golden[k].read, "dist drift on case " + k);
  });
});

test("the golden set exercises every band and every archetype", function () {
  var bands = {}, arch = {};
  Object.keys(golden).forEach(function (k) { bands[golden[k].read.temperature.band] = 1; arch[golden[k].read.archetype.name] = 1; });
  ["Molten", "Hot", "Warm", "Cool"].forEach(function (b) { assert.ok(bands[b], "no golden case reaches " + b); });
  ["The Ready-Now", "The Researcher", "The Dreamer", "The Believer", "The Window-Shopper", "The Explorer"].forEach(function (a) { assert.ok(arch[a], "no golden case is " + a); });
});

test("a read is deterministic for the same signals", function () {
  var PI = load().PI;
  var s = golden.wealth_builder.signals;
  assert.deepEqual(plain(PI.analyze(s)), plain(PI.analyze(JSON.parse(JSON.stringify(s)))));
});

test("the read matches the published schema shape", function () {
  var schema = require("../schema/profile.json");
  var PI = load().PI;
  var read = PI.analyze(golden.booked_ready_now.signals);
  assert.deepEqual(Object.keys(read).sort(), schema.required.slice().sort(), "top-level keys drifted from schema/profile.json");
  Object.keys(schema.properties).forEach(function (k) {
    var p = schema.properties[k];
    if (p.required) assert.deepEqual(Object.keys(read[k]).sort(), p.required.slice().sort(), "keys of " + k + " drifted");
  });
  ["fogg", "conversion", "scores"].forEach(function (grp) {
    Object.keys(read[grp]).forEach(function (f) {
      var v = read[grp][f]; if (typeof v !== "number") return;
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, grp + "." + f + " is not a 0–100 integer");
    });
  });
  assert.ok(schema.properties.temperature.properties.band.enum.indexOf(read.temperature.band) > -1);
  assert.ok(schema.properties.archetype.properties.name.enum.indexOf(read.archetype.name) > -1);
});
