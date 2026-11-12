#!/usr/bin/env node
// tools/compare.mjs — run the same synthetic journeys through two (or more) consumers.
//
//   node tools/compare.mjs --consumer ../site-a --consumer ../site-b [--out report.md]
//
// Each consumer names an adapter in pi.consumer.json ("adapter": "scripts/pi-adapter.cjs")
// that exports { name, evaluator, shape, paths, rules } — its VENDORED evaluator and row
// shape, and its own path vocabulary and rule version.
//
// Two questions, kept apart on purpose:
//   CORE      With no site configuration, does every consumer's vendored evaluator give
//             the identical read for every journey? Any difference is a defect (or a
//             consumer on another release) and the tool exits 1.
//   AS SET UP With each consumer's own paths and rule version, where do reads differ?
//             Those differences come from configuration and content, not the engine,
//             and are listed, not failed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), dirs = [], outAt = args.indexOf("--out");
args.forEach((a, i) => { if (a === "--consumer" && args[i + 1]) dirs.push(path.resolve(args[i + 1])); });
if (dirs.length < 2) { console.error("usage: node tools/compare.mjs --consumer <dir> --consumer <dir> [--out file.md]"); process.exit(1); }

const consumers = dirs.map((d) => {
  const cfg = JSON.parse(fs.readFileSync(path.join(d, "pi.consumer.json"), "utf8"));
  if (!cfg.adapter) { console.error("✗ " + d + ": pi.consumer.json names no adapter"); process.exit(1); }
  const a = require(path.join(d, cfg.adapter)), lock = JSON.parse(fs.readFileSync(path.join(d, "pi.lock.json"), "utf8"));
  return Object.assign({ lock }, a);
});

// Journeys: the package's own golden sets (frozen model, 2.1.0 read, 3.0.0 read).
const J = [];
const g = (f) => JSON.parse(fs.readFileSync(path.join(HERE, "test", f), "utf8"));
for (const [k, v] of Object.entries(g("golden.json"))) J.push({ id: "model/" + k, signals: v.signals, kind: "model" });
for (const [k, v] of Object.entries(g("golden-read.json"))) J.push({ id: "read-2.1.0/" + k, signals: v.signals, opts: v.opts, kind: "read" });
for (const [k, v] of Object.entries(g("golden-read-v3.json"))) J.push({ id: "read-3.0.0/" + k, signals: v.signals, opts: v.opts, kind: "read" });

const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
function diff(a, b, at, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => diff(a[k], b[k], at ? at + "." + k : k, out));
  } else out.push(at || "(whole)");
  return out;
}
function run(c, j, configured) {
  const ev = c.evaluator.createEvaluator(configured ? { paths: c.paths } : {});
  if (j.kind === "model") return plain(ev.analyze(j.signals));
  const opts = Object.assign({}, j.opts || {}); if (configured && !opts.rules) opts.rules = c.rules;
  return plain(ev.readAt(j.signals, opts));
}

const base = consumers[0], lines = [], core = [], setup = {};
for (const j of J) for (const c of consumers.slice(1)) {
  const d = diff(run(base, j, false), run(c, j, false), "", []);
  if (d.length) core.push({ j: j.id, c: c.name, fields: d });
  const s = diff(run(base, j, true), run(c, j, true), "", []);
  s.forEach((f) => { (setup[f] = setup[f] || new Set()).add(j.id); });
}
const sameRelease = consumers.every((c) => c.lock.version === base.lock.version && JSON.stringify(c.lock.sha256["dist/prospect-intelligence.js"]) === JSON.stringify(base.lock.sha256["dist/prospect-intelligence.js"])
  && c.lock.sha256["src/evaluate.js"] === base.lock.sha256["src/evaluate.js"] && c.lock.sha256["src/profile-shape.js"] === base.lock.sha256["src/profile-shape.js"]);

lines.push("# Prospect Intelligence — the same journeys through each consumer", "");
lines.push("| Consumer | Release | Engine commit | Browser bundle | Evaluator | Rule version | Paths |", "| --- | --- | --- | --- | --- | --- | --- |");
consumers.forEach((c) => lines.push("| " + [c.name, c.lock.version, String(c.lock.source && c.lock.source.commit || "").slice(0, 7), c.lock.sha256["dist/prospect-intelligence.js"].slice(0, 12), c.lock.sha256["src/evaluate.js"].slice(0, 12), c.rules, Object.keys(c.paths || {}).length].join(" | ") + " |"));
lines.push("", "**Same release and same hashes in every consumer: " + (sameRelease ? "yes" : "NO") + "**", "");
lines.push("## Core (no site configuration)", "", J.length + " journeys: " + J.filter((j) => j.kind === "model").length + " through the frozen model, the rest through the evidence reads at 2.1.0 and 3.0.0.", "");
lines.push(core.length ? "**" + core.length + " journey(s) differ. This is a defect or a consumer on another release:**" : "**Every journey gives the identical result in every consumer.** Any difference between the sites therefore comes from configuration or content, not from the engine.", "");
core.slice(0, 40).forEach((x) => lines.push("- " + x.j + " (" + x.c + "): " + x.fields.slice(0, 8).join(", ")));
lines.push("", "## As each site is set up (its own path vocabulary and rule version)", "");
const fields = Object.keys(setup).sort();
if (!fields.length) lines.push("No differences.");
else {
  lines.push("These fields differ because the sites name their welcome-screen paths differently. The golden journeys choose paths from the package's default vocabulary; a site that does not use a given path name reads that choice as \"no path chosen\". Expected, and not an engine difference.", "", "| Field | Journeys affected |", "| --- | --- |");
  fields.forEach((f) => lines.push("| `" + f + "` | " + setup[f].size + " of " + J.length + " |"));
}
lines.push("");
const text = lines.join("\n");
if (outAt >= 0 && args[outAt + 1]) fs.writeFileSync(path.resolve(args[outAt + 1]), text); else console.log(text);
if (core.length || !sameRelease) { console.error("✗ the consumers do not run the same core"); process.exit(1); }
console.error("✓ " + consumers.length + " consumers, " + J.length + " journeys, identical core");
