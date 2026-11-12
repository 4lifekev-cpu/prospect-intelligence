// GENERATED — do not edit. Vendored from @kmin/prospect-intelligence 1.13.1 (src/config.js) by tools/vendor.mjs. Change the package, then re-vendor.
/* ============================================================================
 *  PROSPECT INTELLIGENCE™  —  configuration contracts
 *  @kmin/prospect-intelligence  ·  Prompt 02 (product boundary)
 *
 *  Two versioned documents describe everything a brand brings to the engine.
 *  Both are DATA. Neither can carry code, a formula, a secret or a venture
 *  name into the engine; this file is what refuses them.
 *
 *    pi-presentation-manifest@1   one presentation: stable scene ids, what each
 *                                 scene is about, how long its narration runs in
 *                                 each locale, which CTA means what, and how each
 *                                 surface (phone, desktop) numbers its scenes.
 *    pi-brand-config@1            one brand: ids, display tokens, terminology,
 *                                 approved domains, its manifests, channels,
 *                                 policy versions, rule version, feature flags,
 *                                 and NAMES of server-side integrations. Split
 *                                 into `browser` (safe to ship) and `server`
 *                                 (references only — environment variable names,
 *                                 never values).
 *
 *  Pure and dependency-free: runs in a build script, a server or a test. The
 *  browser engine never loads this file; a build turns a manifest into the
 *  plain arrays the evaluator already takes (toScenesConfig).
 * ========================================================================== */
"use strict";

var MANIFEST_SCHEMA = "pi-presentation-manifest@1";
var BRAND_SCHEMA = "pi-brand-config@1";
var RULE_VERSIONS = ["2.1.0", "3.0.0"];
var TOPICS = ["business", "product", null];
var CTA_MEANINGS = ["next", "business_next_step", "product_next_step", "contact_request", "channel_link", "info_link", "share", "save"];
var CHANNELS = ["email", "text", "call", "whatsapp", "calendar"];
var ID = /^[a-z][a-z0-9_-]{1,47}$/;
var LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
var VERSION = /^\d+\.\d+\.\d+$/;
var DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// Anything that looks like code, a formula or a secret is refused wherever it
// appears in a configuration document, however deep.
var CODE = /(=>|\bfunction\s*\(|\beval\s*\(|new\s+Function|<script|javascript:|\bMath\.|\bprocess\.env\b|\$\{)/i;
var SECRETISH_KEY = /(secret|password|passwd|private[_-]?key|service[_-]?role|api[_-]?key|token|bearer|webhook[_-]?url)$/i;
var SECRETISH_VALUE = /^(sk_(live|test)_|rk_live_|xox[abpr]-|ghp_|github_pat_|eyJ[A-Za-z0-9_-]{20,}\.eyJ)/;

function err(list, where, msg) { list.push(where + ": " + msg); }
function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
function only(o, keys, where, errors) {
  Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) err(errors, where, "unknown key \"" + k + "\""); });
}
function scan(v, where, errors, inServer) {
  if (typeof v === "string") {
    if (CODE.test(v)) err(errors, where, "looks like code or a formula — configuration is data only");
    if (SECRETISH_VALUE.test(v)) err(errors, where, "looks like a secret value — secrets never go in configuration");
  } else if (Array.isArray(v)) v.forEach(function (x, i) { scan(x, where + "[" + i + "]", errors, inServer); });
  else if (isObj(v)) Object.keys(v).forEach(function (k) {
    // In `server`, keys name environment variables by design (e.g. "notifyEnv"),
    // and their values must be variable NAMES — checked separately.
    if (!inServer && SECRETISH_KEY.test(k)) err(errors, where + "." + k, "a secret-shaped key outside `server`");
    scan(v[k], where + "." + k, errors, inServer || k === "server");
  });
}

/* ── presentation manifest ─────────────────────────────────────────────── */
function validateManifest(m) {
  var e = [];
  if (!isObj(m)) return { ok: false, errors: ["manifest: not an object"] };
  only(m, ["$schema", "presentationId", "contentVersion", "locales", "scenes", "surfaces", "routes", "ctas", "questions", "approvedContent", "notes"], "manifest", e);
  if (m.$schema !== MANIFEST_SCHEMA) err(e, "manifest.$schema", "must be " + MANIFEST_SCHEMA);
  if (!ID.test(m.presentationId || "")) err(e, "manifest.presentationId", "lowercase id, 2–48 characters");
  if (!VERSION.test(m.contentVersion || "")) err(e, "manifest.contentVersion", "semantic version");
  var locales = Array.isArray(m.locales) ? m.locales : [];
  if (!locales.length || !locales.every(function (l) { return LOCALE.test(l); })) err(e, "manifest.locales", "one or more locale codes");
  var ids = {};
  (Array.isArray(m.scenes) ? m.scenes : (err(e, "manifest.scenes", "array"), [])).forEach(function (s, i) {
    var w = "manifest.scenes[" + i + "]";
    if (!isObj(s)) return err(e, w, "object");
    only(s, ["id", "topic", "narrationSec", "eligible", "contentIds", "note"], w, e);
    if (!ID.test(s.id || "")) err(e, w + ".id", "stable lowercase id");
    if (ids[s.id]) err(e, w + ".id", "duplicate \"" + s.id + "\"");
    ids[s.id] = true;
    if (TOPICS.indexOf(s.topic === undefined ? null : s.topic) < 0) err(e, w + ".topic", "business | product | null");
    if (!isObj(s.narrationSec)) err(e, w + ".narrationSec", "seconds by locale");
    else locales.forEach(function (l) {
      var v = s.narrationSec[l];
      if (typeof v !== "number" || !(v >= 0) || v > 600) err(e, w + ".narrationSec." + l, "0–600 seconds");
    });
    if (s.eligible !== undefined && typeof s.eligible !== "boolean") err(e, w + ".eligible", "boolean");
  });
  if (!isObj(m.surfaces) || !Object.keys(m.surfaces).length) err(e, "manifest.surfaces", "at least one surface");
  else Object.keys(m.surfaces).forEach(function (k) {
    var s = m.surfaces[k], w = "manifest.surfaces." + k;
    if (!ID.test(k)) err(e, w, "id");
    if (!isObj(s) || !Array.isArray(s.legacyOrder)) return err(e, w + ".legacyOrder", "array of scene ids in the order this surface numbers them");
    only(s, ["legacyOrder", "note"], w, e);
    s.legacyOrder.forEach(function (id, i) { if (!ids[id]) err(e, w + ".legacyOrder[" + i + "]", "unknown scene \"" + id + "\""); });
  });
  if (m.routes !== undefined) {
    if (!isObj(m.routes)) err(e, "manifest.routes", "object of route id → scene ids");
    else Object.keys(m.routes).forEach(function (r) {
      if (!ID.test(r) || !Array.isArray(m.routes[r])) return err(e, "manifest.routes." + r, "array of scene ids");
      m.routes[r].forEach(function (id) { if (!ids[id]) err(e, "manifest.routes." + r, "unknown scene \"" + id + "\""); });
    });
  }
  if (!isObj(m.ctas)) err(e, "manifest.ctas", "object of CTA action → meaning");
  else Object.keys(m.ctas).forEach(function (a) {
    if (!ID.test(a)) err(e, "manifest.ctas." + a, "id");
    if (CTA_MEANINGS.indexOf(m.ctas[a]) < 0) err(e, "manifest.ctas." + a, "one of " + CTA_MEANINGS.join(" | "));
  });
  if (m.questions !== undefined) {
    if (!Array.isArray(m.questions)) err(e, "manifest.questions", "array");
    else m.questions.forEach(function (q, i) {
      var w = "manifest.questions[" + i + "]";
      if (!isObj(q) || !ID.test(q.id || "")) return err(e, w, "{ id, sceneId?, answers }");
      only(q, ["id", "sceneId", "answers", "note"], w, e);
      if (q.sceneId !== undefined && !ids[q.sceneId]) err(e, w + ".sceneId", "unknown scene");
      if (!Array.isArray(q.answers) || !q.answers.every(function (a) { return ID.test(a); })) err(e, w + ".answers", "array of answer ids");
    });
  }
  if (m.approvedContent !== undefined && (!Array.isArray(m.approvedContent) || !m.approvedContent.every(function (c) { return typeof c === "string" && /^[A-Z]-\d{3}$/.test(c); })))
    err(e, "manifest.approvedContent", "array of claim ids (C-001)");
  scan(m, "manifest", e, false);
  return { ok: e.length === 0, errors: e };
}

/* A manifest, one locale and one surface → the arrays the evaluator takes
   (readOpts: narration, topics, actions, questions), indexed the way THAT
   surface numbers its scenes. Returns null when anything is missing, so a
   caller falls back to no scene configuration rather than a wrong one.    */
function toScenesConfig(m, locale, surface) {
  if (!validateManifest(m).ok) return null;
  var s = m.surfaces[surface];
  if (!s || m.locales.indexOf(locale) < 0) return null;
  var byId = {};
  m.scenes.forEach(function (sc) { byId[sc.id] = sc; });
  var business = [], product = [];
  Object.keys(m.ctas).forEach(function (a) {
    if (m.ctas[a] === "business_next_step") business.push(a);
    if (m.ctas[a] === "product_next_step") product.push(a);
  });
  return {
    manifest: m.presentationId + "@" + m.contentVersion, locale: locale, surface: surface,
    sceneIds: s.legacyOrder.slice(),
    narration: s.legacyOrder.map(function (id) { return byId[id].narrationSec[locale]; }),
    topics: s.legacyOrder.map(function (id) { return byId[id].topic || null; }),
    eligible: s.legacyOrder.map(function (id) { return byId[id].eligible !== false; }),
    actions: { business: business, product: product },
    questions: (m.questions || []).map(function (q) { return q.id; })
  };
}

/* ── brand configuration ───────────────────────────────────────────────── */
function validateBrand(b) {
  var e = [];
  if (!isObj(b)) return { ok: false, errors: ["brand: not an object"] };
  only(b, ["$schema", "brandId", "configVersion", "customerId", "browser", "server", "notes"], "brand", e);
  if (b.$schema !== BRAND_SCHEMA) err(e, "brand.$schema", "must be " + BRAND_SCHEMA);
  if (!ID.test(b.brandId || "")) err(e, "brand.brandId", "lowercase id");
  if (!ID.test(b.customerId || "")) err(e, "brand.customerId", "lowercase id of the licensed customer (the data boundary)");
  if (!VERSION.test(b.configVersion || "")) err(e, "brand.configVersion", "semantic version");
  var w = b.browser;
  if (!isObj(w)) err(e, "brand.browser", "object");
  else {
    only(w, ["display", "terminology", "domains", "presentations", "channels", "policies", "ruleVersion", "flags", "locales"], "brand.browser", e);
    if (!isObj(w.display)) err(e, "brand.browser.display", "public display tokens");
    if (!isObj(w.terminology) || !isObj(w.terminology.customer) || !isObj(w.terminology.business))
      err(e, "brand.browser.terminology", "customer and business labels — the meaning is fixed, the words are the brand's");
    if (!Array.isArray(w.domains) || !w.domains.length || !w.domains.every(function (d) { return DOMAIN.test(d); }))
      err(e, "brand.browser.domains", "approved hostnames");
    if (!Array.isArray(w.presentations) || !w.presentations.every(function (p) { return /^[a-z][a-z0-9_-]+@\d+\.\d+\.\d+$/.test(p); }))
      err(e, "brand.browser.presentations", "manifest ids pinned to a content version (id@1.0.0)");
    if (!Array.isArray(w.channels) || !w.channels.every(function (c) { return CHANNELS.indexOf(c) > -1; }))
      err(e, "brand.browser.channels", "subset of " + CHANNELS.join(", "));
    if (!isObj(w.policies)) err(e, "brand.browser.policies", "policy versions");
    else Object.keys(w.policies).forEach(function (k) { if (!/^\d{4}-\d{2}-\d{2}$|^\d+\.\d+(\.\d+)?$/.test(String(w.policies[k]))) err(e, "brand.browser.policies." + k, "a version or a date"); });
    if (RULE_VERSIONS.indexOf(w.ruleVersion) < 0) err(e, "brand.browser.ruleVersion", "one of " + RULE_VERSIONS.join(", ") + " — rules are chosen, never written here");
    if (!isObj(w.flags) || !Object.keys(w.flags).every(function (k) { return typeof w.flags[k] === "boolean"; }))
      err(e, "brand.browser.flags", "booleans only");
  }
  var s = b.server;
  if (s !== undefined) {
    if (!isObj(s)) err(e, "brand.server", "object");
    else Object.keys(s).forEach(function (k) {
      // Every value in `server` is the NAME of an environment variable or a
      // role, never its value.
      var v = s[k];
      if (typeof v !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(v)) err(e, "brand.server." + k, "an environment variable name (UPPER_SNAKE), never a value");
    });
  }
  scan(b, "brand", e, false);
  return { ok: e.length === 0, errors: e };
}

/* The part a page may load. `server` never leaves the build. */
function browserView(b) {
  if (!validateBrand(b).ok) return null;
  return { schema: BRAND_SCHEMA, brandId: b.brandId, configVersion: b.configVersion, customerId: b.customerId, browser: JSON.parse(JSON.stringify(b.browser)) };
}

module.exports = {
  MANIFEST_SCHEMA: MANIFEST_SCHEMA, BRAND_SCHEMA: BRAND_SCHEMA, RULE_VERSIONS: RULE_VERSIONS,
  CTA_MEANINGS: CTA_MEANINGS, CHANNELS: CHANNELS,
  validateManifest: validateManifest, validateBrand: validateBrand,
  toScenesConfig: toScenesConfig, browserView: browserView
};
