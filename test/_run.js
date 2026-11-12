// Load the engine into a fake window and hand back PI plus everything it sent.
"use strict";
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var ROOT = path.resolve(__dirname, "..");

function load(opts) {
  opts = opts || {};
  var file = opts.dist ? path.join(ROOT, "dist", "prospect-intelligence.js") : path.join(ROOT, "src", "engine.js");
  var src = fs.readFileSync(file, "utf8");
  // The source engine needs the evaluator ahead of it, as the build does.
  if (!opts.dist && !opts.noEvaluator) src = fs.readFileSync(path.join(ROOT, "src", "evaluate.js"), "utf8") + "\n" + src;
  var beacons = [];
  var store = Object.assign({}, opts.store || {});
  var win = {
    location: { search: opts.query || "", href: "https://example.test/deck/" + (opts.query || "") },
    navigator: { sendBeacon: function (url, blob) { beacons.push({ url: url, body: blob && blob._body }); return true; } },
    localStorage: {
      getItem: function (k) { return store[k] == null ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    addEventListener: function () {},
    console: console, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite,
    URLSearchParams: URLSearchParams,
    Blob: function (parts) { this._body = parts.join(""); }
  };
  if (opts.TENANT) win.TENANT = opts.TENANT;
  // Since 1.6.0 the engine fails closed without a consent hook (Prompt 05).
  // A venture page always has one; by default the harness stands in for a
  // visitor who chose "Allow". Pass consent: false for a page with no hook,
  // or a hook of your own (test/consent.test.js) to test the other answers.
  if (opts.consent === undefined) win.PI_CONSENT = { granted: function () { return true; }, state: function () { return "granted"; } };
  else if (opts.consent) win.PI_CONSENT = opts.consent;
  if (opts.globals) Object.assign(win, opts.globals);
  win.window = win;
  vm.runInNewContext(src, win);
  return { PI: win.PI, beacons: beacons, store: store, win: win };
}

module.exports = { load: load, ROOT: ROOT };
