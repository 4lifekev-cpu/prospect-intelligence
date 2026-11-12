// GENERATED — do not edit. Vendored from @kmin/prospect-intelligence 1.13.0 (src/profile-shape.js) by tools/vendor.mjs. Change the package, then re-vendor.
// @kmin/prospect-intelligence — profile-shape
//
// The server-side half of the contract. The engine (engine.js) produces a
// structured read in the prospect's browser; this module lifts the bounded,
// storable part of that read into a flat row a venture's persistence function
// can hand to its database. Pure: no I/O, no environment, no venture names.
//
// Why it lives in the package and not in the venture: the row's columns ARE
// the schema of the read. If the engine grows a score, the row grows a column,
// and both must change in one place — here — or the two ventures that share
// the engine drift apart one field at a time.
//
// Everything with markup in it is dropped, not sanitised. The engine used to
// also build an email body; nothing of that shape survives into a row.
"use strict";

var SCHEMA_ID = "h2-intel-v2";
var READ_SCHEMA_ID = "pi-read-v3";
// Every read schema a row may carry. v4 is rules 3.0.0 (behind a flag).
var READ_SCHEMA_IDS = ["pi-read-v3", "pi-read-v4"];

function num(v) { var n = Number(v); return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }
function str(v, max) { return v == null ? "" : String(v).slice(0, max); }

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var PHONE_RE = /^[0-9+()\-.\s]{7,32}$/;

// ── the evidence read (rules 2.0.0, schema pi-read-v3) ──────────────────────
// The engine's second read rides inside the first as `intelligence.read`, and
// is stored inside the row's `profile` JSON as `profile.read` — no new column,
// so no migration, and the model's own columns are untouched while the two
// run side by side.
//
// It arrives from a browser, so nothing in it is trusted to be what the engine
// wrote. It is not validated field by field (the rules will grow fields); it is
// REDUCED to what the shape can possibly need: finite numbers, booleans, null,
// and short strings from the alphabet codes and names are written in. Anything
// else — markup, long text, deep nesting, a thousand keys — is dropped, not
// cleaned.
var CODE_RE = /^[A-Za-z0-9_ .\-]{0,40}$/;
/* ── THE LIMITS, AND WHAT HAPPENS AT THEM (2.0 contract audit, 1.9.0) ────────
   12 items a list, 16 keys an object, five levels. Every read the rules can
   produce at 2.1.0 and 3.0.0 fits inside them (test/profile-shape.test.js
   runs the golden sets through and requires nothing to be cut). A browser can
   still send something larger, so the cut is now VISIBLE instead of silent:
   the stored read carries `truncated: { lists, keys, depth, values }` with how
   many of each were dropped, and a list that was cut is followed by a sibling
   `<name>Total` with its true length when the rules did not already provide
   one. The fields a read cannot do without — schema, rules, band / request /
   temperature, evidence, dims — are copied first, so sixteen junk keys can
   never push them out.                                                    */
var LIMITS = { list: 12, keys: 16, depth: 5 };
var KEEP_FIRST = ["schema", "rules", "band", "request", "temperature", "coverage", "evidence", "dims"];
function reduce(v, depth, t) {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return isFinite(v) ? Math.max(-1e6, Math.min(1e6, Math.round(v * 100) / 100)) : undefined;
  if (typeof v === "string") { if (CODE_RE.test(v)) return v; t.values++; return undefined; }
  if (typeof v !== "object") return undefined;
  if (depth >= LIMITS.depth) { t.depth++; return undefined; }
  if (Array.isArray(v)) {
    if (v.length > LIMITS.list) t.lists++;
    return v.slice(0, LIMITS.list).map(function (x) { return reduce(x, depth + 1, t); }).filter(function (x) { return x !== undefined; });
  }
  var out = {}, keys = Object.keys(v).filter(function (k) { return /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k); });
  if (depth === 0) keys = KEEP_FIRST.filter(function (k) { return keys.indexOf(k) >= 0; }).concat(keys.filter(function (k) { return KEEP_FIRST.indexOf(k) < 0; }));
  if (keys.length > LIMITS.keys) t.keys += keys.length - LIMITS.keys;
  keys.slice(0, LIMITS.keys).forEach(function (k) {
    var r = reduce(v[k], depth + 1, t);
    if (r !== undefined) out[k] = r;
    if (Array.isArray(v[k]) && v[k].length > LIMITS.list && v[k + "Total"] === undefined && Object.keys(out).length < LIMITS.keys) out[k + "Total"] = Math.min(v[k].length, 1e6);
  });
  return out;
}
function toRead(read) {
  if (!read || typeof read !== "object" || READ_SCHEMA_IDS.indexOf(read.schema) < 0) return null;
  var t = { lists: 0, keys: 0, depth: 0, values: 0 };
  var out = reduce(read, 0, t);
  delete out.truncated;                       // never trusted from the browser
  if (t.lists || t.keys || t.depth || t.values) out.truncated = t;
  return out;
}

// toProfileRow(intelligence, ctx)
//   intelligence  the engine's read — PI.profile() / the `intelligence` field of
//                 the persist payload
//   ctx.tenant    the venture key the row belongs to (required; the caller's)
//   ctx.handle    the affiliate handle, RESOLVED SERVER-SIDE by the caller —
//                 never trusted from the payload
//   ctx.prospect  the anonymous per-browser prospect key
//   ctx.event     the persist reason ("visit", "scene", "cta_click", ...)
//   ctx.newVisit  whether this persist claims a new visit
//   ctx.signals   the raw signal snapshot (stored as-is, bounded by the caller)
function toProfileRow(intelligence, ctx) {
  var i = intelligence || {};
  ctx = ctx || {};
  var sc = i.scores || {}, temp = i.temperature || {}, conv = i.conversion || {};
  var arch = i.archetype || {}, st = i.stage || {}, pr = i.prospect || {};
  var profile = {
    dna: i.dna || null,
    fogg: i.fogg || null,
    // The engine emits framing.frame; the row has always stored it as .style.
    framing: i.framing ? { style: str(i.framing.style || i.framing.frame, 40), line: str(i.framing.line, 200) } : null,
    lever: i.lever ? { principle: str(i.lever.principle, 40), move: str(i.lever.move, 200) } : null,
    nextBestAction: i.nextBestAction ? { timing: str(i.nextBestAction.timing, 40), headline: str(i.nextBestAction.headline, 200), detail: str(i.nextBestAction.detail, 400) } : null,
    archetypeRead: str(arch.read, 200),
    stagePush: str(st.push, 200),
    headline: str(i.headline, 240),
    meta: i.meta || null,
    read: toRead(i.read),
    lastEvent: ctx.event,
    schema: str(i.schema, 20) || SCHEMA_ID
  };
  var name = str(pr.name, 80);
  return {
    tenant: str(ctx.tenant, 40),
    prospect_key: ctx.prospect,
    handle: ctx.handle,
    new_visit: !!ctx.newVisit,
    name: name === "(anonymous)" ? "" : name,
    email: EMAIL_RE.test(String(pr.email || "")) ? str(pr.email, 160) : "",
    phone: PHONE_RE.test(String(pr.phone || "")) ? str(pr.phone, 32) : "",
    signals: ctx.signals || {},
    profile: profile,
    archetype: str(arch.name, 60),
    stage: str(st.label, 40),
    temperature: str(temp.band, 20),
    heat: num(temp.heat),
    probability: num(conv.probability),
    confidence: num(conv.confidence),
    score_customer: num(sc.customer),
    score_builder: num(sc.builder),
    score_leadership: num(sc.leadership),
    score_intent: num(sc.intent),
    score_urgency: num(sc.urgency),
    score_trust: num(sc.trust)
  };
}

// ── what a row is allowed to SHOW (12 September 2026) ───────────────────────
// The same decision engine.js makes for a live read, made here for a stored
// one. Two implementations of four lines of arithmetic is a real cost, and
// test/present.test.js pins them to each other across a grid so they cannot
// drift; the alternative — making a back-office page load the whole engine,
// with its collector, its storage keys and its pagehide listener — is a much
// worse trade for a room that only wants to draw six bars.
//
// See engine.js for WHY: every score is a sigmoid with a negative intercept,
// so the model's floor is 31-35, and the two taps an experience asks for
// before it shows anything are worth another +1.1. Shrink toward the anchor by
// the confidence the model already computed, and below the gate publish
// nothing but the evidence.
var PRESENT = { gate: 25, anchor: 15 };

function present(scores, confidence) {
  var conf = num(confidence);
  var out = { ready: conf >= PRESENT.gate, confidence: conf, gate: PRESENT.gate, anchor: PRESENT.anchor, scores: {} };
  Object.keys(scores || {}).forEach(function (k) {
    out.scores[k] = num(PRESENT.anchor + (num(scores[k]) - PRESENT.anchor) * (conf / 100));
  });
  return out;
}

// The columns a row always has, in a fixed order. A venture's migration and
// its tests can assert against this instead of re-typing the list.
var ROW_COLUMNS = ["tenant", "prospect_key", "handle", "new_visit", "name", "email", "phone", "signals", "profile",
  "archetype", "stage", "temperature", "heat", "probability", "confidence",
  "score_customer", "score_builder", "score_leadership", "score_intent", "score_urgency", "score_trust"];

// The bands the engine emits, hottest first. "On Fire" was the top band's name
// before it became "Molten"; rows written under the old name still read.
var BANDS = ["Molten", "Hot", "Warm", "Cool"];
var LEGACY_BANDS = { "On Fire": "Molten" };

module.exports = { toProfileRow: toProfileRow, present: present, PRESENT: PRESENT, ROW_COLUMNS: ROW_COLUMNS, BANDS: BANDS, LEGACY_BANDS: LEGACY_BANDS, SCHEMA_ID: SCHEMA_ID,
  toRead: toRead, LIMITS: LIMITS, READ_SCHEMA_ID: READ_SCHEMA_ID, READ_SCHEMA_IDS: READ_SCHEMA_IDS, READ_BANDS: ["molten", "request", "hot", "warm", "cool", "none", "excluded"] };
