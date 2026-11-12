// GENERATED — do not edit. Vendored from @kmin/prospect-intelligence 1.13.1 (src/outcomes.js) by tools/vendor.mjs. Change the package, then re-vendor.
// @kmin/prospect-intelligence — outcomes
//
// What happened AFTER a read, and what may honestly be said about it. Pure: no
// I/O, no clock of its own (the caller passes `now`), no venture names. The
// venture's server stores the events; this module defines them, labels reads
// against them, and writes the report.
//
// The rules this file exists to enforce:
//   · An outcome is an EVENT. Nothing is overwritten; a correction is a new
//     event that voids an old one, and both are kept.
//   · Who says so matters. "affiliate_reported" is a person's word.
//     "provider_verified" and "import_verified" come only from an authenticated
//     provider event or an approved import — never from the payload's own claim.
//   · A product purchase is not a business enrollment. Three separate targets:
//     conversation, purchase, enrollment.
//   · No recorded outcome means UNKNOWN. It is never counted as a failure.
//   · A read is judged only as it stood BEFORE anyone acted on it. The latest
//     eligible read before the first outreach, intercept or outcome is frozen;
//     anything later would be scoring the answer sheet.
//   · One person is one group. Repeat visits by the same prospect never sit on
//     both sides of a train/test split.
//   · No probability, no "X% likely", and no causal claim, until a held-out
//     sample supports it. The report says "insufficient" in so many words.
"use strict";

var KINDS = ["outreach_attempted", "reply_received", "conversation_scheduled", "conversation_held",
  "product_purchase", "business_enrollment", "follow_up_later", "declined", "no_contact_request"];
var VERIFICATION = ["affiliate_reported", "provider_verified", "import_verified"];
// What an affiliate may record by hand. Purchases and enrollments recorded by
// hand are allowed and are marked affiliate_reported — never verified.
var SOURCES = { affiliate: "affiliate_reported", provider: "provider_verified", "import": "import_verified" };
var TARGETS = { conversation: "conversation_held", purchase: "product_purchase", enrollment: "business_enrollment" };
var CLOSING = ["declined", "no_contact_request"];
// Days after the frozen read in which a target counts for that read.
var WINDOWS = { conversation: 14, purchase: 30, enrollment: 30 };
// The reference's validation gates, kept as MINIMUM governance milestones. Passing
// one is permission to look, not evidence that anything is statistically valid.
var GATES = {
  A: { need: "200 readable visits with a recorded outcome", unlocks: "internal outcome rates per band" },
  B: { need: "100 or more conversations and 100 or more non-conversations", unlocks: "first accuracy and calibration estimates; one weight revision" },
  C: { need: "200 or more outcomes, repeated in a second venture, reviewed by an outside scientist", unlocks: "accuracy may be described to customers" }
};
var MIN_COHORT = 10;             // below this a cell is suppressed, not shown
var DAY = 86400000;
var FUTURE_SLACK = 5 * 60000;    // an event time may be at most 5 minutes ahead of the server
var PAST_LIMIT = 730 * DAY;

function t(v) { var n = typeof v === "number" ? v : Date.parse(v); return isFinite(n) ? n : NaN; }
function iso(n) { return new Date(n).toISOString(); }

/* ── one event ─────────────────────────────────────────────────────────────
   validate(input, ctx) → { ok, event } | { ok:false, errors }
     input  { kind, occurredAt?, followUpOn?, idem? }        what the caller sent
     ctx    { source: "affiliate" | "provider" | "import", sourceId?, actor, now }
   Verification is decided by ctx.source — a field named "verification" in the
   input is an error, not a hint.                                            */
function validate(input, ctx) {
  var e = [], i = input || {}; ctx = ctx || {};
  var now = t(ctx.now); if (!isFinite(now)) e.push("now: required");
  if (KINDS.indexOf(i.kind) < 0) e.push("kind: one of " + KINDS.join(", "));
  if (!SOURCES[ctx.source]) e.push("source: affiliate, provider or import");
  if (i.verification !== undefined || i.verified !== undefined) e.push("verification: decided by the source, never supplied");
  if (!ctx.actor || !/^[a-z0-9][a-z0-9._:@-]{1,79}$/i.test(String(ctx.actor))) e.push("actor: required");
  var at = i.occurredAt == null ? now : t(i.occurredAt), trusted = true;
  if (!isFinite(at)) e.push("occurredAt: a date");
  else if (at > now + FUTURE_SLACK) { at = now; trusted = false; }      // a clock ahead of ours: use ours, and say so
  else if (at < now - PAST_LIMIT) e.push("occurredAt: more than two years ago");
  var follow = null;
  if (i.kind === "follow_up_later") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(i.followUpOn || "")) || !isFinite(t(i.followUpOn))) e.push("followUpOn: a date (YYYY-MM-DD) is required for follow_up_later");
    else follow = i.followUpOn;
  } else if (i.followUpOn != null) e.push("followUpOn: only with follow_up_later");
  if (i.idem != null && !/^[A-Za-z0-9_.:-]{6,80}$/.test(String(i.idem))) e.push("idem: 6-80 characters");
  if (e.length) return { ok: false, errors: e };
  return { ok: true, event: {
    kind: i.kind, occurredAt: iso(at), occurredAtTrusted: trusted, recordedAt: iso(now), followUpOn: follow,
    source: ctx.source + (ctx.sourceId ? ":" + String(ctx.sourceId).slice(0, 40) : ""),
    verification: SOURCES[ctx.source], actor: String(ctx.actor), idem: i.idem ? String(i.idem) : null } };
}

// The events that still stand: voided ones removed, the rest in time order.
function standing(events) {
  return (events || []).filter(function (o) { return !o.voidedAt && !o.voided_at; })
    .map(function (o) { return { kind: o.kind, at: t(o.occurredAt || o.occurred_at), verification: o.verification, source: o.source }; })
    .filter(function (o) { return isFinite(o.at) && KINDS.indexOf(o.kind) >= 0; })
    .sort(function (a, b) { return a.at - b.at; });
}

/* ── the frozen read ───────────────────────────────────────────────────────
   freeze(snapshots, firstActionAt) → the latest ELIGIBLE snapshot received
   strictly before the first action, or null when there is none (the read is
   then not evaluable — it is never replaced by a later one).
   Eligible: has a read, is not excluded (internal traffic, no consent).     */
function eligible(s) { return !!(s && s.read && !s.excludedReason && !s.excluded_reason && !(s.read.temperature && s.read.temperature.band === "excluded") && s.read.band !== "excluded"); }
function freeze(snapshots, firstActionAt) {
  var cut = firstActionAt == null ? Infinity : t(firstActionAt), best = null;
  (snapshots || []).forEach(function (s) {
    var at = t(s.receivedAt || s.received_at);
    if (!isFinite(at) || !eligible(s) || at >= cut) return;
    if (!best || at > best.at) best = { at: at, snapshot: s };
  });
  return best ? { id: best.snapshot.id == null ? null : best.snapshot.id, at: iso(best.at), read: best.snapshot.read,
    presentation: best.snapshot.presentation || null, ruleVersion: best.snapshot.ruleVersion || best.snapshot.rule_version || null } : null;
}
// The first moment anyone acted: outreach, any outcome, or an intercept shown.
function firstAction(events, interceptAt) {
  var s = standing(events), a = s.length ? s[0].at : Infinity, b = interceptAt == null ? Infinity : t(interceptAt);
  var m = Math.min(a, isFinite(b) ? b : Infinity);
  return isFinite(m) ? m : null;
}
// A row offered for evaluation must not know the future. Throws with the reason.
var LEAKY = /outcome|enroll(ed|ment)|purchas|conversation_held|declined|verified|label|target/i;
function assertNoLeakage(row) {
  if (!row || !row.frozen) throw new Error("leakage: no frozen read");
  if (row.firstActionAt != null && !(t(row.frozen.at) < t(row.firstActionAt))) throw new Error("leakage: the read is not earlier than the first action");
  Object.keys(row.features || {}).forEach(function (k) { if (LEAKY.test(k)) throw new Error("leakage: feature \"" + k + "\" describes the outcome"); });
  var r = row.frozen.read || {};
  if (r.outcomes && (r.outcomes.enrollment === "verified" || r.outcomes.purchase === "verified" || r.outcomes.booking === "confirmed")) throw new Error("leakage: the frozen read already contains a confirmed outcome");
  return true;
}

/* ── labels ────────────────────────────────────────────────────────────────
   label(frozenAt, events, target, now, windows) →
     { state: "positive", verification, days }   the target happened inside the window
     { state: "negative", reason }               the window has closed AND the prospect was
                                                 worked (some outcome recorded) or said no
     { state: "censored" }                       the window is still open
     { state: "unknown" }                        the window closed and nothing was recorded
   "unknown" is not "negative". An affiliate who records nothing has told us
   nothing.                                                                  */
function label(frozenAt, events, target, now, windows) {
  var kind = TARGETS[target]; if (!kind) throw new Error("unknown target: " + target);
  var start = t(frozenAt), end = start + ((windows || WINDOWS)[target] || WINDOWS[target]) * DAY, n = t(now), s = standing(events);
  var hit = s.filter(function (o) { return o.kind === kind && o.at >= start && o.at <= end; })[0];
  if (hit) return { state: "positive", verification: hit.verification || "affiliate_reported", days: Math.round((hit.at - start) / DAY * 10) / 10 };
  var inWin = s.filter(function (o) { return o.at >= start && o.at <= end; });
  var closed = inWin.filter(function (o) { return CLOSING.indexOf(o.kind) >= 0; })[0];
  if (closed) return { state: "negative", reason: closed.kind };
  if (n < end) return { state: "censored" };
  return inWin.length ? { state: "negative", reason: "worked_no_" + target } : { state: "unknown" };
}

/* ── the evaluation set ────────────────────────────────────────────────────
   build(prospects, opts) → rows, one per prospect and presentation.
     prospects [{ tenant, group, presentation?, snapshots[], outcomes[], interceptAt?, identity? }]
       group     the prospect key. identity (optional) is a stable hash of a
                 VERIFIED identity; rows sharing one are the same person.
     opts      { now, windows }
   A prospect's visits are grouped: one row, the read frozen before the first
   action. With no action at all, the latest eligible read stands (and every
   label is unknown or censored).                                            */
function requested(read) {
  if (!read) return false;
  if (read.request) return !!read.request.state && read.request.state !== "none";
  return read.band === "request" || read.band === "molten";
}
function bandOf(read) { return (read && ((read.temperature && read.temperature.band) || read.band)) || "none"; }
function build(prospects, opts) {
  opts = opts || {}; var now = t(opts.now), rows = [];
  (prospects || []).forEach(function (p) {
    var first = firstAction(p.outcomes, p.interceptAt);
    var fz = freeze(p.snapshots, first);
    if (!fz) return;                                     // nothing eligible before anyone acted: not evaluable
    var row = { tenant: p.tenant, group: String(p.group), person: p.identity ? "id:" + p.identity : "g:" + p.tenant + ":" + p.group,
      presentation: fz.presentation || p.presentation || "unknown", frozen: fz, firstActionAt: first == null ? null : iso(first),
      visits: (p.snapshots || []).length,
      features: { band: bandOf(fz.read), requested: requested(fz.read), finished: !!(fz.read.observed && fz.read.observed.finished) },
      labels: {} };
    Object.keys(TARGETS).forEach(function (k) { row.labels[k] = label(fz.at, p.outcomes, k, now, opts.windows); });
    assertNoLeakage(row);
    rows.push(row);
  });
  return rows;
}

/* ── the split ─────────────────────────────────────────────────────────────
   Lead/time split: a person belongs to the side their FIRST frozen read falls
   on, and all their rows go with them.                                      */
function split(rows, cutoff) {
  var c = t(cutoff), firstOf = {};
  rows.forEach(function (r) { var a = t(r.frozen.at); if (firstOf[r.person] == null || a < firstOf[r.person]) firstOf[r.person] = a; });
  var out = { train: [], test: [] };
  rows.forEach(function (r) { out[firstOf[r.person] < c ? "train" : "test"].push(r); });
  return out;
}
function assertSplit(s) {
  var seen = {}; s.train.forEach(function (r) { seen[r.person] = 1; });
  s.test.forEach(function (r) { if (seen[r.person]) throw new Error("split: " + r.person + " is on both sides"); });
  return true;
}

/* ── the report ────────────────────────────────────────────────────────────
   report(rows, opts) → per tenant, per presentation. Nothing is pooled across
   tenants unless opts.pooled === true (a permission the caller must hold).
   A cell with fewer than minCohort known cases is suppressed. Rates are
   observed frequencies among KNOWN cases, with the count beside them; they are
   not probabilities for a new prospect and not evidence that a band causes
   anything.                                                                 */
function rate(pos, known, min) { return known >= min ? { n: known, positive: pos, rate: Math.round(pos / known * 1000) / 10 } : { n: known, suppressed: "small_cohort" }; }
function summarise(rows, target, min) {
  var c = { eligible: rows.length, positive: 0, negative: 0, unknown: 0, censored: 0, verifiedPositive: 0 };
  rows.forEach(function (r) { var l = r.labels[target]; c[l.state]++; if (l.state === "positive" && l.verification !== "affiliate_reported") c.verifiedPositive++; });
  c.known = c.positive + c.negative;
  c.coverage = c.eligible ? Math.round(c.known / c.eligible * 1000) / 10 : 0;
  function cut(test) {
    var k = rows.filter(function (r) { var s = r.labels[target].state; return test(r) && (s === "positive" || s === "negative"); });
    return rate(k.filter(function (r) { return r.labels[target].state === "positive"; }).length, k.length, min);
  }
  var bands = {};
  rows.forEach(function (r) { bands[r.features.band] = 1; });
  Object.keys(bands).forEach(function (b) { bands[b] = cut(function (r) { return r.features.band === b; }); });
  return { counts: c, overall: rate(c.positive, c.known, min), byBand: bands,
    baselines: { explicitRequest: { yes: cut(function (r) { return r.features.requested; }), no: cut(function (r) { return !r.features.requested; }) },
                 completed: { yes: cut(function (r) { return r.features.finished; }), no: cut(function (r) { return !r.features.finished; }) } } };
}
function gates(rows) {
  var known = rows.filter(function (r) { return Object.keys(r.labels).some(function (k) { var s = r.labels[k].state; return s === "positive" || s === "negative"; }); }).length;
  var conv = rows.filter(function (r) { return r.labels.conversation.state === "positive"; }).length;
  var non = rows.filter(function (r) { return r.labels.conversation.state === "negative"; }).length;
  return { A: { met: known >= 200, have: known, need: GATES.A.need }, B: { met: conv >= 100 && non >= 100, have: { conversations: conv, nonConversations: non }, need: GATES.B.need },
           C: { met: false, need: GATES.C.need, note: "needs a second venture and an outside review; never met by a count alone" } };
}
function report(rows, opts) {
  opts = opts || {}; var min = Math.max(MIN_COHORT, opts.minCohort || MIN_COHORT), out = { tenants: {}, pooled: null, notes: [] };
  var byT = {};
  rows.forEach(function (r) { (byT[r.tenant] = byT[r.tenant] || []).push(r); });
  Object.keys(byT).forEach(function (tn) {
    var rs = byT[tn], byP = {};
    rs.forEach(function (r) { (byP[r.presentation] = byP[r.presentation] || []).push(r); });
    var g = gates(rs), tt = { eligible: rs.length, gates: g, sufficient: g.A.met, presentations: {} };
    if (!g.A.met) tt.insufficient = "Not enough recorded outcomes to say anything about the bands yet (" + g.A.have + " of 200 readable visits with a recorded outcome).";
    Object.keys(byP).forEach(function (p) {
      tt.presentations[p] = {};
      Object.keys(TARGETS).forEach(function (k) { tt.presentations[p][k] = summarise(byP[p], k, min); });
    });
    out.tenants[tn] = tt;
  });
  if (opts.pooled === true && Object.keys(byT).length > 1) {
    out.pooled = {}; Object.keys(TARGETS).forEach(function (k) { out.pooled[k] = summarise(rows, k, min); });
  }
  out.notes = ["Rates are observed frequencies among prospects with a KNOWN outcome; unknown and still-open cases are counted separately and never as failures.",
    "These are observations, not predictions and not causes: a band did not make anyone enroll.",
    "No probability is published for an individual prospect. That needs a held-out sample showing calibration (gate B at minimum).",
    "Cells with fewer than " + min + " known cases are suppressed."];
  return out;
}

/* ── presentation quality ──────────────────────────────────────────────────
   quality(sessions, opts) — about the PRESENTATION, not about any prospect.
     sessions [{ presentation, read, requestAt?, firstResponseAt?, fulfilled? }]
   Kept apart from follow-up analytics on purpose: a scene people keep getting
   stuck on is a defect to fix, not a fact about a lead.                     */
function median(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function quality(sessions, opts) {
  var min = Math.max(MIN_COHORT, (opts || {}).minCohort || MIN_COHORT), byP = {};
  (sessions || []).forEach(function (s) { if (eligible(s)) (byP[s.presentation || "unknown"] = byP[s.presentation || "unknown"] || []).push(s); });
  var out = {};
  Object.keys(byP).forEach(function (p) {
    var ss = byP[p], n = ss.length;
    if (n < min) { out[p] = { sessions: n, suppressed: "small_cohort" }; return; }
    var fin = 0, req = 0, ful = 0, fr = 0, resp = [];
    ss.forEach(function (s) {
      var o = s.read.observed || {};
      if (o.finished) fin++;
      fr += (+o.struggledTotal || (o.struggled ? o.struggled.length : 0) || 0);
      if (requested(s.read)) { req++; if (s.fulfilled) ful++; if (s.requestAt && s.firstResponseAt) { var d = t(s.firstResponseAt) - t(s.requestAt); if (d >= 0) resp.push(d / 3600000); } }
    });
    var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : null; };
    out[p] = { sessions: n, completionRate: pct(fin, n), explicitRequestRate: pct(req, n),
      requestFulfilment: req >= min ? pct(ful, req) : { suppressed: "small_cohort", n: req },
      medianHoursToResponse: resp.length >= min ? Math.round(median(resp) * 10) / 10 : { suppressed: "small_cohort", n: resp.length },
      frictionPerSession: Math.round(fr / n * 100) / 100 };
  });
  return out;
}

/* ── intercept holdout ─────────────────────────────────────────────────────
   An intercept's effect is only measurable against people who were eligible
   and deliberately NOT shown it. arm() assigns by a stable hash of the session
   and the experiment id, so the same session always lands in the same arm and
   nobody can pick. An experiment must be registered BEFORE its data counts.
   impact() shows exposure and completion in both arms side by side — harm
   next to benefit — and refuses to compare below the cohort minimum.        */
function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
function arm(experiment, session) {
  if (!experiment || !experiment.id || !(experiment.holdoutPct > 0 && experiment.holdoutPct < 100)) return "exposed";
  return (fnv(experiment.id + "|" + session) % 1000) < experiment.holdoutPct * 10 ? "holdout" : "exposed";
}
function impact(experiment, sessions, opts) {
  if (!experiment || !experiment.id || !experiment.registeredAt) return { ok: false, reason: "unregistered" };
  var min = Math.max(MIN_COHORT, (opts || {}).minCohort || MIN_COHORT), reg = t(experiment.registeredAt);
  var A = { exposed: { n: 0, finished: 0, requested: 0 }, holdout: { n: 0, finished: 0, requested: 0 } };
  (sessions || []).forEach(function (s) {
    if (!eligible(s) || !(t(s.receivedAt || s.received_at) >= reg)) return;       // nothing from before registration
    var a = A[arm(experiment, s.session)]; a.n++;
    if (s.read.observed && s.read.observed.finished) a.finished++;
    if (requested(s.read)) a.requested++;
  });
  if (A.exposed.n < min || A.holdout.n < min) return { ok: false, reason: "insufficient", exposure: { exposed: A.exposed.n, holdout: A.holdout.n }, need: min };
  var pct = function (a, b) { return Math.round(a / b * 1000) / 10; };
  return { ok: true, randomized: true, exposure: { exposed: A.exposed.n, holdout: A.holdout.n },
    completion: { exposed: pct(A.exposed.finished, A.exposed.n), holdout: pct(A.holdout.finished, A.holdout.n) },
    explicitRequest: { exposed: pct(A.exposed.requested, A.exposed.n), holdout: pct(A.holdout.requested, A.holdout.n) },
    completionHarm: Math.round((pct(A.holdout.finished, A.holdout.n) - pct(A.exposed.finished, A.exposed.n)) * 10) / 10,
    note: "Differences this size can be chance at these counts; no interval is computed yet. More requests with fewer completions is not a win." };
}

module.exports = { KINDS: KINDS, VERIFICATION: VERIFICATION, TARGETS: TARGETS, WINDOWS: WINDOWS, GATES: GATES, MIN_COHORT: MIN_COHORT, CLOSING: CLOSING,
  validate: validate, standing: standing, eligible: eligible, freeze: freeze, firstAction: firstAction, assertNoLeakage: assertNoLeakage,
  label: label, build: build, split: split, assertSplit: assertSplit, report: report, quality: quality, arm: arm, impact: impact };
