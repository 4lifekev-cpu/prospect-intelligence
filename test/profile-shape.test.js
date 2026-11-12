"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var { load } = require("./_run.js");
var shape = require("../src/profile-shape.js");
var golden = require("./golden.json");

test("a read becomes a flat row with every column, bounded", function () {
  var read = golden.booked_ready_now.read;
  var row = shape.toProfileRow(read, { tenant: "vt", handle: "dana", prospect: "p_abc123", event: "cta_click", newVisit: true, signals: { x: 1 } });
  assert.deepEqual(Object.keys(row), shape.ROW_COLUMNS);
  assert.equal(row.tenant, "vt"); assert.equal(row.handle, "dana"); assert.equal(row.new_visit, true);
  assert.equal(row.name, "Ava"); assert.equal(row.email, "ava@example.test");
  assert.equal(row.temperature, "Molten"); assert.equal(row.archetype, "The Ready-Now");
  assert.equal(row.score_intent, read.scores.intent);
  assert.equal(row.profile.framing.style, "Gain", "the engine's framing.frame reaches the row");
  assert.equal(row.profile.schema, "h2-intel-v2"); assert.equal(row.profile.lastEvent, "cta_click");
});

test("anonymous, malformed and oversized values are dropped, never stored", function () {
  var read = JSON.parse(JSON.stringify(golden.anonymous_bounce.read));
  read.prospect.email = "not-an-email"; read.prospect.phone = "call me";
  read.headline = "x".repeat(1000); read.scores.intent = "999"; read.temperature.heat = -4;
  var row = shape.toProfileRow(read, { tenant: "vt", handle: "dana", prospect: "p_1" });
  assert.equal(row.name, ""); assert.equal(row.email, ""); assert.equal(row.phone, "");
  assert.equal(row.profile.headline.length, 240); assert.equal(row.score_intent, 100); assert.equal(row.heat, 0);
  assert.deepEqual(row.signals, {}); assert.equal(row.new_visit, false);
});

test("an empty read still produces a complete row", function () {
  var row = shape.toProfileRow(null, { tenant: "vt", handle: "dana", prospect: "p_1" });
  assert.deepEqual(Object.keys(row), shape.ROW_COLUMNS);
  assert.equal(row.profile.schema, "h2-intel-v2");
});

test("the row shape and the live engine agree on the read", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("contact", { name: "Sam", email: "sam@example.test" }); e.PI.track("path", { path: "wealth" });
  e.PI.track("scene", { index: 18, total: 24 });
  var row = shape.toProfileRow(e.PI.profile(), { tenant: "vt", handle: "dana", prospect: "p_1", signals: e.PI.signals() });
  assert.equal(row.name, "Sam"); assert.ok(row.probability > 0); assert.ok(shape.BANDS.indexOf(row.temperature) > -1);
});

/* ── the evidence read rides in profile.read ───────────────────────────── */
test("the evidence read is stored inside the profile, and only if it is one", function () {
  var shape = require("../src/profile-shape.js");
  var g = require("./golden-read.json").full_watch_asked.read;
  var row = shape.toProfileRow({ read: g }, { tenant: "t", prospect: "p_abcdef", handle: "dana" });
  assert.deepEqual(row.profile.read, g, "a real read survives the reduction unchanged");
  assert.equal(shape.toProfileRow({ read: { schema: "something-else", band: "molten" } }, {}).profile.read, null);
  assert.equal(shape.toProfileRow({}, {}).profile.read, null);
  assert.deepEqual(shape.ROW_COLUMNS.length, 21, "no new column: the read needs no migration");
});

test("a read from a browser is reduced, not trusted", function () {
  var shape = require("../src/profile-shape.js");
  var big = {}; for (var i = 0; i < 500; i++) big["k" + i] = i;
  var r = shape.toRead({ schema: "pi-read-v3", band: "<script>alert(1)</script>", note: "x".repeat(500), "bad key": 1,
    dims: { intent: { score: 52, reasons: [{ code: "views", pts: 22 }] } }, many: big, deep: { a: { b: { c: { d: { e: { f: 1 } } } } } },
    list: new Array(200).fill("ok"), nan: NaN, fn: "javascript:alert(1)" });
  assert.equal(r.band, undefined, "markup is dropped, not cleaned");
  assert.equal(r.note, undefined); assert.equal(r["bad key"], undefined); assert.equal(r.fn, undefined); assert.equal(r.nan, undefined);
  assert.equal(r.dims.intent.reasons[0].pts, 22);
  assert.ok(Object.keys(r.many).length <= 16); assert.ok(r.list.length <= 12);
  assert.ok(!/"f":1/.test(JSON.stringify(r)), "nesting is bounded");
});

// ── the bounded-shape audit (1.9.0) ──────────────────────────────────────────
test("every golden read at 2.1.0 and 3.0.0 fits the limits with nothing cut", function () {
  [require("./golden-read.json"), require("./golden-read-v3.json")].forEach(function (set) {
    Object.keys(set).forEach(function (name) {
      var read = set[name].read, out = shape.toRead(read);
      assert.ok(out, name + ": read was refused");
      assert.equal(out.truncated, undefined, name + ": something was cut — " + JSON.stringify(out.truncated));
      assert.deepEqual(out, JSON.parse(JSON.stringify(read)), name + ": the stored read is not the read");
    });
  });
});

test("a cut is visible: counts, a true total, and the identity fields survive", function () {
  var read = JSON.parse(JSON.stringify(require("./golden-read-v3.json").returned_hot_with_struggle.read));
  var junk = {}; for (var i = 0; i < 30; i++) junk["a" + i] = 1;
  read = Object.assign(junk, read);                         // thirty junk keys ahead of the real ones
  read.observed.clicked = []; for (i = 0; i < 40; i++) read.observed.clicked.push("link");
  read.note = "<script>alert(1)</script>";
  read.truncated = { lists: 0 };                            // a browser cannot claim "nothing was cut"
  var out = shape.toRead(read);
  ["schema", "rules", "request", "temperature", "coverage", "evidence", "dims"].forEach(function (k) { assert.ok(out[k] !== undefined, k + " was pushed out by junk keys"); });
  assert.ok(out.truncated && out.truncated.keys > 0, "the cut is not reported");
  assert.equal(Object.keys(out).length <= shape.LIMITS.keys + 1, true);
  var full = shape.toRead(Object.assign({}, require("./golden-read-v3.json").returned_hot_with_struggle.read, { observed: read.observed, note: "<script>alert(1)</script>" }));
  assert.equal(full.observed.clicked.length, 12); assert.equal(full.observed.clickedTotal, 40, "the true length is lost");
  assert.equal(full.truncated.lists, 1); assert.equal(full.truncated.values, 1); assert.equal(full.note, undefined);
});
