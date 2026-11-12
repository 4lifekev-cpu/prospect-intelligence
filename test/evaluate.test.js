// Prompt 02 — the product boundary. The evaluator is pure, runs the same on a
// server as in the browser bundle, and the engine fails safely around it.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");
var { load, ROOT } = require("./_run.js");

var EVAL_SRC = fs.readFileSync(path.join(ROOT, "src", "evaluate.js"), "utf8");
var DIST = fs.readFileSync(path.join(ROOT, "dist", "prospect-intelligence.js"), "utf8");
var server = require("../src/evaluate.js");

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1"); }

test("the evaluator touches no DOM, storage, network, environment, clock source or module", function () {
  // The UMD wrapper (first statement) is the only place allowed to see the host.
  var body = stripComments(EVAL_SRC);
  var start = body.indexOf("function createEvaluator");
  assert.ok(start > 0, "createEvaluator not found");
  body = body.slice(start);
  var banned = [/\bwindow\b/, /\bdocument\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bnavigator\b/, /\bfetch\s*\(/,
    /XMLHttpRequest/, /\bprocess\b/, /\brequire\s*\(/, /\bimport\s*\(/, /sendBeacon/, /\bnetlify\b/i, /supabase/i,
    /\beval\s*\(/, /new Function/, /anthropic|openai|\bllm\b/i];
  banned.forEach(function (re) { assert.ok(!re.test(body), "evaluator references " + re); });
});

test("server and browser give the identical read on every golden fixture", function () {
  var win = { console: console, Math: Math, Date: Date, JSON: JSON };
  win.window = win;
  // The browser bundle's first part is the evaluator; it defines window.PIEvaluate.
  vm.runInNewContext(DIST.slice(0, DIST.indexOf("(function (root) {\n  \"use strict\";\n\n  /* ====================  THE EVALUATOR")), win);
  assert.ok(win.PIEvaluate, "the bundle does not expose the evaluator");
  var b = win.PIEvaluate.createEvaluator(), s = server.createEvaluator();
  var n = 0;
  ["golden.json", "golden-read.json", "golden-read-v3.json"].forEach(function (f) {
    var g = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
    Object.keys(g).forEach(function (k) {
      var c = g[k], opts = c.opts || {};
      if (f === "golden.json") {
        assert.deepEqual(JSON.parse(JSON.stringify(b.analyze(c.signals))), JSON.parse(JSON.stringify(s.analyze(c.signals))), f + " " + k);
      } else {
        if (f === "golden-read-v3.json") opts = Object.assign({ rules: "3.0.0" }, opts);
        var rb = JSON.parse(JSON.stringify(b.readAt(c.signals, opts))), rs = JSON.parse(JSON.stringify(s.readAt(c.signals, opts)));
        assert.deepEqual(rb, rs, f + " " + k);
        assert.deepEqual(rs, JSON.parse(JSON.stringify(c.read)), f + " " + k + " drifted from its golden");
      }
      n++;
    });
  });
  assert.ok(n >= 15, "too few fixtures compared: " + n);
});

test("the bundle is the evaluator file, unchanged, followed by the collector", function () {
  var engine = fs.readFileSync(path.join(ROOT, "src", "engine.js"), "utf8");
  assert.ok(DIST.indexOf(EVAL_SRC + "\n" + engine) > -1, "dist is not evaluate.js + engine.js byte for byte");
});

test("no evaluator: the page carries on and every public call is a harmless no-op", function () {
  var e = load({ query: "?u=dana", noEvaluator: true });
  assert.ok(e.PI && e.PI.off, "no stub PI");
  ["track", "finish", "read", "profile", "analyze", "present", "config", "reset"].forEach(function (k) {
    assert.equal(typeof e.PI[k], "function", k);
  });
  assert.doesNotThrow(function () { e.PI.track("scene", { index: 2, total: 24 }); e.PI.finish(); e.PI.config({ rules: "3.0.0" }); });
  assert.equal(e.beacons.length, 0);
});

test("no tenant record and no config: reads work, nothing is posted anywhere", function () {
  var e = load({ query: "?u=dana" });
  e.PI.track("scene", { index: 3, total: 24 }); e.PI.track("cta", { action: "enroll" }); e.PI.finish();
  assert.ok(e.PI.read() && e.PI.profile(), "no read without config");
  assert.ok(!e.beacons.some(function (b) { return /prospect-alert/.test(b.url); }), "an alert went with no configured endpoint");
});

test("the public API is unchanged", function () {
  var e = load({});
  ["track", "finish", "read", "profile", "analyze", "present", "config", "reset"].forEach(function (k) {
    assert.equal(typeof e.PI[k], "function", "PI." + k + " missing");
  });
  assert.equal(e.PI.version, 2);
});

test("manifest scene settings are used only under rules 3.0.0, and never on an ambiguous surface", function () {
  var M = { manifest: "demo@1.0.0", actions: { business: ["enroll"], product: ["shop"] }, questions: [],
    surfaces: {
      long: { sceneIds: ["a", "b", "c", "d"], topics: [null, "business", "product", null], eligible: [true, true, true, true], narration: { en: [10, 20, 30, 40] } },
      short: { sceneIds: ["b", "c", "d"], topics: ["business", "product", null], eligible: [true, true, true], narration: { en: [20, 30, 40] } }
    } };
  // Six seconds on scene 1. Its narration is 20 s, so with the manifest the view
  // needs 10 s and does not qualify; without it the 4 s floor applies and it does.
  function run(rules, total, cfg, tenant) {
    var t = 1e12, FD = function () { return arguments.length ? new (Function.prototype.bind.apply(Date, [null].concat([].slice.call(arguments))))() : new Date(t); };
    FD.now = function () { return t; };
    var e = load({ TENANT: tenant === undefined ? { piScenesV3: M } : tenant, globals: { Date: FD, document: { documentElement: { lang: "en" } } } });
    e.PI.config(Object.assign({ rules: rules }, cfg || {}));
    e.PI.track("scene", { index: 1, total: total }); t += 6000;
    e.PI.track("scene", { index: 2, total: total }); t += 1000;
    return e.PI.read();
  }
  assert.equal(run("3.0.0", 4).coverage.qualified, 0, "the manifest's narration was not applied on the matching surface");
  assert.equal(run("3.0.0", 5).coverage.qualified, 1, "a surface was guessed for a scene count no surface has");
  assert.equal(run("3.0.0", 5, { surface: "long" }).coverage.qualified, 0, "PI.config({ surface }) was ignored");
  assert.equal(run("3.0.0", 4, { locale: "fr" }).coverage.qualified, 1, "a locale the manifest lacks was not refused");
  assert.deepEqual(JSON.parse(JSON.stringify(run("2.1.0", 4))), JSON.parse(JSON.stringify(run("2.1.0", 4, null, {}))),
    "the default 2.1.0 read changed because a manifest is present");
});
