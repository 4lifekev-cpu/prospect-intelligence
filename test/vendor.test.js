// The vendor tool: one release, the same hashes in every consumer.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var cp = require("node:child_process");
var crypto = require("node:crypto");
var ROOT = path.resolve(__dirname, "..");
var sha = function (s) { return crypto.createHash("sha256").update(s).digest("hex"); };

function consumer(targets) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-consumer-"));
  fs.writeFileSync(path.join(dir, "pi.consumer.json"), JSON.stringify({ targets: targets }));
  return dir;
}
function run(dir, extra) {
  return cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "vendor.mjs"), "--consumer", dir].concat(extra || []), { encoding: "utf8" });
}

test("release.json matches the source", function () {
  var r = cp.spawnSync(process.execPath, [path.join(ROOT, "build.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("two consumers with different layouts get identical artifact hashes and byte-identical files", function () {
  var a = consumer({ "dist/prospect-intelligence.js": ["assets/prospect-intelligence.js"], "src/evaluate.js": ["netlify/functions/_pi-evaluate.js"], "src/profile-shape.js": ["netlify/functions/_pi-shape.js"] });
  var b = consumer({ "dist/prospect-intelligence.js": ["public/pi.js", "m/assets/pi.js"], "src/evaluate.js": ["api/_evaluate.js"], "src/profile-shape.js": ["api/_shape.js"], "test/golden.json": ["tests/fixtures/golden.json"] });
  assert.equal(run(a).status, 0); assert.equal(run(b).status, 0);
  var la = JSON.parse(fs.readFileSync(path.join(a, "pi.lock.json"), "utf8")), lb = JSON.parse(fs.readFileSync(path.join(b, "pi.lock.json"), "utf8"));
  var rel = JSON.parse(fs.readFileSync(path.join(ROOT, "release.json"), "utf8"));
  ["dist/prospect-intelligence.js", "src/evaluate.js", "src/profile-shape.js"].forEach(function (k) {
    assert.equal(la.sha256[k], lb.sha256[k], k + " differs between consumers"); assert.equal(la.sha256[k], rel.sha256[k]);
  });
  assert.equal(la.version, rel.version);
  assert.equal(fs.readFileSync(path.join(a, "assets/prospect-intelligence.js"), "utf8"), fs.readFileSync(path.join(b, "m/assets/pi.js"), "utf8"));
  assert.equal(lb.files["public/pi.js"], sha(fs.readFileSync(path.join(b, "public/pi.js"), "utf8")));
  // The vendored evaluator is the source plus one header line, and still runs.
  var ev = fs.readFileSync(path.join(a, "netlify/functions/_pi-evaluate.js"), "utf8");
  assert.match(ev.split("\n")[0], /^\/\/ GENERATED — do not edit\./);
  assert.equal(sha(ev.slice(ev.indexOf("\n") + 1)), rel.sha256["src/evaluate.js"]);
  assert.equal(typeof require(path.join(a, "netlify/functions/_pi-evaluate.js")).createEvaluator, "function");
  assert.equal(run(a, ["--check"]).status, 0);
});

test("--check fails on a drifted file and writes nothing", function () {
  var a = consumer({ "src/profile-shape.js": ["fn/_shape.js"] });
  run(a);
  var f = path.join(a, "fn/_shape.js"), edited = fs.readFileSync(f, "utf8") + "\n// a local edit";
  fs.writeFileSync(f, edited);
  var r = run(a, ["--check"]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /differs from release/);
  assert.equal(fs.readFileSync(f, "utf8"), edited, "--check changed a file");
});

test("a consumer cannot vendor engine source, write outside itself, or run without its file", function () {
  assert.notEqual(run(consumer({ "src/engine.js": ["x.js"] })).status, 0, "the unbuilt collector was vendored");
  assert.notEqual(run(consumer({ "package.json": ["x.json"] })).status, 0);
  assert.notEqual(run(consumer({ "src/evaluate.js": ["../outside.js"] })).status, 0);
  assert.notEqual(run(fs.mkdtempSync(path.join(os.tmpdir(), "pi-empty-"))).status, 0);
});

test("the pin holds no clock and no machine path", function () {
  var a = consumer({ "src/config.js": ["scripts/_pi-config.cjs"] }); run(a);
  var lock = fs.readFileSync(path.join(a, "pi.lock.json"), "utf8");
  assert.ok(!/\d{4}-\d{2}-\d{2}T|\/tmp\/|\/home\//.test(lock));
  assert.deepEqual(Object.keys(JSON.parse(lock)), ["package", "version", "source", "sha256", "files"]);
});

test("compare: two consumers on this release have an identical core; a tampered evaluator is caught", function () {
  function site(name, paths) {
    var d = consumer({ "dist/prospect-intelligence.js": ["a/pi.js"], "src/evaluate.js": ["fn/_evaluate.js"], "src/profile-shape.js": ["fn/_shape.js"] });
    var cfg = JSON.parse(fs.readFileSync(path.join(d, "pi.consumer.json"), "utf8")); cfg.adapter = "adapter.cjs";
    fs.writeFileSync(path.join(d, "pi.consumer.json"), JSON.stringify(cfg));
    fs.writeFileSync(path.join(d, "adapter.cjs"), "module.exports={name:" + JSON.stringify(name) + ",evaluator:require('./fn/_evaluate.js'),shape:require('./fn/_shape.js'),rules:'2.1.0',paths:" + JSON.stringify(paths) + "};");
    assert.equal(run(d).status, 0); return d;
  }
  var a = site("one", { wealth: { motivation: "Financial growth", lean: "builder" } }), b = site("two", { health: { motivation: "Purpose & product", lean: "customer" } });
  var cmp = function () { return cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "compare.mjs"), "--consumer", a, "--consumer", b], { encoding: "utf8" }); };
  var ok = cmp();
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /identical result in every consumer/); assert.match(ok.stdout, /Same release and same hashes in every consumer: yes/);
  var f = path.join(b, "fn/_evaluate.js");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("function r100(n) { return Math.round(clamp(n, 0, 100)); }", "function r100(n) { return Math.round(clamp(n + 3, 0, 100)); }"));
  var bad = cmp();
  assert.notEqual(bad.status, 0, "a forked evaluator passed the comparison"); assert.match(bad.stdout, /differ/);
});
