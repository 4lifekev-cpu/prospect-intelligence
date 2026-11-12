#!/usr/bin/env node
// tools/vendor.mjs — copy this release into a consumer, or check a consumer against it.
//
//   node tools/vendor.mjs --consumer /path/to/site            write the files and the pin
//   node tools/vendor.mjs --consumer /path/to/site --check    fail if anything differs
//
// A consumer is any site that runs the engine. It keeps ONE small file of its
// own, pi.consumer.json, saying where each artifact goes in its tree:
//
//   { "targets": { "dist/prospect-intelligence.js": ["assets/prospect-intelligence.js"],
//                  "src/evaluate.js":               ["netlify/functions/_pi-evaluate.js"],
//                  "test/golden.json":              ["tests/fixtures/pi-golden.json"] } }
//
// Everything else is the same for every consumer, which is the point: one tool,
// one release, one set of hashes. The consumer checks the vendored files in, so
// its deploy never reaches for this repository; pi.lock.json records
//   sha256   one hash per ARTIFACT — equal in every consumer on the same release
//   files    one hash per vendored FILE — what the consumer verifies offline
// A .js artifact from src/ gets a one-line GENERATED header; the browser bundle
// already carries its own; .json is copied as it is.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const at = argv.indexOf("--consumer");
const CONSUMER = at >= 0 && argv[at + 1] ? path.resolve(argv[at + 1]) : null;

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
if (!CONSUMER) fail("usage: node tools/vendor.mjs --consumer <dir> [--check]");
const cfgPath = path.join(CONSUMER, "pi.consumer.json");
if (!fs.existsSync(cfgPath)) fail("no pi.consumer.json in " + CONSUMER);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (!cfg.targets || typeof cfg.targets !== "object") fail("pi.consumer.json: targets is required");

const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
const { output: bundle, release } = await import(path.join(HERE, "build.mjs") + "?t=" + Date.now());
const rel = JSON.parse(release);
const onDisk = fs.existsSync(path.join(HERE, "release.json")) ? fs.readFileSync(path.join(HERE, "release.json"), "utf8") : null;
if (onDisk !== release) fail("this checkout's release.json is stale — run `npm run build` here first");

const ALLOWED = /^(dist\/prospect-intelligence\.js|src\/(evaluate|config|profile-shape|outcomes|tenancy|integrations)\.js|test\/golden[a-z0-9-]*\.json|schema\/[a-z0-9.-]+\.json|signals\.json)$/;
function artifact(name) {
  if (!ALLOWED.test(name)) fail("pi.consumer.json: \"" + name + "\" is not something a consumer may vendor");
  if (name === "dist/prospect-intelligence.js") return { raw: bundle, out: bundle };
  const raw = fs.readFileSync(path.join(HERE, name), "utf8");
  if (/\.json$/.test(name)) return { raw, out: raw };
  return { raw, out: "// GENERATED — do not edit. Vendored from " + pkg.name + " " + pkg.version + " (" + name +
    ") by tools/vendor.mjs. Change the package, then re-vendor.\n" + raw };
}
let commit = null;
try { commit = execFileSync("git", ["-C", HERE, "rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) {}

const artifacts = {}, files = {}, writes = [];
for (const name of Object.keys(cfg.targets).sort()) {
  const a = artifact(name);
  artifacts[name] = rel.sha256[name] || sha(a.raw);
  for (const out of [].concat(cfg.targets[name])) {
    if (path.isAbsolute(out) || out.split(/[\\/]/).includes("..")) fail("pi.consumer.json: \"" + out + "\" leaves the consumer");
    files[out] = sha(a.out); writes.push({ out, content: a.out });
  }
}
// The pin never records a clock or a path on this machine, so it is the same
// file whoever vendors it. In --check the commit already recorded is kept:
// a check must not fail only because the package gained an unrelated commit.
const lockPath = path.join(CONSUMER, cfg.lock || "pi.lock.json");
const old = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
const lock = JSON.stringify({ package: pkg.name, version: pkg.version,
  source: { repository: "prospect-intelligence", commit: CHECK && old && old.source ? old.source.commit : commit },
  sha256: artifacts, files }, null, 2) + "\n";
writes.push({ out: cfg.lock || "pi.lock.json", content: lock });

let stale = 0;
for (const w of writes) {
  const abs = path.join(CONSUMER, w.out);
  const have = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (have === w.content) { console.log("  ✓ " + w.out + " is current (" + pkg.version + ")"); continue; }
  if (CHECK) { console.error("  ✗ " + w.out + " differs from release " + pkg.version); stale++; continue; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, w.content);
  console.log("  ✓ wrote " + w.out + " (" + pkg.version + ")");
}
if (stale) fail("the consumer is not on release " + pkg.version + " — run the vendor step without --check");
console.log(CHECK ? "\n✓ consumer matches release " + pkg.version + "\n" : "\n✓ vendored release " + pkg.version + "\n");
