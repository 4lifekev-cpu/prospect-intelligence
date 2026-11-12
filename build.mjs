#!/usr/bin/env node
// @kmin/prospect-intelligence — build
//
//   node build.mjs            writes dist/prospect-intelligence.js
//   node build.mjs --check    fails if dist/ does not match what src/ would produce
//
// The "build" is deliberately tiny: stamp a provenance header on the engine and
// copy it. No bundler, no minifier, no transform — the file a venture ships is
// the file a human can read in this repository, plus a header that says where
// it came from and which version it is. A consumer's sync script compares its
// vendored copy against dist/ byte for byte, so the header must be a pure
// function of (version, source), never of the clock.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
// Since 1.7.0 (Prompt 02) the browser file is the pure evaluator followed by
// the browser collector. The evaluator file is the same bytes a server
// requires, so both run the identical core.
const evaluator = fs.readFileSync(path.join(HERE, "src", "evaluate.js"), "utf8");
const engine = fs.readFileSync(path.join(HERE, "src", "engine.js"), "utf8");
const src = evaluator + "\n" + engine;
const sha = createHash("sha256").update(src).digest("hex").slice(0, 12);
export const evaluatorSha = createHash("sha256").update(evaluator).digest("hex");

const header = [
  "/* GENERATED — do not edit. Built by @kmin/prospect-intelligence " + pkg.version + " (src/evaluate.js + src/engine.js sha256:" + sha + ").",
  " * The source of truth is src/{evaluate,engine}.js in the Prospect Intelligence",
  " * repository. Consumers vendor this file with tools/vendor.mjs and check it in;",
  " * their build fails when it drifts from the package. Edit the source, rebuild,",
  " * re-sync. */",
  ""
].join("\n");

export const output = header + src;
const outPath = path.join(HERE, "dist", "prospect-intelligence.js");

// release.json — what a consumer pins. One hash per artifact; two consumers with
// equal hashes run the same core, whichever repository vendored it.
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const ARTIFACTS = ["src/evaluate.js", "src/config.js", "src/profile-shape.js", "src/outcomes.js"];
const hashes = { "dist/prospect-intelligence.js": sha256(output) };
for (const a of ARTIFACTS) hashes[a] = sha256(fs.readFileSync(path.join(HERE, a), "utf8"));
export const release = JSON.stringify({ package: pkg.name, version: pkg.version, sha256: hashes }, null, 2) + "\n";
const relPath = path.join(HERE, "release.json");

if (process.argv.includes("--check")) {
  const have = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
  const haveRel = fs.existsSync(relPath) ? fs.readFileSync(relPath, "utf8") : null;
  if (have !== output || haveRel !== release) {
    console.error("✗ dist/prospect-intelligence.js or release.json is stale — run `npm run build`");
    process.exit(1);
  }
  console.log("✓ dist/ and release.json match src/ (" + pkg.version + ", " + sha + ")");
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output);
  fs.writeFileSync(relPath, release);
  console.log("✓ wrote dist/prospect-intelligence.js and release.json (" + pkg.version + ", " + sha + ", " + output.length + " bytes)");
}
