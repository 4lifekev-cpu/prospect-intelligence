#!/usr/bin/env node
// tools/admin.mjs — the internal provisioning tool for a brand on the engine.
//
//   node tools/admin.mjs validate <dir>                          check a brand's files
//   node tools/admin.mjs publish  <dir> --actor owner            version it and make it live
//   node tools/admin.mjs preview  <dir>                          write <dir>/site (a page to open)
//   node tools/admin.mjs health                                  what is live, on which release
//   node tools/admin.mjs rollback <brandId> --actor owner [--to <version>]
//   node tools/admin.mjs disable|enable <brandId> --actor owner
//
//   --registry <file>   where versions are kept (default sandbox/registry.json)
//   --tenant <id>       act as a member of this customer (default: the brand's own)
//
// This is the whole "admin interface" for now, on purpose: a brand is set up by a person
// who can read these files, and a self-service screen waits until a customer needs one.
// It touches files in this repository only. It deploys nothing and contacts nothing.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = require(path.join(HERE, "src", "tenancy.js")), C = require(path.join(HERE, "src", "config.js"));

const argv = process.argv.slice(2), cmd = argv[0], arg = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REG = path.resolve(opt("registry", path.join(HERE, "sandbox", "registry.json")));
const fail = (m) => { console.error("✗ " + m); process.exit(1); };
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const registry = () => (fs.existsSync(REG) ? readJson(REG) : T.empty());
const save = (r) => { fs.mkdirSync(path.dirname(REG), { recursive: true }); fs.writeFileSync(REG, JSON.stringify(r, null, 2) + "\n"); };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function bundle(dir) {
  const d = path.resolve(dir || "");
  if (!dir || !fs.existsSync(path.join(d, "brand.json"))) fail("no brand.json in " + d);
  const brand = readJson(path.join(d, "brand.json")), appearance = readJson(path.join(d, "appearance.json"));
  const manifests = fs.readdirSync(d).filter((f) => /^presentation[a-z0-9.-]*\.json$/.test(f)).map((f) => readJson(path.join(d, f)));
  return { dir: d, brand, appearance, manifests };
}
function actorFor(customer) {
  const role = opt("actor", "");
  if (!role) fail("say who is doing this: --actor owner|admin|presentation_editor|affiliate|analyst|support");
  return { role, tenant: opt("tenant", customer), handle: opt("as", role) };
}

if (cmd === "validate") {
  const b = bundle(arg), v = T.validateBundle(b);
  if (!v.ok) { v.errors.forEach((e) => console.error("  ✗ " + e)); fail(b.brand.brandId + ": " + v.errors.length + " problem(s)"); }
  console.log("✓ " + b.brand.brandId + ": brand, appearance and " + b.manifests.length + " presentation(s) are valid (version " + T.versionOf({ brand: b.brand, appearance: b.appearance, manifests: b.manifests }) + ")");
} else if (cmd === "publish") {
  const b = bundle(arg), r = T.publish(registry(), b, actorFor(b.brand.customerId));
  if (!r.ok) { (r.errors || []).forEach((e) => console.error("  ✗ " + e)); fail("not published: " + r.reason); }
  save(r.registry);
  console.log("✓ " + b.brand.brandId + (r.unchanged ? " is already live at " : " is live at ") + r.version);
} else if (cmd === "rollback" || cmd === "disable" || cmd === "enable") {
  const reg = registry(), d = reg.deployments[arg]; if (!d) fail("no such brand in the registry: " + arg);
  const who = actorFor(d.customerId);
  const r = cmd === "rollback" ? T.rollback(reg, arg, who, opt("to", null)) : T.setStatus(reg, arg, who, cmd === "enable" ? "enabled" : "disabled");
  if (!r.ok) fail("refused: " + r.reason);
  save(r.registry);
  console.log("✓ " + arg + (cmd === "rollback" ? " rolled back to " + r.version : " is now " + (cmd === "enable" ? "enabled" : "disabled")));
} else if (cmd === "health") {
  const reg = registry(), rel = readJson(path.join(HERE, "release.json")), ids = Object.keys(reg.deployments).sort();
  if (!ids.length) console.log("No brand is registered in " + path.relative(HERE, REG));
  console.log("Engine release " + rel.version + "  bundle " + rel.sha256["dist/prospect-intelligence.js"].slice(0, 12));
  ids.forEach((id) => {
    const d = reg.deployments[id], h = d.history.filter((x) => x.version === d.active)[0];
    console.log("  " + id.padEnd(16) + d.status.padEnd(9) + " config " + (d.active || "—") + "  versions kept " + d.history.length + "  customer " + d.customerId +
      (h ? "  rules " + h.brand.browser.ruleVersion + "  presentations " + h.brand.browser.presentations.join(", ") : ""));
  });
} else if (cmd === "preview") {
  const b = bundle(arg), v = T.validateBundle(b); if (!v.ok) fail("fix the brand first: " + v.errors[0]);
  const m = b.manifests[0], surface = Object.keys(m.surfaces)[0], locale = m.locales[0], sc = C.toScenesConfig(m, locale, surface);
  const paths = fs.existsSync(path.join(b.dir, "paths.json")) ? readJson(path.join(b.dir, "paths.json")) : {};
  const a = b.appearance, disp = b.brand.browser.display, term = b.brand.browser.terminology;
  // The page's settings are plain data taken from the validated files. No value is ever
  // written into a script as code: it is serialised, and "<" is escaped so it cannot
  // close the script element.
  const tenant = { storagePrefix: b.brand.brandId.replace(/[^a-z0-9]/g, "") + "_", piPaths: paths, piConsentRequired: true, piRepParam: a.distributor.param,
    piScenes: { narration: sc.narration, topics: sc.topics, actions: sc.actions }, piSession: "", piNotify: "" };
  const site = path.join(b.dir, "site"); fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, "tenant.js"), "// GENERATED by tools/admin.mjs preview — do not edit.\nwindow.TENANT = " + JSON.stringify(tenant, null, 2).replace(/</g, "\\u003c") + ";\n");
  const scenes = m.surfaces[surface].legacyOrder;
  const html = `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(disp.experienceName)} · preview</title>
<style>
  :root{--brand:${esc(a.colors.brand)};--accent:${esc(a.colors.accent)};--ink:${esc(a.colors.ink || "#1b1b1b")};--paper:${esc(a.colors.paper || "#ffffff")}}
  body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--paper);color:var(--ink)}
  main{max-width:640px;margin:0 auto;padding:24px 20px 96px}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid var(--brand);padding-bottom:12px}
  h1{font-size:22px;margin:0;color:var(--brand)} h2{font-size:28px;line-height:1.2;margin:28px 0 8px}
  .tag{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);border-left:3px solid var(--accent);padding-left:8px}
  button,a.btn{min-height:44px;padding:0 18px;border-radius:10px;border:2px solid var(--brand);background:var(--brand);color:#fff;font:600 15px inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
  button.quiet{background:transparent;color:var(--brand)} button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
  .row{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px} .fine{font-size:13px;opacity:.8;margin-top:28px}
  #consent{position:fixed;left:0;right:0;bottom:0;background:var(--ink);color:var(--paper);padding:16px 20px}
  #consent .row{margin-top:10px} #consent button{border-color:var(--paper);background:var(--paper);color:var(--ink)} #consent button.quiet{background:transparent;color:var(--paper)}
  a{color:var(--brand)} #consent a{color:var(--paper)}
  pre{white-space:pre-wrap;background:rgba(0,0,0,.06);padding:12px;border-radius:8px;font-size:12px}
</style>
</head>
<body>
<main>
  <header><h1>${esc(disp.platformName)}</h1><span class="tag">Preview · not a live site</span></header>
  <p class="tag" id="count" aria-live="polite"></p>
  <h2 id="title" tabindex="-1"></h2>
  <p id="body"></p>
  <div class="row"><button type="button" id="next">Next</button><button type="button" class="quiet" data-cta="shop">See the collection</button><button type="button" class="quiet" data-cta="join">Become a ${esc(term.business.singular)}</button><button type="button" class="quiet" data-cta="call">Ask for a call</button></div>
  <p class="fine">${esc((a.disclosures[0] || {}).text || "")}</p>
  <p class="fine"><a href="${esc(a.links.privacy)}">Privacy</a> · <a href="${esc(a.links.terms)}">Terms</a></p>
  <h2 style="font-size:18px">What the engine would report</h2>
  <pre id="read" aria-live="polite">Nothing yet.</pre>
</main>
<div id="consent" role="region" aria-label="Your choice"><div>May this page remember how you use it, so your ${esc(term.business.singular)} can follow up helpfully? It works either way.</div>
  <div class="row"><button type="button" id="yes">Allow</button><button type="button" class="quiet" id="no">No thanks</button></div></div>
<script>
  // The engine asks this object whether the visitor agreed. Declined means nothing is kept or sent.
  window.HSConsent = (function () { var s = "unset", w = []; return { state: function () { return s; }, granted: function () { return s === "granted"; },
    whenGranted: function (f) { if (s === "granted") f(); else w.push(f); }, set: function (v) { s = v; if (v === "granted") w.splice(0).forEach(function (f) { f(); }); } }; })();
</script>
<script src="tenant.js"></script>
<script src="../vendor/prospect-intelligence.js"></script>
<script>
(function () {
  var SCENES = ${JSON.stringify(scenes).replace(/</g, "\\u003c")}, i = 0;
  function show() {
    document.getElementById("count").textContent = "Scene " + (i + 1) + " of " + SCENES.length;
    document.getElementById("title").textContent = SCENES[i].replace(/^./, function (c) { return c.toUpperCase(); });
    document.getElementById("body").textContent = "Placeholder content for the " + SCENES[i] + " scene.";
    if (window.PI) { PI.track("scene", { index: i, total: SCENES.length, sceneId: SCENES[i], surface: ${JSON.stringify(surface)} }); if (i === SCENES.length - 1) { PI.track("finished"); PI.finish && PI.finish(); } }
    report();
  }
  function report() { try { var r = PI.read(); document.getElementById("read").textContent = "band: " + r.band + "\\nevidence: " + r.evidence.strength + " (" + r.evidence.qualified + " of " + r.evidence.total + " scenes)\\nrules: " + r.rules.version + "\\nintent: " + r.dims.intent.score; } catch (e) {} }
  document.getElementById("next").addEventListener("click", function () { if (i < SCENES.length - 1) { i++; show(); document.getElementById("title").focus(); } });
  document.querySelectorAll("[data-cta]").forEach(function (b) { b.addEventListener("click", function () { if (window.PI) PI.track("cta", { action: b.getAttribute("data-cta") }); report(); }); });
  function choose(v) { HSConsent.set(v); document.getElementById("consent").remove(); show(); }
  document.getElementById("yes").addEventListener("click", function () { choose("granted"); });
  document.getElementById("no").addEventListener("click", function () { choose("denied"); });
  show();
})();
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(site, "index.html"), html);
  // What an alert to a distributor would look like in this brand's colours and words.
  fs.writeFileSync(path.join(site, "email-preview.html"), `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${esc(a.email.fromName)} · alert preview</title></head>
<body style="margin:0;background:${esc(a.colors.paper || "#ffffff")};font:15px/1.5 Helvetica,Arial,sans-serif;color:${esc(a.colors.ink || "#1b1b1b")}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid ${esc(a.colors.brand)};border-radius:12px">
<tr><td style="padding:18px 22px;border-bottom:3px solid ${esc(a.colors.brand)};font-weight:700;color:${esc(a.colors.brand)}">${esc(a.email.fromName)}</td></tr>
<tr><td style="padding:18px 22px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;border-left:3px solid ${esc(a.colors.accent)};padding-left:8px">A ${esc(term.prospect.singular)} asked for a next step</p>
<p style="margin:0 0 12px;font-size:18px;font-weight:700">Sample ${esc(term.prospect.singular)} finished ${esc(disp.experienceName)}</p>
<p style="margin:0">This is a preview with made-up content. A real alert carries the same brief as the ${esc(term.business.singular)}'s card.</p></td></tr>
<tr><td style="padding:14px 22px;font-size:12px;opacity:.8;border-top:1px solid #ddd">${esc(a.email.footer)}${a.email.senderVerified ? "" : " Sender not yet verified: this brand cannot send email until its sending domain is verified."}</td></tr>
</table></td></tr></table></body></html>
`);
  console.log("✓ wrote " + path.relative(HERE, site) + "/index.html, tenant.js and email-preview.html for " + b.brand.brandId);
} else {
  fail("usage: node tools/admin.mjs validate|publish|preview <dir> | health | rollback|disable|enable <brandId>   (--actor <role>)");
}
