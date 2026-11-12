/* ============================================================================
 *  PROSPECT INTELLIGENCE™  —  portable integrations: events, credentials,
 *  signed webhooks
 *  @kmin/prospect-intelligence  ·  Prompt 12
 *
 *  The contract another system would use to hear about an explicit request,
 *  read an authorized brief, write an outcome or update follow-up state. It is
 *  a contract and its checks, not a connection: nothing here opens a socket,
 *  and nothing is switched on by having this file. A site's server supplies
 *  the storage, the outbox and the HTTP client; this file decides what may be
 *  sent, to where, signed how, retried how often, and when it must not go.
 *
 *    events        versioned names and the fields each may carry. No pointer
 *                  events, no free text a prospect typed, no contact detail
 *                  the receiver was not scoped for.
 *    credentials   per customer, scoped, stored as a hash, with expiry,
 *                  revocation and rotation that keeps the old key briefly.
 *    sign/verify   HMAC-SHA256 over id.timestamp.body, five-minute tolerance,
 *                  and a replay record so a captured delivery is useless.
 *    destination   https only; no addresses, private ranges, odd ports,
 *                  credentials or redirects; the resolved address is checked
 *                  too, so a name that later points inward is refused.
 *    delivery      bounded retries with backoff, then dead-letter where a
 *                  person can see it. A queued request is never a success.
 *    budget        one customer cannot use up the shared worker.
 *    suppress      deletion, revocation and a no-contact request stop what is
 *                  still queued.
 * ========================================================================== */
"use strict";
var crypto = require("crypto");

var API_VERSION = "2026-11-12";
var SCOPES = ["briefs:read", "requests:receive", "outcomes:write", "followup:write"];
var TOLERANCE_MS = 5 * 60 * 1000;
var BACKOFF_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 12 * 3600e3];      // five retries, then dead-letter
var ROTATION_OVERLAP_MS = 24 * 3600e3;
var ID = /^[a-z][a-z0-9_-]{1,47}$/;

function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function hmac(secret, s) { return crypto.createHmac("sha256", String(secret)).update(String(s)).digest("hex"); }
function same(a, b) {
  var x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ── events ───────────────────────────────────────────────────────────────
   Each event names the scope a subscriber needs and the ONLY fields it may
   carry. build() drops everything else, so a field added upstream by mistake
   never leaves.                                                             */
var EVENTS = {
  "pi.request.created.v1": { scope: "requests:receive",
    fields: { prospectRef: "ref", presentation: "id", distributor: "handle", kind: ["contact", "next_step"], channel: ["email", "text", "call", "whatsapp", "calendar", null], occurredAt: "time" } },
  "pi.brief.updated.v1": { scope: "briefs:read",
    fields: { prospectRef: "ref", presentation: "id", distributor: "handle", band: ["molten", "request", "hot", "warm", "cool", "none"], evidence: ["solid", "partial", "thin"], rules: "version", updatedAt: "time" } },
  "pi.outcome.recorded.v1": { scope: "outcomes:write",
    fields: { prospectRef: "ref", distributor: "handle", kind: "id", verification: ["verified", "affiliate_reported", "unknown"], occurredAt: "time" } },
  "pi.followup.updated.v1": { scope: "followup:write",
    fields: { prospectRef: "ref", distributor: "handle", state: ["none", "reached", "replied", "scheduled", "held", "later", "closed", "no_contact"], dueOn: "date" } },
  "pi.test.ping.v1": { scope: null, fields: { note: "id" } }
};
var TYPE = {
  ref: function (v) { return typeof v === "string" && /^pr_[a-f0-9]{16,64}$/.test(v); },     // an opaque reference, never an email
  id: function (v) { return typeof v === "string" && ID.test(v); },
  handle: function (v) { return typeof v === "string" && /^[a-z0-9][a-z0-9_-]{1,39}$/.test(v); },
  version: function (v) { return typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v); },
  time: function (v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) && isFinite(Date.parse(v)); },
  date: function (v) { return v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)); }
};
/* A stable, opaque reference for a prospect inside one customer. The same
   prospect gets a different reference under every customer, so a reference
   cannot be used to join data across them. */
function prospectRef(tenant, prospectKey, pepper) { return "pr_" + hmac(String(pepper || ""), tenant + ":" + prospectKey).slice(0, 32); }

function build(type, tenant, data, meta) {
  var spec = EVENTS[type], e = [];
  if (!spec) return { ok: false, errors: ["unknown event type"] };
  if (!ID.test(String(tenant || ""))) return { ok: false, errors: ["tenant: id"] };
  meta = meta || {};
  var out = {};
  Object.keys(spec.fields).forEach(function (k) {
    var rule = spec.fields[k], v = data ? data[k] : undefined;
    if (v === undefined && (Array.isArray(rule) ? rule.indexOf(null) >= 0 : rule === "date")) v = null;
    var ok = Array.isArray(rule) ? rule.indexOf(v) >= 0 : TYPE[rule](v);
    if (!ok) e.push(type + "." + k + ": invalid"); else out[k] = v;
  });
  if (e.length) return { ok: false, errors: e };
  var occurred = meta.occurredAt || out.occurredAt || out.updatedAt || meta.createdAt;
  if (!TYPE.time(meta.createdAt)) return { ok: false, errors: ["meta.createdAt: time"] };
  // The idempotency key is a pure function of what happened, so a second
  // attempt to record the same thing produces the same event id.
  var idem = sha([type, tenant, meta.source || "", canonical(out), occurred].join("|")).slice(0, 32);
  return { ok: true, event: {
    id: "evt_" + idem, type: type, apiVersion: API_VERSION, tenant: tenant,
    createdAt: meta.createdAt, correlationId: typeof meta.correlationId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(meta.correlationId) ? meta.correlationId : "cor_" + idem.slice(0, 16),
    idempotencyKey: idem, test: meta.test === true, data: out } };
}
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

/* ── credentials ──────────────────────────────────────────────────────────
   The secret is shown once, at issue. What is stored is its hash and a
   reference; configuration holds only the reference.                        */
function issue(tenant, scopes, opts, now) {
  opts = opts || {};
  if (!ID.test(String(tenant || ""))) return { ok: false, reason: "tenant" };
  if (!Array.isArray(scopes) || !scopes.length || !scopes.every(function (s) { return SCOPES.indexOf(s) >= 0; })) return { ok: false, reason: "scopes" };
  var t = typeof now === "number" ? now : Date.now(), days = Math.min(Math.max(+opts.days || 90, 1), 365);
  var secret = "pisk_" + crypto.randomBytes(32).toString("hex"), ref = "cred_" + crypto.randomBytes(8).toString("hex");
  return { ok: true, secret: secret, record: { ref: ref, tenant: tenant, scopes: scopes.slice().sort(), hash: sha(secret), createdAt: new Date(t).toISOString(),
    expiresAt: new Date(t + days * 864e5).toISOString(), revokedAt: null, supersededAt: null, test: opts.test === true } };
}
function rotate(record, now) {
  var t = typeof now === "number" ? now : Date.now(), next = issue(record.tenant, record.scopes, { test: record.test }, t);
  var old = Object.assign({}, record, { supersededAt: new Date(t).toISOString(), expiresAt: new Date(Math.min(Date.parse(record.expiresAt), t + ROTATION_OVERLAP_MS)).toISOString() });
  return { ok: true, secret: next.secret, record: next.record, previous: old };
}
function revoke(record, now) { return Object.assign({}, record, { revokedAt: new Date(typeof now === "number" ? now : Date.now()).toISOString() }); }
/* Does this presented secret authorise this tenant for this scope, now? The
   tenant is taken from the stored record, never from the request. */
function authorize(records, secret, scope, tenant, now) {
  var t = typeof now === "number" ? now : Date.now(), h = sha(String(secret || ""));
  var rec = (records || []).filter(function (r) { return r && same(r.hash, h); })[0];
  if (!rec) return { ok: false, reason: "unknown_credential" };
  if (rec.revokedAt) return { ok: false, reason: "revoked" };
  if (!(Date.parse(rec.expiresAt) > t)) return { ok: false, reason: "expired" };
  if (rec.tenant !== tenant) return { ok: false, reason: "cross_tenant" };
  if (rec.scopes.indexOf(scope) < 0) return { ok: false, reason: "scope" };
  return { ok: true, ref: rec.ref, tenant: rec.tenant, test: !!rec.test };
}

/* ── signing ──────────────────────────────────────────────────────────────*/
function sign(secret, eventId, timestampMs, body) {
  var ts = String(Math.floor(timestampMs / 1000));
  return { "pi-event-id": eventId, "pi-timestamp": ts, "pi-signature": "v1=" + hmac(secret, eventId + "." + ts + "." + body) };
}
/* `seen` is the receiver's replay record: has(id) and add(id, expiresAtMs).
   A signature is accepted once. Rotation: pass every secret still valid. */
function verify(secrets, headers, body, seen, now) {
  var t = typeof now === "number" ? now : Date.now(), h = headers || {};
  var id = String(h["pi-event-id"] || ""), ts = String(h["pi-timestamp"] || ""), sig = String(h["pi-signature"] || "");
  if (!/^evt_[a-f0-9]{32}$/.test(id) || !/^\d{9,11}$/.test(ts) || !/^v1=[a-f0-9]{64}$/.test(sig)) return { ok: false, reason: "malformed" };
  if (Math.abs(t - Number(ts) * 1000) > TOLERANCE_MS) return { ok: false, reason: "stale" };
  var good = [].concat(secrets || []).some(function (s) { return s && same(sig, "v1=" + hmac(s, id + "." + ts + "." + body)); });
  if (!good) return { ok: false, reason: "signature" };
  if (seen && seen.has(id)) return { ok: false, reason: "replay" };
  if (seen) seen.add(id, t + 2 * TOLERANCE_MS);
  return { ok: true, id: id };
}

/* ── where a webhook may go ───────────────────────────────────────────────*/
function privateAddress(ip) {
  var s = String(ip || "").toLowerCase();
  var m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    var a = +m[1], b = +m[2];
    if (m.slice(1).some(function (x) { return +x > 255; })) return true;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (s.indexOf(":") >= 0) {
    if (s === "::" || s === "::1") return true;
    var mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/); if (mapped) return privateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || /^::ffff:/.test(s) || /^64:ff9b:/.test(s) || /^2001:db8:/.test(s);
  }
  return true;                                                                 // not an address we recognise: refuse
}
function destination(url, allowedHosts) {
  var u;
  try { u = new URL(String(url)); } catch (e) { return { ok: false, reason: "not_a_url" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "https_only" };
  if (u.username || u.password) return { ok: false, reason: "credentials_in_url" };
  if (u.port && u.port !== "443") return { ok: false, reason: "port" };
  if (u.hash) return { ok: false, reason: "fragment" };
  var h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (/^\[|^\d+(\.\d+){0,3}$|^0x/i.test(h) || h.indexOf(":") >= 0) return { ok: false, reason: "address_literal" };
  if (!/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(h)) return { ok: false, reason: "hostname" };
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion)$/.test(h) || /(^|\.)metadata\./.test(h)) return { ok: false, reason: "internal_name" };
  if (Array.isArray(allowedHosts) && allowedHosts.length && !allowedHosts.some(function (d) { return h === d || h.slice(-(d.length + 1)) === "." + d; })) return { ok: false, reason: "host_not_registered" };
  return { ok: true, host: h, url: "https://" + h + u.pathname + u.search };
}
/* Called by the sender AFTER it resolves the name and BEFORE it connects, with
   the addresses it will actually use; it must connect to one of those and no
   other, and must not follow a redirect. */
function resolved(addresses) {
  var list = [].concat(addresses || []);
  if (!list.length) return { ok: false, reason: "unresolved" };
  return list.some(privateAddress) ? { ok: false, reason: "private_address" } : { ok: true, pin: list[0] };
}

/* ── delivery ─────────────────────────────────────────────────────────────
   What to do with one attempt's result. Only a 2xx from the receiver is a
   delivery. A redirect is a failure, not a place to follow.                 */
function next(attempt, result, now) {
  var t = typeof now === "number" ? now : Date.now(), s = result && result.status;
  if (s >= 200 && s < 300) return { state: "delivered", at: new Date(t).toISOString() };
  var permanent = s === 400 || s === 401 || s === 403 || s === 404 || s === 410 || s === 422 || (s >= 300 && s < 400);
  if (permanent) return { state: "dead", reason: s >= 300 && s < 400 ? "redirect_refused" : "rejected_" + s };
  if (attempt >= BACKOFF_MS.length) return { state: "dead", reason: "retries_exhausted" };
  return { state: "retry", notBefore: new Date(t + BACKOFF_MS[attempt]).toISOString(), reason: s ? "status_" + s : (result && result.error) || "no_response" };
}
/* Must a queued delivery still go? Checked at send time, not at queue time. */
function suppressed(item, facts) {
  facts = facts || {};
  if (facts.customerStatus && facts.customerStatus !== "active") return "customer_" + facts.customerStatus;
  if (facts.subscriptionRevoked) return "subscription_revoked";
  if (facts.credentialRevoked) return "credential_revoked";
  if (facts.prospectErased) return "prospect_erased";
  if (facts.consentWithdrawn) return "consent_withdrawn";
  if (facts.noContact && item && item.type !== "pi.followup.updated.v1" && item.type !== "pi.outcome.recorded.v1") return "no_contact";
  if (facts.subscriptionTenant && item && item.tenant !== facts.subscriptionTenant) return "cross_tenant";
  return null;
}
/* How many of a batch one worker run may take, per customer, so a customer
   with ten thousand queued deliveries cannot starve the others. */
function fairBatch(queue, perTenant, total) {
  var taken = {}, out = [];
  (queue || []).forEach(function (q) {
    if (out.length >= total) return;
    var n = taken[q.tenant] || 0;
    if (n >= perTenant) return;
    taken[q.tenant] = n + 1; out.push(q);
  });
  return out;
}
/* What a provider told us, as a verification level. Queuing is not success,
   and an unrecognised answer is unknown, not a guess. */
function outcomeFrom(provider) {
  if (!isObj(provider)) return { verification: "unknown", kind: null };
  var kinds = { purchase: "product_purchase", enrollment: "business_enrollment" };
  if (provider.authenticated === true && kinds[provider.event] && provider.status === "completed") return { verification: "verified", kind: kinds[provider.event] };
  if (provider.reportedBy === "affiliate" && typeof provider.kind === "string" && ID.test(provider.kind)) return { verification: "affiliate_reported", kind: provider.kind };
  return { verification: "unknown", kind: null };
}
function subscription(tenant, url, events, allowedHosts) {
  var d = destination(url, allowedHosts);
  if (!d.ok) return { ok: false, reason: d.reason };
  if (!ID.test(String(tenant || ""))) return { ok: false, reason: "tenant" };
  if (!Array.isArray(events) || !events.length || !events.every(function (e) { return !!EVENTS[e]; })) return { ok: false, reason: "events" };
  return { ok: true, subscription: { id: "sub_" + sha(tenant + "|" + d.url).slice(0, 16), tenant: tenant, url: d.url, host: d.host, events: events.slice().sort(), status: "active" } };
}
function wants(sub, event, scopes) {
  if (!sub || !event || sub.status !== "active" || sub.tenant !== event.tenant) return false;      // never across customers
  if (sub.events.indexOf(event.type) < 0) return false;
  var need = EVENTS[event.type].scope;
  return !need || (scopes || []).indexOf(need) >= 0;
}

module.exports = {
  API_VERSION: API_VERSION, SCOPES: SCOPES, EVENTS: Object.keys(EVENTS), TOLERANCE_MS: TOLERANCE_MS, BACKOFF_MS: BACKOFF_MS, ROTATION_OVERLAP_MS: ROTATION_OVERLAP_MS,
  prospectRef: prospectRef, build: build,
  issue: issue, rotate: rotate, revoke: revoke, authorize: authorize,
  sign: sign, verify: verify,
  destination: destination, resolved: resolved, privateAddress: privateAddress,
  next: next, suppressed: suppressed, fairBatch: fairBatch, outcomeFrom: outcomeFrom,
  subscription: subscription, wants: wants
};
