// node test/_golden-read-v3-gen.js — regenerate golden-read-v3.json.
// ONLY when rules 3.x change on purpose (version bump + CHANGELOG).
"use strict";
var fs = require("node:fs"), path = require("node:path");
var PI = require("./_run.js").load().PI;
var T = []; [12, 13, 14].forEach(function (i) { T[i] = "business"; }); [15, 16, 17].forEach(function (i) { T[i] = "product"; });
function w(n, sec, total) { var a = []; for (var i = 0; i < (total || 23); i++) a.push(i < n ? (sec || 20) : 0); return a; }
function s(o) { return Object.assign({ totalDepth: 23, sceneSec: [], ctaActions: [], answers: {}, revisits: {} }, o); }
function opt(o) { return Object.assign({ rules: "3.0.0", topics: T, questions: ["timing", "experience"] }, o || {}); }
var cases = {
  opened_and_left: [s({}), opt()],
  full_first_visit_no_request: [s({ path: "income", lean: "builder", sceneSec: w(23), finished: true }), opt()],
  two_scene_teaser: [s({ totalDepth: 2, sceneSec: [12, 14], finished: true }), opt({ topics: [] })],
  product_route_partial: [s({ path: "protect", lean: "customer", sceneSec: w(12) }), opt()],
  pricing_help_yes: [s({ sceneSec: w(23), intercepts: [{ kind: "pricing", answer: "yes" }] }), opt()],
  calendar_opened_not_booked: [s({ sceneSec: w(23), ctaActions: ["calendar"] }), opt()],
  enroll_clicked_checkout_abandoned: [s({ sceneSec: w(23), ctaActions: ["enroll"], checkoutStarted: true }), opt()],
  email_request_no_phone_field: [s({ sceneSec: w(20), phoneOffered: false, requests: [{ kind: "contact_form", channel: "email" }], answers: { timing: "month" } }), opt()],
  callback_minimal_exposure: [s({ sceneSec: w(1, 3), requests: [{ kind: "callback", channel: "call" }] }), opt()],
  returned_hot_with_struggle: [s({ path: "income", lean: "builder", sceneSec: w(23), finished: true, returning: true, struggle: { 13: { rage: 1 } }, revisits: { 13: 2 } }), opt()],
  skipped_and_declined: [s({ sceneSec: w(23), answerStates: { timing: "skipped", experience: "declined" } }), opt()],
  internal: [s({ sceneSec: w(23), ctaActions: ["enroll"] }), opt({ internal: true })]
};
var out = {};
Object.keys(cases).forEach(function (k) { out[k] = { signals: cases[k][0], opts: cases[k][1], read: JSON.parse(JSON.stringify(PI.read(cases[k][0], cases[k][1]))) }; });
fs.writeFileSync(path.join(__dirname, "golden-read-v3.json"), JSON.stringify(out, null, 1) + "\n");
console.log(Object.keys(out).map(function (k) { return k + ":" + out[k].read.temperature.band + "/" + out[k].read.request.state; }).join("\n"));
