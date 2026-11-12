// node test/_golden-read-gen.js  — regenerate test/golden-read.json.
// Run ONLY when the rules change on purpose (version bump + CHANGELOG).
"use strict";
var fs = require("node:fs"), path = require("node:path");
var { load } = require("./_run.js");
var PI = load().PI;
var T = []; [12, 13, 14].forEach(function (i) { T[i] = "business"; }); [15, 16, 17].forEach(function (i) { T[i] = "product"; });
function w(n, sec) { var a = []; for (var i = 0; i < 23; i++) a.push(i < n ? (sec || 20) : 0); return a; }
function s(o) { return Object.assign({ totalDepth: 23, sceneSec: [], ctaActions: [], answers: {}, revisits: {}, phoneOffered: true }, o); }
var cases = {
  ghost: [s({}), {}],
  two_tap_bounce: [s({ name: "Dana", path: "income", lean: "builder", sceneSec: w(1, 3) }), { topics: T }],
  scrubbed: [s({ sceneSec: w(23, 1), finished: true }), { topics: T }],
  halfway: [s({ path: "protect", lean: "customer", sceneSec: w(12) }), { topics: T }],
  full_watch: [s({ path: "protect", lean: "customer", sceneSec: w(23), finished: true }), { topics: T }],
  full_watch_returned: [s({ path: "income", lean: "builder", sceneSec: w(23), finished: true, returning: true, questions: ["a", "b"] }), { topics: T }],
  full_watch_asked: [s({ path: "income", lean: "builder", sceneSec: w(23), finished: true, ctaActions: ["calendar"], phone: "801-555-0100", smsConsent: true, answers: { timing: "now", experience: "yes" }, revisits: { 13: 2, 16: 1 } }), { topics: T }],
  shop_tap: [s({ path: "protect", lean: "customer", sceneSec: w(23), finished: true, ctaActions: ["shop"] }), { topics: T }],
  enroll_without_watching: [s({ sceneSec: w(1), ctaActions: ["enroll"] }), { topics: T }],
  spanish_no_phone_field: [s({ path: "income", lean: "builder", sceneSec: w(20), phoneOffered: false, answers: { timing: "looking" } }), { topics: T }],
  internal: [s({ sceneSec: w(23), finished: true, ctaActions: ["enroll"] }), { topics: T, internal: true }]
};
var out = {};
Object.keys(cases).forEach(function (k) { out[k] = { signals: cases[k][0], opts: cases[k][1], read: JSON.parse(JSON.stringify(PI.read(cases[k][0], cases[k][1]))) }; });
fs.writeFileSync(path.join(__dirname, "golden-read.json"), JSON.stringify(out, null, 1) + "\n");
console.log("wrote golden-read.json — " + Object.keys(out).map(function (k) { return k + ":" + out[k].read.band; }).join(" "));
