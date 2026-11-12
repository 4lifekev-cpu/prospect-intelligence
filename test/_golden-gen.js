// One-time generator: run against the pre-extraction engine to freeze the model.
//   node test/_golden-gen.js /path/to/live/prospect-intelligence.js > test/golden.json
"use strict";
var fs = require("node:fs"), vm = require("node:vm");
var src = fs.readFileSync(process.argv[2], "utf8");
// The pre-extraction engine did not export analyze(); reach in.
if (src.indexOf("analyze: analyze") < 0) src = src.replace("root.PI = {", "root.__analyze = analyze;\n  root.PI = {");
var win = { location: { search: "" }, navigator: {}, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  addEventListener: function () {}, console: console, Date: Date, Math: Math, JSON: JSON, URLSearchParams: URLSearchParams, Blob: function () {} };
win.window = win; vm.runInNewContext(src, win);
var T0 = 1757000000000;
var cases = {
  anonymous_bounce:  { startedAt: T0, lastEventAt: T0 + 8000, maxDepth: 1, totalDepth: 24, droppedEarly: true },
  named_explorer:    { name: "Dana", startedAt: T0, lastEventAt: T0 + 90000, maxDepth: 7, totalDepth: 24, interactions: 1 },
  wealth_builder:    { name: "Dana", path: "wealth", pathLabel: "Wealth", startedAt: T0, lastEventAt: T0 + 300000, maxDepth: 20, totalDepth: 24, interactions: 3, reactions: ["love", "yes"] },
  protect_customer:  { name: "Sam", path: "protect", startedAt: T0, lastEventAt: T0 + 240000, maxDepth: 16, totalDepth: 24, interactions: 2, reactions: ["love"] },
  researcher:        { name: "Lee", path: "proof", startedAt: T0, lastEventAt: T0 + 600000, maxDepth: 22, totalDepth: 24, interactions: 2, questions: ["How much?", "Is it insured?", "Who runs it?"] },
  booked_ready_now:  { name: "Ava", email: "ava@example.test", contactMethod: "email", path: "income", startedAt: T0, lastEventAt: T0 + 420000, maxDepth: 24, totalDepth: 24, interactions: 4, reactions: ["love", "love"], booked: true, ctaAction: "enroll" },
  backtracker:       { name: "Kim", path: "freedom", startedAt: T0, lastEventAt: T0 + 200000, maxDepth: 10, totalDepth: 24, interactions: 1, backtracks: 4 },
  unknown_path:      { name: "Rae", path: "moon", startedAt: T0, lastEventAt: T0 + 100000, maxDepth: 12, totalDepth: 24, interactions: 2 },
  dwell_override:    { name: "Jo", path: "legacy", startedAt: T0, lastEventAt: T0 + 5000, dwellMs: 900000, maxDepth: 18, totalDepth: 24, interactions: 2, reactions: ["yes"] }
};
var out = {};
Object.keys(cases).forEach(function (k) { out[k] = { signals: cases[k], read: (win.PI.analyze || win.__analyze)(cases[k]) }; });
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
