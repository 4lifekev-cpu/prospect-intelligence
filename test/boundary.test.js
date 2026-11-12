// The boundary. This package is shared by more than one venture, and the
// ventures compete in the same industry. Nothing in it may name one of them —
// not a company, a product, a brand, a domain, a storage key, a person.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var { ROOT } = require("./_run.js");

// Case-insensitive. Add a venture here the day it starts consuming the engine.
var VENTURE_STRINGS = [
  "at cost", "atcost", "highsquared", "high squared", "high²", "high2", "acm_", "\"acm\"",
  "4life", "high and high", "high & high", "highandhigh", "hs_", "h2-pitch",
  "kevin", "teri", "moore", "shuler", "@me.com", "gmail"
];
// Words that contain a banned fragment but are not it.
var ALLOWED_WORDS = /\bHS_\/H2_\b/g;
// The read's schema id predates the extraction and is a wire contract; the
// two characters are not a venture name.
var ALLOWED = [/h2-intel-v2/g, /HS_NOTIFY_URL|H2_NOTIFY_URL|HSConsent/g];

function files(dir, re, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "test") files(p, re, out); }
    else if (re.test(e.name)) out.push(p);
  });
  return out;
}

test("no venture string in src/, dist/, schema/ or the docs", function () {
  var hits = [];
  files(ROOT, /\.(js|mjs|json|md)$/).forEach(function (f) {
    var text = fs.readFileSync(f, "utf8");
    ALLOWED.forEach(function (re) { text = text.replace(re, ""); });
    text = text.replace(ALLOWED_WORDS, "");
    var low = text.toLowerCase();
    VENTURE_STRINGS.forEach(function (v) {
      var at = low.indexOf(v);
      if (at > -1) hits.push(path.relative(ROOT, f) + ": \"" + v + "\" near …" + text.slice(Math.max(0, at - 30), at + 40).replace(/\s+/g, " ") + "…");
    });
  });
  assert.deepEqual(hits, [], "venture strings leaked into the shared engine:\n" + hits.join("\n"));
});

test("no literal storage key, domain or function path a venture owns", function () {
  var src = fs.readFileSync(path.join(ROOT, "src", "engine.js"), "utf8");
  assert.ok(!/localStorage\.(get|set)Item\("(?!pi_)[a-z0-9_]+"\)/i.test(src), "a literal storage key is hardcoded");
  assert.ok(!/https?:\/\/(?!example)/.test(src), "a live domain is hardcoded");
  assert.ok(/storagePrefix/.test(src), "storage keys must be derived from the venture's storagePrefix");
});

test("the engine has no venture-branded email builder", function () {
  var src = fs.readFileSync(path.join(ROOT, "src", "engine.js"), "utf8");
  assert.ok(!/function buildEmail|emailHtml\s*:|emailSubject\s*:/.test(src), "the email body belongs to the venture's mailer, not the engine");
});

// A consumer guards its approved wording by extracting quoted strings from every file it
// ships, this bundle included. A phrase quoted inside a // comment reads to that check as
// new visitor-facing copy (it happened at 1.11.0 and 1.12.0). Keep quoted prose out of line comments.
test("no line comment in the bundle quotes a phrase that reads as visible wording", function () {
  var dist = fs.readFileSync(path.join(ROOT, "dist", "prospect-intelligence.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  var hits = [];
  dist.split("\n").forEach(function (line, i) {
    var at = line.indexOf("//"); if (at < 0) return;
    var before = line.slice(0, at); if ((before.split('"').length - 1) % 2) return;       // the // is inside a string
    var c = line.slice(at), m, re = /"([^"\\\n]{12,})"/g;
    while ((m = re.exec(c))) if (/[A-Za-z]{3,} [A-Za-z]{2,}/.test(m[1])) hits.push((i + 1) + ": " + m[1]);
  });
  // Three phrases predate this test and are already in consumers' approved snapshots;
  // removing them would be a wording change there too. Nothing may be added to this list.
  var GRANDFATHERED = ["watched to the end", "what would change this", "came back later"];
  assert.deepEqual(hits.map(function (h) { return h.replace(/^\d+: /, ""); }).filter(function (h) { return GRANDFATHERED.indexOf(h) < 0; }), []);
});
