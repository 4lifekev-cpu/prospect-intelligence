// GENERATED — do not edit. Vendored from @kmin/prospect-intelligence 1.13.0 (src/tenancy.js) by tools/vendor.mjs. Change the package, then re-vendor.
/* ============================================================================
 *  PROSPECT INTELLIGENCE™  —  tenancy: who a customer is, what a brand may look
 *  like, who may do what, and which configuration is live
 *  @kmin/prospect-intelligence  ·  Prompt 11 (white labelling)
 *
 *  Everything a licensed customer brings is DATA, checked here before it can
 *  reach a page, an email or a log:
 *
 *    pi-brand-config@1        (src/config.js) ids, terminology, domains, rules
 *    pi-brand-appearance@1    logo, colours, email look, links, approved
 *                             resources and disclosures, how a distributor is
 *                             identified on a link
 *
 *  and four small mechanisms that never differ between customers:
 *
 *    validateAppearance   a logo or a colour cannot carry code
 *    can                  one capability map for five roles
 *    gate                 a suspended or revoked customer is refused by the
 *                         SERVER, whatever a page shows
 *    publish / rollback   configuration is versioned; each brand's history is
 *                         its own and disabling one touches no other
 *
 *  Pure and dependency-free except for a hash. Nothing here reads a database,
 *  a clock it was not given, or the network. A site's server calls these with
 *  its own storage; the engine in the browser never loads this file.
 * ========================================================================== */
"use strict";
/* The configuration contracts live in config.js. A consumer vendors that file
   under its own name, so every function that needs it takes it as an argument;
   inside this repository the sibling file is the default. */
function cfg(c) { return c || require("./config.js"); }

var APPEARANCE_SCHEMA = "pi-brand-appearance@1";
var ID = /^[a-z][a-z0-9_-]{1,47}$/;
var HEX = /^#[0-9a-fA-F]{6}$/;
var HOST = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
var RASTER = /\.(png|jpe?g|webp)$/i;          // never SVG: an SVG is a document and can carry script
var TEXT_BAD = /[<>{}`\\]|javascript:|data:|vbscript:|on[a-z]+\s*=|&#|\u0000/i;
var RESOURCE_KINDS = ["product_info", "business_info", "pricing", "disclosure", "support"];

function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
function only(o, keys, where, e) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) e.push(where + ": unknown key \"" + k + "\""); }); }
function text(v, max, where, e) {
  if (typeof v !== "string" || !v.trim() || v.length > max) return e.push(where + ": 1–" + max + " characters of plain text");
  if (TEXT_BAD.test(v)) e.push(where + ": plain text only — no markup, script, entity or template syntax");
}

/* A URL a brand supplies is only ever https, never carries credentials or a
   port, and its host is one the brand has declared (its own domains or its
   asset origins). Returns the parsed host or null. */
function safeUrl(u, hosts, where, e, opts) {
  opts = opts || {};
  var url;
  try { url = new URL(String(u)); } catch (x) { e.push(where + ": not a URL"); return null; }
  if (url.protocol !== "https:") { e.push(where + ": https only"); return null; }
  if (url.username || url.password) { e.push(where + ": no credentials in a URL"); return null; }
  if (url.port) { e.push(where + ": no explicit port"); return null; }
  var h = url.hostname.toLowerCase();
  if (!HOST.test(h) || /^\d+(\.\d+){3}$/.test(h)) { e.push(where + ": a hostname, not an address"); return null; }
  var ok = (hosts || []).some(function (d) { return h === d || h.slice(-(d.length + 1)) === "." + d; });
  if (!ok) { e.push(where + ": host \"" + h + "\" is not one of this brand's approved domains or asset origins"); return null; }
  if (opts.raster && !RASTER.test(url.pathname)) { e.push(where + ": a PNG, JPEG or WebP image (an SVG can carry script)"); return null; }
  if (/[<>"'`\s]/.test(url.pathname + url.search)) { e.push(where + ": unsafe characters"); return null; }
  return h;
}
function contactLink(u, hosts, where, e) {
  var s = String(u || "");
  if (/^mailto:[^\s<>"'?&]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return;
  if (/^tel:\+?[0-9][0-9 ().-]{5,20}$/.test(s)) return;
  if (/^https:/i.test(s)) { safeUrl(s, hosts, where, e); return; }
  e.push(where + ": https, mailto: or tel: only");
}

function luminance(hex) {
  var n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(x, y) { var a = luminance(x), b = luminance(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function validateAppearance(a, brand) {
  var e = [];
  if (!isObj(a)) return { ok: false, errors: ["appearance: not an object"] };
  only(a, ["$schema", "brandId", "assetOrigins", "logo", "colors", "email", "links", "resources", "disclosures", "distributor", "notes"], "appearance", e);
  if (a.$schema !== APPEARANCE_SCHEMA) e.push("appearance.$schema: must be " + APPEARANCE_SCHEMA);
  if (!ID.test(a.brandId || "")) e.push("appearance.brandId: lowercase id");
  if (brand && brand.brandId !== a.brandId) e.push("appearance.brandId: does not match the brand configuration it was published with");
  var origins = Array.isArray(a.assetOrigins) ? a.assetOrigins : [];
  if (!origins.every(function (d) { return typeof d === "string" && HOST.test(d); })) e.push("appearance.assetOrigins: hostnames");
  var hosts = origins.concat((brand && brand.browser && brand.browser.domains) || []);
  if (!isObj(a.logo)) e.push("appearance.logo: { url, alt }");
  else { only(a.logo, ["url", "alt", "width", "height"], "appearance.logo", e); safeUrl(a.logo.url, hosts, "appearance.logo.url", e, { raster: true }); text(a.logo.alt, 80, "appearance.logo.alt", e); }
  if (!isObj(a.colors)) e.push("appearance.colors: object of hex colours");
  else {
    only(a.colors, ["brand", "accent", "ink", "paper"], "appearance.colors", e);
    ["brand", "accent"].forEach(function (k) { if (!HEX.test(a.colors[k] || "")) e.push("appearance.colors." + k + ": #RRGGBB"); });
    ["ink", "paper"].forEach(function (k) { if (a.colors[k] !== undefined && !HEX.test(a.colors[k])) e.push("appearance.colors." + k + ": #RRGGBB"); });
    // The brand colour carries text and buttons, so it must be readable: 4.5:1
    // against the page and under white button text (WCAG 2.1 AA). The accent is
    // decoration only and is never used for text.
    if (HEX.test(a.colors.brand || "")) {
      var paper = HEX.test(a.colors.paper || "") ? a.colors.paper : "#ffffff", ink = HEX.test(a.colors.ink || "") ? a.colors.ink : "#1b1b1b";
      if (contrast(a.colors.brand, paper) < 4.5) e.push("appearance.colors.brand: too faint on the page colour to read (needs 4.5:1)");
      if (contrast(a.colors.brand, "#ffffff") < 4.5) e.push("appearance.colors.brand: white button text on it is too faint to read (needs 4.5:1)");
      if (contrast(ink, paper) < 4.5) e.push("appearance.colors.ink: too faint on the page colour to read (needs 4.5:1)");
    }
  }
  if (!isObj(a.email)) e.push("appearance.email: { fromName, footer }");
  else {
    only(a.email, ["fromName", "footer", "fromEnv", "replyToEnv", "senderVerified"], "appearance.email", e);
    text(a.email.fromName, 60, "appearance.email.fromName", e); text(a.email.footer, 240, "appearance.email.footer", e);
    ["fromEnv", "replyToEnv"].forEach(function (k) { if (a.email[k] !== undefined && !/^[A-Z][A-Z0-9_]{2,63}$/.test(a.email[k])) e.push("appearance.email." + k + ": an environment variable name, never an address"); });
    if (a.email.senderVerified !== undefined && typeof a.email.senderVerified !== "boolean") e.push("appearance.email.senderVerified: boolean");
  }
  if (!isObj(a.links)) e.push("appearance.links: { privacy, terms, support }");
  else {
    only(a.links, ["privacy", "terms", "support"], "appearance.links", e);
    ["privacy", "terms"].forEach(function (k) { safeUrl(a.links[k], hosts, "appearance.links." + k, e); });
    contactLink(a.links.support, hosts, "appearance.links.support", e);
  }
  var seen = {};
  (Array.isArray(a.resources) ? a.resources : []).forEach(function (r, i) {
    var w = "appearance.resources[" + i + "]";
    if (!isObj(r)) return e.push(w + ": object");
    only(r, ["id", "kind", "title", "url", "locale"], w, e);
    if (!ID.test(r.id || "") || seen[r.id]) e.push(w + ".id: unique lowercase id");
    seen[r.id] = true;
    if (RESOURCE_KINDS.indexOf(r.kind) < 0) e.push(w + ".kind: one of " + RESOURCE_KINDS.join(" | "));
    text(r.title, 100, w + ".title", e); safeUrl(r.url, hosts, w + ".url", e);
  });
  (Array.isArray(a.disclosures) ? a.disclosures : []).forEach(function (d, i) {
    var w = "appearance.disclosures[" + i + "]";
    if (!isObj(d) || !ID.test(d.id || "")) return e.push(w + ": { id, text }");
    only(d, ["id", "text"], w, e); text(d.text, 600, w + ".text", e);
  });
  if (!isObj(a.distributor)) e.push("appearance.distributor: { param, pattern }");
  else {
    only(a.distributor, ["param", "pattern"], "appearance.distributor", e);
    if (!/^[a-z]{1,8}$/.test(a.distributor.param || "")) e.push("appearance.distributor.param: the link parameter that names the distributor (a–z, at most 8)");
    if (["handle", "numeric"].indexOf(a.distributor.pattern) < 0) e.push("appearance.distributor.pattern: handle | numeric — a named pattern, never a regular expression");
  }
  return { ok: e.length === 0, errors: e };
}
var HANDLE = { handle: /^[a-z0-9][a-z0-9_-]{1,39}$/, numeric: /^[0-9]{3,12}$/ };
function distributorId(appearance, value) {
  var re = HANDLE[appearance && appearance.distributor && appearance.distributor.pattern];
  var v = String(value == null ? "" : value).toLowerCase();
  return re && re.test(v) ? v : "";
}

/* ── who may do what ─────────────────────────────────────────────────────
   One map for every customer. `tenant` is the licensed customer (the data
   boundary). A capability outside the map is refused; so is anything across
   tenants, whatever the role. Being on someone's team or upline grants
   nothing: an affiliate reads their OWN prospects and no one else's.        */
var ROLES = ["owner", "admin", "presentation_editor", "affiliate", "analyst", "support"];
var CAPS = {
  "config.read": ["owner", "admin", "presentation_editor", "support"],
  "config.publish": ["owner", "admin"],
  "config.rollback": ["owner", "admin"],
  "presentation.edit": ["owner", "admin", "presentation_editor"],
  "presentation.preview": ["owner", "admin", "presentation_editor", "support"],
  "deployment.health": ["owner", "admin", "support"],
  "deployment.disable": ["owner", "admin"],
  "prospect.read": ["owner", "affiliate", "support"],
  "prospect.export": ["owner", "affiliate"],
  "outcome.write": ["owner", "affiliate"],
  "aggregate.read": ["owner", "admin", "analyst"],
  "integration.manage": ["owner", "admin"]
};
var SUPPORT_MAX_MS = 24 * 60 * 60 * 1000;
var SUPPORT_CAPS = ["config.read", "presentation.preview", "deployment.health", "prospect.read"];

function can(actor, capability, resource, now) {
  function no(reason) { return { allowed: false, reason: reason, audit: actor && actor.role === "support" }; }
  if (!actor || ROLES.indexOf(actor.role) < 0 || !actor.tenant) return no("unknown_actor");
  var roles = CAPS[capability];
  if (!roles) return no("unknown_capability");
  if (!resource || !resource.tenant || resource.tenant !== actor.tenant) return no("cross_tenant");
  if (roles.indexOf(actor.role) < 0) return no("role");
  var t = typeof now === "number" ? now : Date.now();
  if (actor.role === "support") {
    // Product support works under a grant: who approved it, why, for which
    // capabilities, until when. Never open-ended, and every use is audited.
    var g = actor.grant;
    if (!isObj(g) || !g.ticket || !g.approvedBy || !g.reason) return no("support_grant_required");
    var from = new Date(g.from).getTime(), until = new Date(g.until).getTime();
    if (!isFinite(from) || !isFinite(until) || until <= from || until - from > SUPPORT_MAX_MS) return no("support_grant_invalid");
    if (t < from || t >= until) return no("support_grant_expired");
    if (!Array.isArray(g.capabilities) || g.capabilities.indexOf(capability) < 0 || SUPPORT_CAPS.indexOf(capability) < 0) return no("support_scope");
    if (capability === "prospect.read" && (!resource.prospect || g.prospect !== resource.prospect)) return no("support_scope");   // one named record, never a list
    return { allowed: true, reason: "support_grant", audit: true };
  }
  if (actor.role === "affiliate" && /^(prospect|outcome)\./.test(capability)) {
    if (!actor.handle || !resource.owner || resource.owner !== actor.handle) return no("not_owner");   // team or upline membership is not ownership
  }
  return { allowed: true, reason: "role", audit: false };
}

/* ── is this customer allowed to use the service at all ───────────────────
   Checked on the server for every gated API. A page that hides a button is
   not a control; this is. */
function gate(customer) {
  if (!isObj(customer) || !customer.id) return { allowed: false, reason: "unknown_customer" };
  if (customer.status === "active") return { allowed: true, reason: "active" };
  return { allowed: false, reason: customer.status === "suspended" ? "suspended" : customer.status === "revoked" ? "revoked" : "unknown_status" };
}

/* ── versioned configuration ──────────────────────────────────────────────
   A registry is plain data: { deployments: { <brandId>: { customerId, status,
   active, history: [ { version, at, by, brand, appearance, manifests } ] } } }.
   Every function returns a NEW registry; nothing is changed in place, so a
   failed publish leaves what was live exactly as it was.                    */
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function versionOf(doc) { return require("crypto").createHash("sha256").update(canonical(doc)).digest("hex").slice(0, 16); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function empty() { return { schema: "pi-registry@1", deployments: {} }; }

function validateBundle(bundle, config) {
  var e = [], Config = cfg(config);
  if (!isObj(bundle)) return { ok: false, errors: ["bundle: { brand, appearance, manifests }"] };
  var b = Config.validateBrand(bundle.brand); e = e.concat(b.errors);
  var a = validateAppearance(bundle.appearance, bundle.brand); e = e.concat(a.errors);
  var have = {};
  (Array.isArray(bundle.manifests) ? bundle.manifests : []).forEach(function (m) {
    var r = Config.validateManifest(m); e = e.concat(r.errors);
    if (r.ok) have[m.presentationId + "@" + m.contentVersion] = true;
  });
  if (b.ok) bundle.brand.browser.presentations.forEach(function (p) { if (!have[p]) e.push("bundle: the brand lists presentation " + p + " but no such manifest was supplied"); });
  return { ok: e.length === 0, errors: e };
}

function publish(registry, bundle, actor, now, config) {
  var v = validateBundle(bundle, config);
  if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors, registry: registry };
  var id = bundle.brand.brandId, customer = bundle.brand.customerId;
  var ok = can(actor, "config.publish", { tenant: customer }, now);
  if (!ok.allowed) return { ok: false, reason: ok.reason, errors: [], registry: registry };
  var reg = clone(registry || empty()), d = reg.deployments[id];
  if (d && d.customerId !== customer) return { ok: false, reason: "brand_belongs_to_another_customer", errors: [], registry: registry };
  if (!d) d = reg.deployments[id] = { customerId: customer, status: "enabled", active: null, history: [] };
  var doc = { brand: bundle.brand, appearance: bundle.appearance, manifests: bundle.manifests || [] }, version = versionOf(doc);
  if (d.active === version) return { ok: true, version: version, unchanged: true, registry: reg };
  var known = d.history.some(function (h) { return h.version === version; });
  if (!known) d.history.push(Object.assign({ version: version, at: new Date(typeof now === "number" ? now : Date.now()).toISOString(), by: actor.handle || actor.role }, clone(doc)));
  d.previous = d.active; d.active = version;
  return { ok: true, version: version, unchanged: false, registry: reg };
}
function rollback(registry, brandId, actor, toVersion, now) {
  var d = registry && registry.deployments && registry.deployments[brandId];
  if (!d) return { ok: false, reason: "unknown_brand", registry: registry };
  var ok = can(actor, "config.rollback", { tenant: d.customerId }, now);
  if (!ok.allowed) return { ok: false, reason: ok.reason, registry: registry };
  var target = toVersion || d.previous;
  if (!target || !d.history.some(function (h) { return h.version === target; })) return { ok: false, reason: "no_such_version", registry: registry };
  var reg = clone(registry), x = reg.deployments[brandId];
  x.previous = x.active; x.active = target;
  return { ok: true, version: target, registry: reg };
}
function setStatus(registry, brandId, actor, status, now) {
  var d = registry && registry.deployments && registry.deployments[brandId];
  if (!d) return { ok: false, reason: "unknown_brand", registry: registry };
  if (["enabled", "disabled"].indexOf(status) < 0) return { ok: false, reason: "invalid_status", registry: registry };
  var ok = can(actor, "deployment.disable", { tenant: d.customerId }, now);
  if (!ok.allowed) return { ok: false, reason: ok.reason, registry: registry };
  var reg = clone(registry); reg.deployments[brandId].status = status;
  return { ok: true, registry: reg };
}
/* What is live for a brand right now, or null when it is disabled or unknown.
   The asker must belong to the brand's customer: configuration is not public
   between customers either. */
function active(registry, brandId, actor, now) {
  var d = registry && registry.deployments && registry.deployments[brandId];
  if (!d || !d.active) return null;
  if (actor && !can(actor, "config.read", { tenant: d.customerId }, now).allowed) return null;
  if (d.status !== "enabled") return null;
  var h = d.history.filter(function (x) { return x.version === d.active; })[0];
  return h ? clone(h) : null;
}

/* ── embedding ────────────────────────────────────────────────────────────
   A presentation in an iframe can report scenes only if its author co-operates
   and the message comes from an origin the brand approved. Anything else —
   a slide file, a PDF, a video site, another origin's page — is not
   instrumented, and coverage is reported as limited rather than guessed.    */
var PLAYER_SUPPORT = { web: "full", iframe_cooperative: "full", iframe_opaque: "limited", video_embed: "limited", pdf: "none", slides_file: "none" };
function coverage(player) { return PLAYER_SUPPORT[player] || "none"; }
function acceptMessage(event, approvedOrigins) {
  if (!event || typeof event.origin !== "string" || !isObj(event.data)) return null;
  var ok = (approvedOrigins || []).some(function (o) { return event.origin === "https://" + o; });
  if (!ok) return null;
  var d = event.data;
  if (d.source !== "pi-embed" || d.v !== 1 || ["scene", "finished", "cta"].indexOf(d.type) < 0) return null;
  if (d.type === "scene" && !(Number.isInteger(d.index) && d.index >= 0 && d.index < 500 && Number.isInteger(d.total) && d.total > 0 && d.total <= 500)) return null;
  if (d.type === "cta" && !ID.test(String(d.action || ""))) return null;
  return d.type === "scene" ? { type: "scene", index: d.index, total: d.total } : d.type === "cta" ? { type: "cta", action: d.action } : { type: "finished" };
}

module.exports = {
  APPEARANCE_SCHEMA: APPEARANCE_SCHEMA, ROLES: ROLES, CAPABILITIES: Object.keys(CAPS), RESOURCE_KINDS: RESOURCE_KINDS, SUPPORT_MAX_MS: SUPPORT_MAX_MS,
  validateAppearance: validateAppearance, validateBundle: validateBundle, distributorId: distributorId,
  can: can, gate: gate,
  empty: empty, versionOf: versionOf, publish: publish, rollback: rollback, setStatus: setStatus, active: active,
  coverage: coverage, acceptMessage: acceptMessage
};
