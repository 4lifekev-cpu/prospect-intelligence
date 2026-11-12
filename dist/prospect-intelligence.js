/* GENERATED — do not edit. Built by @kmin/prospect-intelligence 1.12.0 (src/evaluate.js + src/engine.js sha256:cc53d6aaca2e).
 * The source of truth is src/{evaluate,engine}.js in the Prospect Intelligence
 * repository. Consumers vendor this file with tools/vendor.mjs and check it in;
 * their build fails when it drifts from the package. Edit the source, rebuild,
 * re-sync. */
/* ============================================================================
 *  PROSPECT INTELLIGENCE™  —  the evaluator
 *  @kmin/prospect-intelligence  ·  see package.json for the version
 *
 *  Pure. Signals in, reads out. No DOM, no storage, no network, no clock it
 *  does not get from the signals, no venture, no secret, no model service.
 *  The same file runs in the browser (bundled ahead of src/engine.js into
 *  dist/prospect-intelligence.js, where it is window.PIEvaluate) and on a
 *  server (require("…/src/evaluate.js")). test/boundary.test.js holds it to
 *  that; test/evaluate.test.js proves both give the same read.
 *
 *  Configuration is data, never code: a path vocabulary (which motivation and
 *  which lean each path means). Rule versions are chosen per call with
 *  opts.rules; the rule tables themselves are not configurable, so a tenant
 *  cannot ship its own scoring formula.
 *
 *      var EV = require("./evaluate.js").createEvaluator({ paths: {...} });
 *      EV.analyze(sig)          // v2 model, frozen
 *      EV.readAt(sig, opts)     // evidence read; opts.rules "2.1.0" | "3.0.0"
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PIEvaluate = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function createEvaluator(cfg) {
    cfg = cfg || {};
    /* ====================  THE MODEL (v2 — frozen, unvalidated)  ==================== */
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function clamp01(n) { return clamp(n, 0, 1); }
    function r100(n) { return Math.round(clamp(n, 0, 100)); }
    function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
    function logit(p) { p = clamp(p, 0.0001, 0.9999); return Math.log(p / (1 - p)); }

    /* The PATHS map is the only per-venture piece of the model — the science
       below never changes. A venture supplies its own vocabulary through
       window.TENANT.piPaths (generated from its tenant record); this table is
       the fallback when no record is loaded.                                  */
    var DEFAULT_PATHS = {
      wealth:{motivation:"Financial growth",lean:"builder"}, income:{motivation:"Financial growth",lean:"builder"},
      freedom:{motivation:"Time & freedom",lean:"builder"}, legacy:{motivation:"Time & freedom",lean:"builder"},
      protect:{motivation:"Protection & security",lean:"customer"}, safety:{motivation:"Protection & security",lean:"customer"},
      certainty:{motivation:"Proof & certainty",lean:"customer"}, proof:{motivation:"Proof & certainty",lean:"customer"},
      security:{motivation:"Proof & certainty",lean:"customer"}
    };
    var PATHS = (cfg.paths && typeof cfg.paths === "object") ? cfg.paths : DEFAULT_PATHS;

    function features(s) {
      s = s || {};
      var maxDepth = +s.maxDepth || 0, totalDepth = Math.max(+s.totalDepth || 0, maxDepth, 1);
      var ix = +s.interactions || 0;
      var q = Array.isArray(s.questions) ? s.questions.length : (+s.questions || 0);
      var reacts = Array.isArray(s.reactions) ? s.reactions : [];
      var loves = reacts.filter(function (r) { return r === "love" || r === "yes"; }).length || (typeof s.reactions === "number" ? +s.reactions : 0);
      var named = !!(s.name && String(s.name).trim()), booked = !!s.booked, dropped = !!s.droppedEarly;
      var backtracks = +s.backtracks || 0, dwellMs = +s.dwellMs || 0;
      var dur = Math.max(1, Math.round((dwellMs || ((s.lastEventAt || Date.now()) - (s.startedAt || Date.now()))) / 1000));
      var pathKey = (s.path || "").toString().toLowerCase(), info = PATHS[pathKey] || { motivation: "Still exploring", lean: "neutral" };
      var completion = clamp01(maxDepth / totalDepth);
      var actions = ix + q + loves + (booked ? 2 : 0) + maxDepth * 0.5;
      var velocity = clamp01((actions / (dur / 60 + 0.5)) / 6);
      var friction = clamp01(0.18 + backtracks * 0.12 + (dropped ? 0.45 : 0) - completion * 0.3);
      var evidence = (named ? 1 : 0) + (pathKey ? 1 : 0) + Math.min(ix, 4) + Math.min(q, 3) + Math.min(loves, 3) + (booked ? 2 : 0) + (completion > 0.5 ? 1 : 0) + (maxDepth >= 4 ? 1 : 0);
      return { pathKey: pathKey, info: info, named: named, booked: booked, dropped: dropped, maxDepth: maxDepth, totalDepth: totalDepth,
        interactions: ix, questions: q, loves: loves, backtracks: backtracks, durationSec: dur,
        completion: completion, velocity: velocity, friction: friction, evidence: evidence };
    }
    // Fogg (motivation × ability × prompt), Prochaska's stages and Cialdini's
    // principles are DESIGN HYPOTHESES here, not instruments. The numbers below
    // are hand-set; their product is not a calibrated readiness measurement.
    function fogg(f) {
      var motivation = clamp01(0.25 + (f.pathKey ? 0.2 : 0) + f.loves * 0.13 + f.velocity * 0.25 + (f.info.lean === "builder" ? 0.08 : 0) + Math.min(f.questions, 3) * 0.04);
      var ability = clamp01(1 - f.friction + f.completion * 0.1);
      var prompt = clamp01((f.booked ? 0.9 : 0) + f.completion * 0.4 + (f.maxDepth >= f.totalDepth - 1 ? 0.25 : 0) + f.loves * 0.06);
      var readiness = motivation * ability * prompt;
      return { motivation: r100(motivation * 100), ability: r100(ability * 100), prompt: r100(prompt * 100), readiness: r100(readiness * 100),
        bottleneck: (function () { var m = { Motivation: motivation, Ability: ability, Prompt: prompt }; return Object.keys(m).sort(function (a, b) { return m[a] - m[b]; })[0]; })() };
    }
    function stage(f) {
      if (f.booked) return { key: "action", label: "Action", push: "Close & onboard — they've decided. Make it easy to say yes." };
      if (f.completion >= 0.66 && (f.interactions >= 2 || f.questions >= 1) && !f.dropped) return { key: "preparation", label: "Preparation", push: "They're deciding. Give a clear next step + remove the last objection." };
      if ((f.pathKey || f.completion >= 0.3) && !f.dropped) return { key: "contemplation", label: "Contemplation", push: "Weighing it. Nurture with proof and vision — don't hard-close yet." };
      if (f.dropped || f.completion < 0.2) return { key: "precontemplation", label: "Precontemplation", push: "Not ready. Re-engage with a low-pressure, value-first touch." };
      return { key: "contemplation", label: "Contemplation", push: "Weighing it. Keep building interest and trust." };
    }
    function bayes(f) {
      var lo = logit(0.12);
      if (f.named) lo += Math.log(1.6);
      if (f.pathKey) lo += Math.log(1.9);
      if (f.completion >= 0.5) lo += Math.log(1.8);
      if (f.completion >= 0.85) lo += Math.log(1.7);
      if (f.interactions >= 1) lo += Math.log(1.5);
      if (f.interactions >= 3) lo += Math.log(1.6);
      if (f.questions >= 1) lo += Math.log(1.55);
      lo += Math.log(1 + f.loves * 0.5);
      if (f.booked) lo += Math.log(6.0);
      if (f.dropped) lo += Math.log(0.45);
      if (f.friction > 0.5) lo += Math.log(0.7);
      return { probability: r100(sigmoid(lo) * 100), confidence: r100(clamp01(1 - Math.exp(-f.evidence / 4)) * 100) };
    }
    function scores(f) {
      var lean = f.info.lean, builderPath = (f.pathKey === "wealth" || f.pathKey === "income" || f.pathKey === "freedom" || f.pathKey === "legacy");
      function s(z) { return r100(sigmoid(z) * 100); }
      var depth = f.completion, ix = f.interactions, q = f.questions, loves = f.loves;
      return {
        customer: s(-0.6 + depth * 1.4 + (lean === "customer" ? 1.1 : 0) + loves * 0.5),
        builder: s(-0.7 + depth * 1.2 + (lean === "builder" ? 1.3 : 0) + (builderPath ? 0.7 : 0) + ix * 0.25),
        leadership: s(-1.1 + depth * 1.0 + ix * 0.35 + (f.pathKey === "income" ? 0.6 : 0) + q * 0.2),
        intent: s(-0.8 + depth * 1.3 + (f.booked ? 2.2 : 0) + loves * 0.5 + f.velocity * 1.0),
        urgency: s(-1.0 + loves * 0.8 + (f.booked ? 2.4 : 0) + ix * 0.3 + q * 0.3),
        trust: s(-0.6 + q * 0.6 + (f.named ? 0.7 : 0) + depth * 1.0 + (f.dropped ? -0.6 : 0))
      };
    }
    function archetype(f, sc, st) {
      if (f.booked || (sc.intent >= 82 && sc.urgency >= 80)) return { name: "The Ready-Now", read: "Decided and warm. Speed is the only risk now." };
      if (f.questions >= 2) return { name: "The Researcher", read: "Analytical and careful — needs proof before belief." };
      if (sc.builder >= 65 && sc.urgency < 55) return { name: "The Dreamer", read: "Loves the vision; needs a believable first step to act." };
      if (sc.customer >= 65 && f.loves >= 1) return { name: "The Believer", read: "Connected to the product/purpose. Community will convert them." };
      if (f.dropped || (f.completion < 0.3 && f.interactions === 0)) return { name: "The Window-Shopper", read: "Curious but uncommitted. Re-earn attention with value." };
      if (st.key === "preparation") return { name: "The Deliberator", read: "On the fence and engaged — one nudge from a yes." };
      return { name: "The Explorer", read: "Still forming an opinion. Keep the story moving." };
    }
    function lever(arch) {
      switch (arch.name) {
        case "The Ready-Now": return { principle: "Scarcity / Commitment", move: "Lock the decision with a clear, time-bound next step." };
        case "The Researcher": return { principle: "Authority + Social Proof", move: "Lead with evidence, credentials, and a peer success story." };
        case "The Dreamer": return { principle: "Commitment & Consistency", move: "Get a small first yes that's consistent with their stated goal." };
        case "The Believer": return { principle: "Liking + Social Proof", move: "Bring them into the community; let belonging do the work." };
        case "The Window-Shopper": return { principle: "Reciprocity", move: "Give something genuinely useful first, with no ask attached." };
        case "The Deliberator": return { principle: "Social Proof + Scarcity", move: "Show people like them deciding, then make the path obvious." };
        default: return { principle: "Reciprocity + Liking", move: "Be useful and human; build the relationship before the ask." };
      }
    }
    function framing(f, sc) {
      if (sc.urgency >= 65 || sc.builder >= 65) return { frame: "Gain", line: "Frame the upside — what opens up when they say yes." };
      return { frame: "Loss-avoidance", line: "Frame the cost of waiting — what staying the same keeps costing them." };
    }
    function temperature(sc, fg, by) {
      var heat = r100(sc.intent * 0.3 + sc.urgency * 0.25 + fg.readiness * 0.25 + by.probability * 0.2);
      // "Molten" replaced "On Fire" on 4 Sep 2026. Same meaning, same urgency —
      // but metal is worked hot, so the top band now belongs to the brand instead
      // of borrowing from someone else's. Rows written before that date still say
      // "On Fire"; every reader below accepts both.
      return { heat: heat, band: heat >= 80 ? "Molten" : heat >= 60 ? "Hot" : heat >= 38 ? "Warm" : "Cool" };
    }
    function nextBestAction(st, temp, arch, lev, fr) {
      var when = (temp.band === "Molten" || temp.band === "On Fire") ? "within the hour" : temp.band === "Hot" ? "within 24 hours" : temp.band === "Warm" ? "within 2–3 days" : "this week, low-pressure";
      return { timing: when, headline: "Reach out " + when + " — " + lev.move, detail: "Stage: " + st.label + ". Lever: " + lev.principle + ". " + fr.line + " " + st.push };
    }
    function analyze(sig) {
      var f = features(sig), fg = fogg(f), st = stage(f), by = bayes(f), sc = scores(f);
      var arch = archetype(f, sc, st), lev = lever(arch), fr = framing(f, sc), temp = temperature(sc, fg, by), nba = nextBestAction(st, temp, arch, lev, fr);
      var who = f.named ? sig.name : "This prospect";
      var dna = { primaryMotivation: f.info.motivation, pathChosen: (sig && sig.pathLabel) ? sig.pathLabel : (f.pathKey ? f.pathKey.charAt(0).toUpperCase() + f.pathKey.slice(1) : null),
        decisionStyle: f.questions >= 2 ? "Analytical — asks before deciding" : f.interactions >= 2 ? "Engaged — likes to test ideas" : "Intuitive — moves on feel",
        engagement: f.completion >= 0.66 || f.interactions >= 3 ? "High" : f.completion >= 0.3 || f.interactions >= 1 ? "Moderate" : "Low" };
      return { schema: "h2-intel-v2", prospect: { name: (sig && sig.name) || "(anonymous)", phone: (sig && sig.phone) || "", email: (sig && sig.email) || "", method: (sig && sig.contactMethod) || "" }, archetype: arch, stage: st, fogg: fg,
        conversion: by, temperature: temp, scores: sc, dna: dna, framing: fr, lever: lev, nextBestAction: nba,
        meta: { furthestBeat: f.maxDepth, interactions: f.interactions, questions: f.questions, durationSec: f.durationSec, booked: f.booked, ctaAction: (sig && sig.ctaAction) || "" },
        headline: who + " is " + arch.name.replace(/^The /, "").toLowerCase() + " — " + dna.primaryMotivation.toLowerCase() + " drives them, " + temp.band.toLowerCase() + " (" + by.probability + "% likely, " + by.confidence + "% confidence). " + nba.headline };
    }

    /* ==============  WHAT WE ARE WILLING TO SHOW  ==============
       The model above is frozen — analyze() returns the raw read and nothing
       here may change it. This section answers a different question. Not "what
       does the model think" but "has it seen enough to say so out loud". Those
       were the same function until 12 September 2026, and that was the defect.

       Every score is a sigmoid with a negative intercept, so the floor of the
       model is not zero: a visitor who opens the link and closes it reads 35
       customer, 35 trust. Worse, an experience typically asks for a name and a
       path before it shows anything, and those two taps alone are worth +1.1 on
       customer fit, or +1.3 on builder. So the two commonest sessions in any
       deployment — the bounce and the two-tap bounce — produced cards in the
       55-80 range, and an affiliate reads that as a warm lead and picks up a
       phone. The number was never earned and the call goes nowhere; what it
       actually costs is their belief in every other number on the page.

       The engine already knew better. bayes() computes `confidence` from the
       evidence count — 0% for the ghost, 39% for the two-tap bounce, 92% for a
       full watch — the read prints it, and every consumer rendered the score
       while ignoring the confidence sitting right next to it.

       So: shrink each score toward the prior in proportion to the model's own
       confidence (empirical Bayes, one line), and below `gate` decline to show
       numbers at all. A caller that gets ready:false is expected to say what it
       DOES have — "3 of 24 screens, 40 seconds" — which is worth more to a
       human being than any score.

       `anchor` is what a total stranger deserves. 15 is a judgement, not a
       measurement. Revisit it when there is real conversion data behind it. */
    var PRESENT = { gate: 25, anchor: 15 };

    function shrink(raw, conf01) {
      return r100(PRESENT.anchor + (clamp(+raw || 0, 0, 100) - PRESENT.anchor) * clamp01(conf01));
    }

    /* present(scores, confidence) -> what a room is allowed to render.
       `scores` is read.scores, or any {key: 0-100} map; `confidence` is
       read.conversion.confidence on 0-100. Takes the two values rather than a
       whole read on purpose, so a room can call it with the columns off a
       stored row exactly as easily as with a live read — which is what lets one
       function repair the rows already in the database as well as the next one. */
    function present(scores, confidence) {
      var conf = clamp(+confidence || 0, 0, 100);
      var out = { ready: conf >= PRESENT.gate, confidence: conf, gate: PRESENT.gate, anchor: PRESENT.anchor, scores: {} };
      Object.keys(scores || {}).forEach(function (k) { out.scores[k] = shrink(scores[k], conf / 100); });
      return out;
    }

    /* ==============  THE EVIDENCE READ  (rules 2.0.0 · schema pi-read-v3)  ==============
       9 November 2026. An audit of both ventures that share this engine found
       that nothing the v2 model says had ever been compared with what a prospect
       went on to do: no outcome is recorded anywhere. Its "% likely" is a prior
       of 12% multiplied by hand-set factors; its leadership score has no
       leadership input; three of its inputs (back, question, reaction) are
       emitted by almost no experience; and any tap on any link counts as
       "booked". It can be explained. It cannot be validated or defended.

       This read is the replacement, and it runs BESIDE the model until its
       consumers switch over. analyze() is untouched and the golden reads still
       reproduce. The rules:

         · Additive points, no intercepts. Nothing observed scores nothing.
         · A required field earns nothing. Only what was volunteered counts.
         · A scene counts only as a QUALIFIED VIEW: in the foreground for at
           least half its narration, never less than floorSec. Scrubbing through
           a deck, or leaving it running in a background tab, is not watching it.
         · Every point carries a reason code, and the reasons sum to the score.
         · What could not be measured says so (measured:false). It is never 0.
         · There is no probability. `status` stays "unvalidated" until outcome
           data passes a gate, and a consumer is expected to print that.
         · Codes, not sentences. The engine names no venture and speaks no
           language; a consumer renders each code through its own catalogue.

       EVERY WEIGHT BELOW IS A HYPOTHESIS — an expert starting value, written
       down before any outcome was seen so that it cannot be tuned to flatter
       itself afterwards. Change one only at a validation gate, with a version
       bump, a CHANGELOG entry and a new golden set.

       read(signals, opts) is pure: the same snapshot always gives the same read,
       so a stored row can be replayed through a later rules version.
         opts.narration  [seconds per scene index]   — sets each scene's threshold
         opts.topics     [topic per scene index]     — "business" | "product" | null
         opts.actions    { business:[…], product:[…] } — which CTA actions belong to which
         opts.internal   true = the venture's own traffic; never scored            */
    var RULES = {
      version: "2.1.0", status: "unvalidated", schema: "pi-read-v3",
      floorSec: 4,            // a qualified view is never shorter than this
      thinViews: 3,           // fewer qualified views than this, and no request = no read
      solidShare: 0.5,        // share of scenes viewed for evidence to be "solid"
      solidTypes: 3,          // independent kinds of signal for evidence to be "solid"
      intent: { views: 30, finished: 10, returned: 15, asked: 20, enroll: 25 },
      interest: { declared: 40, scenes: 30, action: 30 },
      openness: { phone: 40, sms: 20, asked: 40 },
      timing: { now: 100, month: 60, looking: 20 },
      bands: { hot: 50, warm: 25 },
      contactActions: ["calendar", "text", "call", "email", "whatsapp", "contact"],
      actions: { business: ["enroll"], product: ["shop"] },
      // ── behaviour signals (2.1.0). OBSERVED AND SHOWN, NEVER SCORED, until
      //    outcome data shows one predicts something. Thresholds for rage taps
      //    and mouse thrash follow the published definitions of a mainstream
      //    experience-analytics product, so they can be named and compared.
      rage: { taps: 4, px: 200, ms: 300 },            // ≥4 taps, each within 200px and 300ms of the last
      thrash: { moves: 6, speed: 4, windowMs: 1500 }, // ≥6 direction reversals at ≥4 px/ms inside 1.5s
      deadMs: 700,                                    // a tap on nothing interactive that changes nothing for 700ms
      hoverMs: 800,                                   // resting on a call-to-action this long counts as a hover
      lingerX: 2, lingerSec: 45,                      // on screen 2× its narration (45s with none) = lingered
      resumeGapMs: 5 * 60 * 1000,                     // away this long mid-presentation, then back = resumed
      mediaMinSec: 10,                                // a video shorter than this is not "watched to the end"
      // ── intercepts: the experience may OFFER, the engine only decides when.
      //    Never in the first scenes, at most this many per session, never twice.
      intercept: { maxPerSession: 2, notBeforeScene: 3, cooldownMs: 90 * 1000, revisits: 2 }
    };
    var APPROACH_NAMES = { ready_now: "The Ready-Now", researcher: "The Researcher", dreamer: "The Dreamer", believer: "The Believer",
      deliberator: "The Deliberator", window_shopper: "The Window-Shopper", explorer: "The Explorer" };

    function has(list, v) { return list.indexOf(v) > -1; }
    function any(list, of) { for (var i = 0; i < of.length; i++) if (has(list, of[i])) return true; return false; }

    function read(sig, opts) {
      sig = sig || {}; opts = opts || {};
      var total = Math.max(Math.round(+sig.totalDepth || 0), 1);
      var secs = Array.isArray(sig.sceneSec) ? sig.sceneSec : [];
      var topics = Array.isArray(opts.topics) ? opts.topics : [];
      var narration = Array.isArray(opts.narration) ? opts.narration : [];
      var acts = opts.actions || RULES.actions;

      // ── what was observed ────────────────────────────────────────────────
      var qualified = 0, fgSec = 0, tally = {}, i;
      for (i = 0; i < total; i++) {
        var sec = Math.max(0, +secs[i] || 0), need = Math.max(RULES.floorSec, (+narration[i] || 0) / 2);
        var ok = sec >= need, t = topics[i];
        fgSec += sec; if (ok) qualified++;
        if (t) { tally[t] = tally[t] || { n: 0, q: 0 }; tally[t].n++; if (ok) tally[t].q++; }
      }
      var q = clamp01(qualified / total);
      var actions = (Array.isArray(sig.ctaActions) ? sig.ctaActions : (sig.ctaAction ? [sig.ctaAction] : []))
        .map(function (a) { return String(a || "").toLowerCase(); }).filter(function (a) { return /^[a-z_]{1,20}$/.test(a); });
      var lean = sig.lean === "builder" || sig.lean === "customer" ? sig.lean : "";
      var answers = sig.answers || {};
      var phoneOffered = sig.phoneOffered !== false;
      // An intercept the prospect said YES to is their own request, in their own
      // tap. It is the one behaviour-driven signal that scores from day one —
      // and it scores as what it is (asking for contact), not as a new weight.
      var ix = Array.isArray(sig.intercepts) ? sig.intercepts : [];
      var saidYes = ix.filter(function (x) { return x && x.answer === "yes" && /^[a-z_]{1,24}$/.test(String(x.kind || "")); });
      var yesContact = saidYes.some(function (x) { return x.kind === "help" || x.kind === "walkthrough" || x.kind === "pricing"; });
      var base = {
        asked: any(actions, RULES.contactActions) || yesContact, enroll: has(actions, "enroll"),
        finished: !!sig.finished, returned: !!sig.returning
      };
      function share(topic) { return tally[topic] && tally[topic].n ? tally[topic].q / tally[topic].n : null; }

      // ── the part that decides the band, as a function of the four facts that
      //    can still change, so "what would change this" is computed and not written
      function core(f) {
        var R = RULES.intent, reasons = [], score = 0;
        function add(code, pts) { pts = Math.round(pts); if (pts > 0) { reasons.push({ code: code, pts: pts }); score += pts; } }
        add("views", R.views * q);
        if (f.finished) add("finished", R.finished);
        if (f.returned) add("returned", R.returned);
        if (f.asked) add("asked_contact", R.asked);
        if (f.enroll) add("tapped_enroll", R.enroll);
        var request = f.asked || f.enroll, band;
        if (opts.internal || sig.internal) band = "excluded";
        else if (qualified < RULES.thinViews && !request) band = "none";
        else if (request) band = q >= RULES.solidShare ? "molten" : "request";
        else band = score >= RULES.bands.hot ? "hot" : score >= RULES.bands.warm ? "warm" : "cool";
        return { score: Math.min(100, score), reasons: reasons, band: band, request: request };
      }
      var now = core(base);

      function interest(wantLean, topic) {
        var R = RULES.interest, reasons = [], score = 0, sh = share(topic), notes = [];
        function add(code, pts) { pts = Math.round(pts); if (pts > 0) { reasons.push({ code: code, pts: pts }); score += pts; } }
        if (lean === wantLean) add("declared_path", R.declared);
        if (sh == null) notes.push("topics_not_configured"); else add("scenes_" + topic, R.scenes * sh);
        if (any(actions, acts[topic] || [])) add("action_" + topic, R.action);
        var d = { measured: true, score: Math.min(100, score), reasons: reasons };
        if (notes.length) d.notes = notes;
        return d;
      }
      function openness() {
        if (!phoneOffered) return { measured: false, why: "phone_not_offered" };
        var R = RULES.openness, reasons = [], score = 0;
        function add(code, pts) { if (pts > 0) { reasons.push({ code: code, pts: pts }); score += pts; } }
        if (sig.phone) add("volunteered_phone", R.phone);
        if (sig.smsConsent) add("sms_consent", R.sms);
        if (base.asked) add("asked_contact", R.asked);
        return { measured: true, score: Math.min(100, score), reasons: reasons };
      }
      function urgency() {
        var a = String(answers.timing || "").toLowerCase();
        // "later" is a real answer the rules do not score: it is reported as given, never as "not asked".
        if (a === "later") return { measured: false, why: "answered_unscored", value: a };
        if (!RULES.timing[a]) return { measured: false, why: "not_asked" };
        return { measured: true, score: RULES.timing[a], reasons: [{ code: "said_" + a, pts: RULES.timing[a] }] };
      }
      var dims = {
        intent: { measured: true, score: now.score, reasons: now.reasons },
        customer: interest("customer", "product"),
        builder: interest("builder", "business"),
        openness: openness(),
        urgency: urgency()
      };

      // ── how much there was to go on ──────────────────────────────────────
      var types = [];
      if (lean) types.push("declared");
      if (qualified > 0) types.push("attention");
      if (base.finished) types.push("completion");
      if (now.request) types.push("request");
      if (base.returned) types.push("return");
      if (sig.phone && phoneOffered) types.push("contact");
      if (answers.timing || answers.experience) types.push("answer");
      var enc = sig.enc || {}, voluntary = ["share", "save", "host", "diligence", "interact", "media_replay", "media_done", "resume"].filter(function (k) { return (+enc[k] || 0) > 0; });
      if (voluntary.length) types.push("voluntary");
      var strength = (qualified < RULES.thinViews && !now.request) ? "thin"
        : (q >= RULES.solidShare && types.length >= RULES.solidTypes) ? "solid" : "partial";

      // ── how to approach them: the old archetype names, each now a stated rule
      var nq = Array.isArray(sig.questions) ? sig.questions.length : (+sig.questions || 0), approach = null;
      if (now.band !== "none" && now.band !== "excluded") {
        var key, rule;
        if (now.request) { key = "ready_now"; rule = "asked_next_step"; }
        else if (nq >= 2) { key = "researcher"; rule = "asked_two_questions"; }
        else if (dims.builder.score >= 60) { key = "dreamer"; rule = "builder_interest_60"; }
        else if (dims.customer.score >= 60) { key = "believer"; rule = "customer_interest_60"; }
        else if (base.finished) { key = "deliberator"; rule = "finished_without_asking"; }
        else if (now.score < RULES.bands.warm) { key = "window_shopper"; rule = "intent_under_25"; }
        else { key = "explorer"; rule = "partway_without_asking"; }
        approach = { key: key, name: APPROACH_NAMES[key], rule: rule };
      }

      // ── facts worth showing but not worth scoring ────────────────────────
      var rv = sig.revisits || {}, revisited = Object.keys(rv).map(function (k) {
        var n = +k; return { scene: n, times: Math.round(+rv[k] || 0), sec: Math.round(+secs[n] || 0), topic: topics[n] || null };
      }).filter(function (r) { return r.times > 0 && r.scene >= 0 && r.scene < total; })
        .sort(function (a, b) { return b.times - a.times || b.sec - a.sec; }).slice(0, 2);

      // ── what encouraged them, and where they struggled — facts, not points ──
      var encouraged = [], struggled = [];
      voluntary.forEach(function (k) { encouraged.push({ code: k, n: Math.min(99, Math.round(+enc[k] || 0)) }); });
      for (i = 0; i < total; i++) {
        var need2 = (+narration[i] || 0) > 0 ? (+narration[i]) * RULES.lingerX : RULES.lingerSec;
        if ((+secs[i] || 0) >= need2) encouraged.push({ code: "lingered", scene: i, sec: Math.round(+secs[i]), topic: topics[i] || null });
      }
      if (encouraged.length > 12) encouraged = encouraged.slice(0, 12);
      var st = sig.struggle || {};
      Object.keys(st).forEach(function (k) {
        var n = +k, row = st[k] || {};
        if (!(n >= 0 && n < total)) return;
        ["rage", "dead", "thrash"].forEach(function (kind) { if ((+row[kind] || 0) > 0) struggled.push({ code: kind, scene: n, n: Math.min(99, Math.round(+row[kind])), topic: topics[n] || null }); });
      });
      struggled.sort(function (a, b) { return b.n - a.n; }); struggled = struggled.slice(0, 6);
      var hovered = Array.isArray(sig.hovered) ? sig.hovered.filter(function (h) { return /^[a-z_]{1,20}$/.test(String(h)); }).slice(0, 6) : [];

      var timing = { molten: "within_hour", request: "now", hot: "within_24h", warm: "within_2d", cool: "none", none: "none", excluded: "none" }[now.band];
      var opener = !approach ? null
        : (struggled[0] && struggled[0].topic) ? "help_with_" + struggled[0].topic
        : (revisited[0] && revisited[0].topic) ? "ask_about_" + revisited[0].topic
        : "open_" + approach.key;

      // ── what would change it: re-run the same rules with one fact flipped ──
      var would = [];
      [["tapped_enroll", "enroll"], ["asked_contact", "asked"], ["returned", "returned"], ["finished", "finished"]].forEach(function (p) {
        if (base[p[1]]) return;
        var f = { asked: base.asked, enroll: base.enroll, finished: base.finished, returned: base.returned }; f[p[1]] = true;
        var alt = core(f);
        if (alt.band !== now.band || alt.score !== now.score) would.push({ "if": p[0], band: alt.band, intent: alt.score });
      });
      if (now.band === "molten" || now.band === "hot" || now.band === "request") would.push({ "if": "no_reply_3d", band: "warm" });

      return {
        schema: RULES.schema, rules: { version: RULES.version, status: RULES.status },
        band: now.band,
        evidence: { strength: strength, qualified: qualified, total: total, share: Math.round(q * 100), types: types, fgSec: Math.round(fgSec) },
        dims: dims,
        declared: { path: sig.path || null, lean: lean || null, timing: answers.timing || null, experience: answers.experience || null },
        observed: { finished: base.finished, returned: base.returned, actions: actions, backtracks: Math.round(+sig.backtracks || 0), revisited: revisited,
          encouraged: encouraged, struggled: struggled, hovered: hovered,
          intercepts: ix.slice(0, 4).map(function (x) { return { kind: String(x.kind || ""), answer: String(x.answer || "") }; })
            .filter(function (x) { return /^[a-z_]{1,24}$/.test(x.kind) && /^(yes|no|dismissed)$/.test(x.answer); }) },
        approach: approach,
        action: { timing: timing, opener: opener },
        wouldChange: would
      };
    }

    /* ==============  RULES 3.0.0 · schema pi-read-v4  (behind a flag)  ==============
       10 November 2026. A review of 2.1.0 against its own documentation found
       that it said more than its inputs could support. 3.0.0 keeps every 2.1.0
       weight that was sound, so the two can be compared on the same visits, and
       changes what the read is ALLOWED TO CLAIM:

         · A request for a human response is its own object, separate from the
           temperature. Only explicit wording creates one: a contact form, a
           callback, a "should your host contact you?" offer answered yes, or a
           confirmed booking. Opening a calendar, a text or a mailto link is a
           next step the prospect STARTED, not a request anyone confirmed. An
           enroll tap is a next step, never consent to be contacted.
         · Help, explanation, pricing information, sharing and saving are
           self-service. A yes to them is encouragement, not permission.
         · Every dimension has an explicit state: measured (zero included),
           insufficient, unavailable (the presentation does not offer it),
           not_asked, skipped, declined.
         · Coverage scales with the experience. A two-scene teaser can be read;
           a 23-scene deck needs three qualified views. A request is actionable
           at any coverage.
         · The intent index is labelled an index, carries its own ceiling (40 on
           a first visit without a request, 55 after a later-day return) and is
           never a percentage.
         · Nothing is claimed about the future: no "no reply in 3 days", because
           the browser has no communication history. Follow-up dates belong to
           the follow-up system.
         · Reasons always sum to the score. Rounding is per reason; a cap appears
           as its own negative reason.
         · The approach keeps its legacy key and name for compatibility; its
           `describe` code says what the prospect DID, and is what a consumer
           shows first.

       2.1.0 stays the default until the integration checks in later prompts
       pass. Select 3.0.0 with PI.config({ rules: "3.0.0" }) or
       PI.read(signals, { rules: "3.0.0" }).                                     */
    var RULES3 = {
      version: "3.0.0", status: "unvalidated", schema: "pi-read-v4",
      floorSec: 4,
      coverage: { minViews: 3, minShare: 0.5, minSec: 8 },     // sufficient = min(minViews, ceil(eligible × minShare)) qualified views AND minSec qualified seconds
      solid: { share: 0.5, categories: 3 },
      intent: { views: 30, finished: 10, returned: 15, next_step: 20, enroll: 25 },
      interest: { declared: 40, scenes: 30, action: 30 },
      openness: { phone: 40, sms: 20, request: 40 },
      timing: { now: 100, month: 60, looking: 20 },
      bands: { hot: 50, warm: 25 },
      linkActions: ["calendar", "text", "call", "email", "whatsapp", "contact"],   // open a channel; the prospect still has to send
      actions: { business: ["enroll"], product: ["shop"] },
      contactOffers: ["contact"],                                                   // the only intercept kinds whose yes is a request
      answerStates: ["skipped", "declined"],
      unscoredTiming: ["later"],                                                    // stored and shown as answered; no points until a rule update gives it some
      channels: ["email", "text", "call", "whatsapp", "calendar"]
    };

    function readV3(sig, opts) {
      sig = sig || {}; opts = opts || {};
      var R = RULES3, eligible = Math.max(Math.round(+sig.totalDepth || 0), 1);
      var secs = Array.isArray(sig.sceneSec) ? sig.sceneSec : [];
      var topics = Array.isArray(opts.topics) ? opts.topics : [];
      var narration = Array.isArray(opts.narration) ? opts.narration : [];
      var acts = opts.actions || R.actions;
      var offered = Array.isArray(opts.questions) ? opts.questions : [];
      var answers = sig.answers || {}, astate = sig.answerStates || {};
      var excluded = !!(opts.internal || sig.internal);

      // ── exposure: a foreground view is exposure, not attention ─────────────
      var qualified = 0, qSec = 0, seen = 0, tally = {}, i;
      for (i = 0; i < eligible; i++) {
        var sec = Math.max(0, +secs[i] || 0), need = Math.max(R.floorSec, (+narration[i] || 0) / 2), ok = sec >= need, t = topics[i];
        if (sec > 0) seen++;
        if (ok) { qualified++; qSec += sec; }
        if (t) { tally[t] = tally[t] || { n: 0, q: 0 }; tally[t].n++; if (ok) tally[t].q++; }
      }
      var q = clamp01(qualified / eligible);
      var needViews = Math.min(R.coverage.minViews, Math.ceil(eligible * R.coverage.minShare));
      var sufficient = qualified >= needViews && qSec >= R.coverage.minSec;
      function share(topic) { return tally[topic] && tally[topic].n ? tally[topic].q / tally[topic].n : null; }

      // ── what they clicked, what they asked for, what is confirmed ──────────
      var clicked = []; (Array.isArray(sig.ctaActions) ? sig.ctaActions : (sig.ctaAction ? [sig.ctaAction] : [])).forEach(function (a) {
        a = String(a || "").toLowerCase(); if (/^[a-z_]{1,20}$/.test(a) && clicked.indexOf(a) < 0) clicked.push(a);   // one tap, one fact
      });
      var reqs = Array.isArray(sig.requests) ? sig.requests : [], reqSources = [], channels = [];
      reqs.forEach(function (r) {
        if (!r || !/^(contact_form|callback|intercept)$/.test(String(r.kind || ""))) return;
        if (reqSources.indexOf(r.kind) < 0) reqSources.push(r.kind);
        var c = String(r.channel || ""); if (has(R.channels, c) && channels.indexOf(c) < 0) channels.push(c);
      });
      var ix = Array.isArray(sig.intercepts) ? sig.intercepts : [];
      ix.forEach(function (x) { if (x && x.answer === "yes" && has(R.contactOffers, String(x.kind || "")) && reqSources.indexOf("intercept") < 0) reqSources.push("intercept"); });
      var booked = !!sig.bookingConfirmed;
      var linkOpened = any(clicked, R.linkActions), enrollClicked = has(clicked, "enroll");
      var requestState = booked ? "confirmed" : reqSources.length ? "requested" : (linkOpened || enrollClicked) ? "next_step" : "none";
      var human = requestState === "requested" || requestState === "confirmed";
      var request = { state: requestState, sources: reqSources.concat(booked ? ["booking_confirmed"] : []), channels: channels, permitsContact: human };
      if (linkOpened) request.opened = clicked.filter(function (a) { return has(R.linkActions, a); });

      var outcomes = {
        booking: has(clicked, "calendar") || booked ? (booked ? "confirmed" : "unconfirmed") : null,
        checkout: sig.checkoutStarted ? "started" : null,
        enrollment: enrollClicked ? "unverified" : null,      // only an authorized server source may verify
        purchase: has(clicked, "shop") ? "unverified" : null
      };

      // ── the intent index: reasons that sum to the score ────────────────────
      var base = { next: linkOpened || human, enroll: enrollClicked, finished: !!sig.finished, returned: !!sig.returning };
      function sumReasons(list) {
        var total = 0; list.forEach(function (r) { total += r.pts; });
        if (total > 100) { list.push({ code: "cap", pts: 100 - total }); total = 100; }
        return total;
      }
      function intentOf(f) {
        var I = R.intent, reasons = [];
        function add(code, pts) { pts = Math.round(pts); if (pts > 0) reasons.push({ code: code, pts: pts }); }
        add("views", I.views * q);
        if (f.finished) add("finished", I.finished);
        if (f.returned) add("returned", I.returned);
        if (f.next) add(human ? "requested_contact" : "opened_contact_link", I.next_step);
        if (f.enroll) add("clicked_enroll", I.enroll);
        var score = sumReasons(reasons);
        var ceiling = Math.round(I.views) + I.finished + (f.returned ? I.returned : 0);
        return { score: score, reasons: reasons, ceilingWithoutRequest: ceiling };
      }
      function bandOf(f, idx) {
        if (excluded) return "excluded";
        var actionable = f.next || f.enroll;
        if (!sufficient && !actionable) return "insufficient";
        return idx.score >= R.bands.hot ? "hot" : idx.score >= R.bands.warm ? "warm" : "cool";
      }
      var idx = intentOf(base), band = bandOf(base, idx);

      // ── dimensions with explicit states ────────────────────────────────────
      function insufficient() { return { state: "insufficient" }; }
      var gate = !sufficient && !human && !base.enroll && !linkOpened;
      function interest(wantLean, topic) {
        if (gate) return insufficient();
        var I = R.interest, reasons = [], notes = [], sh = share(topic);
        function add(code, pts) { pts = Math.round(pts); if (pts > 0) reasons.push({ code: code, pts: pts }); }
        if (sig.lean === wantLean) add("declared_path", I.declared);
        if (sh == null) notes.push("topics_not_configured"); else add("scenes_" + topic, I.scenes * sh);
        if (any(clicked, acts[topic] || [])) add("action_" + topic, I.action);
        var d = { state: "measured", score: sumReasons(reasons), reasons: reasons };
        if (notes.length) d.notes = notes;
        return d;
      }
      function openness() {
        var offeredChannels = Array.isArray(opts.channels) ? opts.channels : (sig.phoneOffered === false ? ["email"] : ["email", "phone"]);
        if (!offeredChannels.length) return { state: "unavailable" };
        if (gate) return insufficient();
        var O = R.openness, reasons = [];
        if (sig.phone && has(offeredChannels, "phone")) reasons.push({ code: "volunteered_phone", pts: O.phone });
        if (sig.smsConsent && has(offeredChannels, "phone")) reasons.push({ code: "sms_permission", pts: O.sms });
        if (human) reasons.push({ code: "requested_contact", pts: O.request });
        var d = { state: "measured", score: sumReasons(reasons), reasons: reasons, channelsOffered: offeredChannels };
        if (!has(offeredChannels, "phone")) d.ceiling = O.request;
        return d;
      }
      function answerDim(key, scored) {
        var v = String(answers[key] || "").toLowerCase(), st = String(astate[key] || "");
        if (offered.indexOf(key) < 0 && !v && !st) return { state: "unavailable" };
        if (has(R.answerStates, st)) return { state: st };
        if (!v) return { state: "not_asked" };
        if (!scored) return { state: "measured", value: v, kind: "self_report" };
        if (!R.timing[v]) return has(R.unscoredTiming, v) ? { state: "measured", value: v, kind: "self_report" } : { state: "not_asked" };
        return { state: "measured", value: v, score: R.timing[v], reasons: [{ code: "said_" + v, pts: R.timing[v] }], kind: "self_report" };
      }
      var dims = {
        intent: excluded ? { state: "excluded" } : gate ? insufficient()
          : { state: "measured", kind: "rules_index", score: idx.score, reasons: idx.reasons, ceilingWithoutRequest: idx.ceilingWithoutRequest },
        customer: interest("customer", "product"),
        builder: interest("builder", "business"),
        openness: openness(),
        urgency: answerDim("timing", true),
        experience: answerDim("experience", false)
      };

      // ── evidence: independent categories, one source counted once ─────────
      var cats = [];
      function cat(c, yes) { if (yes && cats.indexOf(c) < 0) cats.push(c); }
      cat("declared", !!sig.lean);
      cat("exposure", qualified > 0);
      cat("completion", base.finished);
      cat("request", human);
      cat("next_step", !human && (linkOpened || enrollClicked));
      cat("return", base.returned);
      cat("contact_detail", !!sig.phone && dims.openness.state !== "unavailable");
      cat("answer", dims.urgency.state === "measured" || dims.experience.state === "measured");
      var enc = sig.enc || {}, voluntary = ["share", "save", "host", "diligence", "interact", "media_replay", "media_done", "resume"].filter(function (k) { return (+enc[k] || 0) > 0; });
      cat("voluntary", voluntary.length > 0);
      var solidCats = Math.min(R.solid.categories, eligible + 1);
      var strength = excluded ? "excluded" : (!sufficient && !human) ? "insufficient"
        : (q >= R.solid.share && cats.length >= solidCats) ? "solid" : "partial";

      // ── observed facts (never scored) ──────────────────────────────────────
      var encouraged = voluntary.map(function (k) { return { code: k, n: Math.min(99, Math.round(+enc[k] || 0)) }; });
      for (i = 0; i < eligible; i++) {
        var need2 = (+narration[i] || 0) > 0 ? (+narration[i]) * 2 : 45;
        if ((+secs[i] || 0) >= need2) encouraged.push({ code: "lingered", scene: i, sec: Math.round(+secs[i]), topic: topics[i] || null });
      }
      var encTotal = encouraged.length; encouraged = encouraged.slice(0, 12);
      var st = sig.struggle || {}, struggled = [];
      Object.keys(st).forEach(function (k) {
        var n = +k, row = st[k] || {}; if (!(n >= 0 && n < eligible)) return;
        ["rage", "dead", "thrash"].forEach(function (kind) { if ((+row[kind] || 0) > 0) struggled.push({ code: kind, scene: n, n: Math.min(99, Math.round(+row[kind])), topic: topics[n] || null }); });
      });
      struggled.sort(function (a, b) { return b.n - a.n; });
      var strTotal = struggled.length; struggled = struggled.slice(0, 6);
      var rv = sig.revisits || {}, revisited = Object.keys(rv).map(function (k) {
        var n = +k; return { scene: n, times: Math.round(+rv[k] || 0), sec: Math.round(+secs[n] || 0), topic: topics[n] || null };
      }).filter(function (r) { return r.times > 0 && r.scene >= 0 && r.scene < eligible; }).sort(function (a, b) { return b.times - a.times || b.sec - a.sec; }).slice(0, 2);
      var nq = typeof sig.questions === "number" ? sig.questions : (Array.isArray(sig.questions) ? sig.questions.length : 0);

      // ── describe what they did (primary label) + the legacy approach key ──
      var describe, key, rule;
      if (excluded) { describe = null; }
      else if (human) { describe = "requested_contact"; key = "ready_now"; rule = "requested_contact"; }
      else if (enrollClicked || linkOpened) { describe = "started_next_step"; key = "ready_now"; rule = "clicked_next_step"; }
      else if (gate) { describe = null; }
      else if (nq >= 2) { describe = "asked_questions"; key = "researcher"; rule = "two_questions"; }
      else if (dims.builder.score >= 60) { describe = "reviewing_business"; key = "dreamer"; rule = "builder_interest_60"; }
      else if (dims.customer.score >= 60) { describe = "exploring_product"; key = "believer"; rule = "customer_interest_60"; }
      else if (base.finished) { describe = "finished_without_request"; key = "deliberator"; rule = "finished_without_request"; }
      else if (idx.score < R.bands.warm) { describe = "brief_visit"; key = "window_shopper"; rule = "intent_under_25"; }
      else { describe = "partway"; key = "explorer"; rule = "partway_without_request"; }
      var approach = describe ? { describe: describe, key: key, name: APPROACH_NAMES[key], rule: rule } : null;

      var timing = excluded ? "none"
        : human ? (sufficient ? "within_hour" : "now")
        : (enrollClicked || linkOpened) ? "within_24h"
        : { hot: "within_24h", warm: "within_2d", cool: "none", insufficient: "none" }[band];
      var opener = !approach ? null
        : (struggled[0] && struggled[0].topic) ? "offer_help_" + struggled[0].topic
        : (revisited[0] && revisited[0].topic) ? "ask_about_" + revisited[0].topic
        : "open_" + approach.describe;

      // ── what would change it: the same rules, one fact flipped ────────────
      var would = [];
      if (!excluded) [["clicked_enroll", "enroll"], ["opened_contact_link", "next"], ["returned", "returned"], ["finished", "finished"]].forEach(function (p) {
        if (base[p[1]]) return;
        var f = { next: base.next, enroll: base.enroll, finished: base.finished, returned: base.returned }; f[p[1]] = true;
        var alt = intentOf(f), altBand = bandOf(f, alt);
        if (altBand !== band || alt.score !== idx.score) would.push({ "if": p[0], band: altBand, intent: alt.score });
      });

      return {
        schema: R.schema, rules: { version: R.version, status: R.status },
        request: request,
        temperature: { band: band },
        coverage: { eligible: eligible, seen: seen, qualified: qualified, qualifiedSec: Math.round(qSec), share: Math.round(q * 100), needViews: needViews, sufficient: sufficient },
        evidence: { strength: strength, categories: cats },
        dims: dims,
        declared: { path: sig.path || null, lean: sig.lean || null },
        outcomes: outcomes,
        observed: { finished: base.finished, returned: base.returned, clicked: clicked, backtracks: Math.round(+sig.backtracks || 0), questions: Math.min(99, nq), revisited: revisited,
          encouraged: encouraged, encouragedTotal: encTotal, struggled: struggled, struggledTotal: strTotal,
          hovered: (Array.isArray(sig.hovered) ? sig.hovered : []).filter(function (h) { return /^[a-z_]{1,20}$/.test(String(h)); }).slice(0, 6),
          intercepts: ix.slice(0, 4).map(function (x) { return { kind: String((x && x.kind) || ""), answer: String((x && x.answer) || "") }; })
            .filter(function (x) { return /^[a-z_]{1,24}$/.test(x.kind) && /^(yes|no|dismissed)$/.test(x.answer); }) },
        approach: approach,
        action: { timing: timing, opener: opener },
        wouldChange: would
      };
    }

    function readAt(sig, opts) { return (opts && opts.rules === "3.0.0") ? readV3(sig, opts) : read(sig, opts); }
    return {
      analyze: analyze, present: present, PRESENT: PRESENT,
      read: read, readV3: readV3, readAt: readAt, RULES: RULES, RULES3: RULES3,
      has: has, any: any,
      paths: function () { return PATHS; },
      setPaths: function (p) { if (p && typeof p === "object") PATHS = p; }
    };
  }

  return { createEvaluator: createEvaluator, RULE_VERSIONS: ["2.1.0", "3.0.0"] };
});

/* ============================================================================
 *  PROSPECT INTELLIGENCE™  —  the engine
 *  @kmin/prospect-intelligence  ·  see package.json for the version
 *
 *  One file. Add it to any interactive experience and it does three things:
 *    1. Collects behavioral signals the experience emits with  PI.track(event, data)
 *    2. Turns them into two reads:
 *         · the v2 model (Fogg · Prochaska · Bayes · Cialdini · Kahneman · RFE)
 *           — hand-set weights, never checked against an outcome; frozen
 *         · the evidence read (rules 2.0.0) — an additive scorecard that says
 *           what was observed, what each observation was worth, how much there
 *           was to go on, and what would change the conclusion
 *    3. Persists the profile and notifies the affiliate on the moments that matter
 *
 *  THE BOUNDARY. This engine is shared by more than one venture. Nothing in it
 *  names a company, a product, a brand, a domain or a storage key that belongs
 *  to one of them. Everything a venture needs to say about itself arrives
 *  through window.TENANT (its generated tenant record) or PI.config(). A test
 *  in this package fails the build if a venture string gets in.
 *
 *  ── attach (one line, after the tenant record) ────────────────────────────
 *      <script src="/assets/tenant.js"></script>
 *      <script src="/assets/prospect-intelligence.js"></script>
 *
 *  ── configure (reads ?u= automatically; override when needed) ─────────────
 *      PI.config({ email:"...", site:"...", closer:"...", debug:true });
 *
 *  ── emit signals at your interaction points ───────────────────────────────
 *      PI.track("name",     { name:"Dana" });
 *      PI.track("contact",  { name:"Dana", email:"dana@x.com", method:"email" });
 *      PI.track("scene",    { index: 7, total: 24 });
 *      PI.track("path",     { path:"wealth", label:"Wealth" });
 *      PI.track("interact", { kind:"slider" });
 *      PI.track("question", { q:"How much does it cost?" });
 *      PI.track("reaction", { value:"love" });
 *      PI.track("cta",      { action:"enroll" });
 *      PI.track("answer",   { key:"timing", value:"month" });   // now | month | looking
 *      PI.track("answer",   { key:"experience", value:"yes" }); // their own words, never scored
 *      PI.finish();
 *
 *  ── read it anywhere ──────────────────────────────────────────────────────
 *      PI.profile()   →  the full structured read (schema h2-intel-v2)
 *      PI.read()      →  the evidence read (schema pi-read-v3, rules 2.0.0)
 * ========================================================================== */
(function (root) {
  "use strict";

  /* ====================  THE EVALUATOR  ====================
     Since 1.7.0 (Prompt 02) the model and both evidence reads live in
     src/evaluate.js, which is pure and also runs on a server. The browser
     build puts it ahead of this file as window.PIEvaluate.                  */
  var EVAL = root.PIEvaluate || (typeof require === "function" ? require("./evaluate.js") : null);
  if (!EVAL || typeof EVAL.createEvaluator !== "function") {
    // No evaluator: the presentation must carry on. A stub that records nothing.
    if (root.console && root.console.warn) root.console.warn("[PI] evaluator missing — Prospect Intelligence is off for this page");
    root.PI = { track: function () {}, finish: function () {}, read: function () { return null; }, profile: function () { return null; },
      analyze: function () { return null; }, present: function () { return null; }, config: function () { return {}; }, reset: function () {}, version: 2, off: true };
    return;
  }
  // Loaded twice on one page (a deck that re-mounts, a tag manager that
  // injects it again): the first copy keeps collecting, the second does
  // nothing, so no listener, timer or upload is ever doubled.
  if (root.PI && root.PI.__collector) return;
  var EV = EVAL.createEvaluator({ paths: root.TENANT && root.TENANT.piPaths });
  var analyze = EV.analyze, present = EV.present, PRESENT = EV.PRESENT,
      read = EV.read, readV3 = EV.readV3, RULES = EV.RULES, RULES3 = EV.RULES3,
      has = EV.has, any = EV.any, PATHS = EV.paths();

  /* ====================  SIGNAL COLLECTOR  ==================== */
  function fresh() {
    return { name: null, phone: null, email: null, contactMethod: null, ctaAction: null, path: null, pathLabel: null, maxDepth: 0, totalDepth: 0, interactions: 0,
      questions: [], reactions: [], booked: false, droppedEarly: false, backtracks: 0, startedAt: Date.now(), lastEventAt: Date.now(),
      // ── for the evidence read (rules 2.0.0) ──
      lean: "", ctaActions: [], finished: false, returning: false, smsConsent: false, answers: {},
      fg: {}, revisits: {}, session: "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      // ── behaviour signals (2.1.0) ──
      enc: {}, struggle: {}, hovered: [], intercepts: [], offered: {}, offers: {}, lastOfferAt: 0, hiddenAt: 0,
      // ── rules 3.0.0 ──
      requests: [], bookingConfirmed: false, checkoutStarted: false, answerStates: {}, qCount: 0,
      // ── instrumentation (Prompt 03) ──
      ids: {}, media: [], seq: 0, uncertainMs: 0, tx: { queued: 0, refused: 0, fallback: 0 } };
  }
  var S = fresh();

  /* ── WHAT THEY DID WITHOUT BEING ASKED, AND WHERE IT WENT WRONG ───────────
     10 November 2026. Two lists, kept apart on purpose.

     ENCOURAGEMENT is effort the prospect did not have to spend: replaying a
     video, opening the host's details, sharing the link, saving it, coming
     back to finish. Reaching a scene is not on the list — the experience
     carries them there.

     STRUGGLE is friction: rapid repeated taps on one spot, taps on something
     that does nothing, a pointer thrashing back and forth. Those are the
     published frustration definitions of experience-analytics tools, and
     what they measure is that THE PAGE failed this person somewhere — not
     what the person is like.

     Both are recorded and shown. Neither earns a point until outcome data
     shows it predicts something. What a tap MEANT is the prospect's to say,
     which is what intercepts are for (below).                              */
  function encourage(code) { if (!code) return; S.enc[code] = Math.min(99, (S.enc[code] || 0) + 1); }
  function struggleRaw(kind) {
    var at = cur.index >= 0 ? cur.index : 0, row = S.struggle[at] = S.struggle[at] || {};
    row[kind] = Math.min(99, (row[kind] || 0) + 1);
    return at;
  }
  function struggle(kind) {
    var at = struggleRaw(kind);
    // Only what a person would recognise as trouble offers help; an
    // unhandled tap alone does not.
    if (kind !== "unhandled") considerIntercept("struggle", at);
  }
  var INTERACTIVE = "a,button,input,select,textarea,label,summary,video,audio,[role=button],[role=link],[onclick],[tabindex],[data-pi-ignore]";
  function interactive(el) {
    try { for (var n = el, d = 0; n && d < 8; n = n.parentElement, d++) { if (n.matches && n.matches(INTERACTIVE)) return true; } } catch (e) { return true; }
    return false;
  }

  /* ── WHERE THE ENGINE LISTENS (Prompt 03) ────────────────────────────────
     Only inside a registered presentation: elements marked data-pi-root.
     A page with no such element keeps the old behaviour (the whole document)
     and the snapshot says so (ctx.scope "document"), so an account page,
     checkout or a consent banner outside the deck is never collected by
     accident once a deck registers its root. The attribute's value names the
     surface ("phone", "desktop") when PI.config({ surface }) has not.       */
  function rootOf(el) {
    try { for (var n = el, d = 0; n && d < 60; n = n.parentElement, d++) { if (n.getAttribute && n.hasAttribute && n.hasAttribute("data-pi-root")) return n; } } catch (e) {}
    return null;
  }
  function surfaceNow() {
    if (CFG.surface) return CFG.surface;
    try { var r = root.document && root.document.querySelector && root.document.querySelector("[data-pi-root]");
      var v = r ? String(r.getAttribute("data-pi-root") || "").toLowerCase() : "";
      if (/^[a-z][a-z0-9_-]{1,23}$/.test(v)) CFG.surface = v; } catch (e) {}
    return CFG.surface || null;
  }
  function rooted() { try { var D = root.document; return !!(D && D.querySelector && D.querySelector("[data-pi-root]")); } catch (e) { return false; } }
  function inScope(el) {
    if (!rooted()) return true;
    var r = rootOf(el);
    if (r && !CFG.surface) { var v = String(r.getAttribute("data-pi-root") || "").toLowerCase(); if (/^[a-z][a-z0-9_-]{1,23}$/.test(v)) CFG.surface = v; }
    return !!r;
  }

  /* ── FRICTION, NAMED FOR WHAT IT IS (Prompt 03, D9) ──────────────────────
     unhandled  a tap on a surface that is not a control. It may be nothing:
                a person tapping to steady a phone, or a handler bound with
                addEventListener that this check cannot see.
     deadctl    a CONTROL (link, button, [data-pi-cta]) that gave no
                acknowledgement in time: no navigation, no scene change, no
                change on the page, no media starting, no focus or busy state.
                A control that says it is working (aria-busy) gets longer.
     errtap     a script error within 2 s of a tap. No message is kept.
     Under rules 2.1.0 "dead" keeps its old meaning (an unhandled tap) so the
     default read is unchanged; under 3.0.0 "dead" means a dead control.
     Thresholds are configurable only inside fixed bounds.                   */
  function clampN(v, lo, hi, d) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function friction() {
    var o = CFG.friction || {}, r = o.rage || {}, t = o.thrash || {};
    return {
      version: "friction-1",
      rage: { taps: Math.round(clampN(r.taps, 3, 8, RULES.rage.taps)), px: clampN(r.px, 50, 400, RULES.rage.px), ms: clampN(r.ms, 150, 600, RULES.rage.ms) },
      thrash: { moves: Math.round(clampN(t.moves, 4, 12, RULES.thrash.moves)), speed: clampN(t.speed, 2, 10, RULES.thrash.speed), windowMs: clampN(t.windowMs, 800, 3000, RULES.thrash.windowMs) },
      ackMs: clampN(o.ackMs, 500, 5000, 1500), busyMaxMs: clampN(o.busyMaxMs, 2000, 15000, 10000)
    };
  }
  var ACTIONABLE = "a[href],button,[role=button],[role=link],[data-pi-cta],summary,input[type=submit],input[type=button]";
  function actionable(el) {
    try { for (var n = el, d = 0; n && d < 6; n = n.parentElement, d++) { if (n.matches && n.matches(ACTIONABLE)) return n; } } catch (e) {}
    return null;
  }
  var pendingAck = null, lastTapAt = 0, mo = null;
  function acknowledged(why) {
    if (!pendingAck) return;
    pendingAck.ack = why || "change";
    stopObserving();
  }
  function stopObserving() { try { if (mo) mo.disconnect(); } catch (e) {} mo = null; }
  function watchFor(ctl, scene) {
    var F = friction(), href = "";
    try { href = String(ctl.getAttribute && ctl.getAttribute("href") || ""); } catch (e) {}
    // tel:, sms:, mailto: and new-tab links hand off to something the page cannot see.
    if (/^(tel|sms|mailto|whatsapp):/i.test(href)) return;
    try { if (String(ctl.getAttribute && ctl.getAttribute("target") || "") === "_blank") return; } catch (e) {}
    stopObserving();
    pendingAck = { t: Date.now(), el: ctl, scene: scene, ack: null };
    try {
      var MO = root.MutationObserver, D = root.document;
      if (MO && D && D.body) { mo = new MO(function () { acknowledged("dom"); }); mo.observe(D.body, { subtree: true, childList: true, attributes: true, characterData: true }); }
      else pendingAck.ack = "unmeasured";          // no way to see a change: never call it dead
    } catch (e) { pendingAck.ack = "unmeasured"; }
    var mine = pendingAck;
    function check() {
      if (pendingAck !== mine || mine.ack) { if (pendingAck === mine) pendingAck = null; return; }
      var busy = false; try { busy = String(mine.el.getAttribute("aria-busy") || "") === "true"; } catch (e) {}
      if (busy && Date.now() - mine.t < F.busyMaxMs) { root.setTimeout(check, 500); return; }   // slow, but saying so
      stopObserving(); pendingAck = null;
      struggle("deadctl"); if (CFG.rules === "3.0.0") struggleRaw("dead");
    }
    try { if (root.setTimeout) root.setTimeout(check, F.ackMs); } catch (e) {}
  }
  var taps = [], thrash = { lastX: null, lastT: 0, dir: 0, flips: [] }, hoverOn = null;
  function onTap(e) {
    if (!inScope(e.target)) return;
    var now = Date.now(), x = +e.clientX || 0, y = +e.clientY || 0, R = friction().rage;
    lastTapAt = now; noteInput();
    var last = taps[taps.length - 1];
    if (last && now - last.t <= R.ms && Math.abs(x - last.x) <= R.px && Math.abs(y - last.y) <= R.px) taps.push({ t: now, x: x, y: y });
    else taps = [{ t: now, x: x, y: y }];
    if (taps.length === R.taps) struggle("rage");           // once per burst, not once per extra tap
    var ctl = actionable(e.target);
    if (ctl) { watchFor(ctl, cur.index); return; }
    if (!interactive(e.target)) {
      var scene = cur.index;
      try {
        if (root.setTimeout) root.setTimeout(function () {
          if (cur.index !== scene || taps.length >= R.taps) return;
          struggle(CFG.rules === "3.0.0" ? "unhandled" : "dead");   // 2.1.0 keeps its word for the same thing
        }, RULES.deadMs);
      } catch (er) {}
    }
  }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;   // phones have no pointer to thrash
    if (!inScope(e.target)) return;
    var now = Date.now(), x = +e.clientX || 0, T = friction().thrash;
    if (thrash.lastX != null && now > thrash.lastT) {
      var dx = x - thrash.lastX, v = Math.abs(dx) / (now - thrash.lastT), dir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      if (v >= T.speed && dir && dir !== thrash.dir) {
        thrash.flips.push(now); thrash.dir = dir;
        thrash.flips = thrash.flips.filter(function (t) { return now - t <= T.windowMs; });
        if (thrash.flips.length >= T.moves) { struggle("thrash"); thrash.flips = []; }
      }
    }
    thrash.lastX = x; thrash.lastT = now;
  }
  function ctaOf(el) {
    try { for (var n = el, d = 0; n && d < 6; n = n.parentElement, d++) { var a = n.getAttribute && n.getAttribute("data-pi-cta"); if (a) return String(a).toLowerCase(); } } catch (e) {}
    return null;
  }
  function onOver(e) {
    if (!inScope(e.target)) return;
    var c = ctaOf(e.target); if (!c) return;
    if (!hoverOn || hoverOn.cta !== c) hoverOn = { cta: c, since: Date.now() };
  }
  function onOut(e) {
    if (!hoverOn) return;
    var c = ctaOf(e.relatedTarget);
    if (c === hoverOn.cta) return;
    if (Date.now() - hoverOn.since >= RULES.hoverMs && S.hovered.indexOf(hoverOn.cta) < 0 && S.hovered.length < 6) S.hovered.push(hoverOn.cta);
    hoverOn = null;
  }

  /* ── MEDIA (Prompt 03, D11) ──────────────────────────────────────────────
     Only media a person controls; a muted looping background clip is never
     counted. Each item gets an id (data-pi-media, else its file name). What
     is kept per item: duration, seconds actually played (merged ranges, so a
     seek to the end adds nothing), plays, resumes, replays, seeks, stalls.
     "Completed" needs 90% played, not an ended event. A replay is a restart
     after real viewing (ended, or past 5 s then back under 1 s); a resume is
     carrying on. Cross-origin players (an embedded video site) cannot be read
     and are counted as unknown, never guessed.
     Under rules 2.1.0 the legacy media_done / media_replay rules still apply,
     so the default read does not change.                                    */
  function personal(m) { return m && m.controls && !m.loop && /^(VIDEO|AUDIO)$/.test(String(m.tagName || "")); }
  var mediaSeen = typeof WeakMap === "function" ? new WeakMap() : null;
  function mediaId(m) {
    var id = "";
    try { id = String(m.getAttribute("data-pi-media") || ""); } catch (e) {}
    if (!id) { try { id = String(m.currentSrc || m.src || "").split(/[?#]/)[0].split("/").pop(); } catch (e) {} }
    return id.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "media";
  }
  function addRange(st, a, b) {
    if (!(b > a)) return;
    st.ranges.push([a, b]); st.ranges.sort(function (x, y) { return x[0] - y[0]; });
    var out = [];
    st.ranges.forEach(function (r) { var l = out[out.length - 1]; if (l && r[0] <= l[1] + 0.5) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); });
    st.ranges = out.slice(-20);
  }
  function watchedSec(st) { return st.ranges.reduce(function (t, r) { return t + (r[1] - r[0]); }, 0); }
  function onMedia(e) {
    var m = e.target; if (!personal(m) || !mediaSeen || !inScope(m)) return;
    var st = mediaSeen.get(m);
    if (!st) { st = { id: mediaId(m), ended: false, played: false, maxT: 0, lastT: null, playing: false, ranges: [], plays: 0, resumes: 0, replays: 0, seeks: 0, stalls: 0, done: false };
      if (S.media.length < 6) S.media.push(st); }
    var t = +m.currentTime || 0, legacy = CFG.rules !== "3.0.0";
    switch (e.type) {
      case "play": {
        var restart = st.ended || (st.maxT > 5 && t < 1);
        if (legacy) { if (st.ended || st.played && t < 1) { encourage("media_replay"); considerIntercept("replay", cur.index); } }
        else if (restart) { encourage("media_replay"); considerIntercept("replay", cur.index); }
        if (!st.played) st.plays++; else if (restart) st.replays++; else st.resumes++;
        st.played = true; st.ended = false; st.playing = true; st.lastT = t; noteInput(); break;
      }
      case "timeupdate":
        if (st.playing && st.lastT != null && t >= st.lastT && t - st.lastT < 1.5) addRange(st, st.lastT, t);
        st.lastT = t; st.maxT = Math.max(st.maxT, t); break;
      case "seeking": st.seeks = Math.min(99, st.seeks + 1); st.lastT = null; break;
      case "seeked": st.lastT = t; break;
      case "pause": st.playing = false; break;
      case "waiting": case "stalled": st.stalls = Math.min(99, st.stalls + 1); break;
      case "ended": {
        st.ended = true; st.playing = false;
        var dur = +m.duration || 0, full = dur > 0 && watchedSec(st) >= 0.9 * dur;
        if (legacy) { if (dur >= RULES.mediaMinSec) encourage("media_done"); }
        else if (full && dur >= RULES.mediaMinSec) encourage("media_done");
        st.done = full; break;
      }
    }
    if (+m.duration > 0) st.dur = +m.duration;
    mediaSeen.set(m, st);
  }
  function mediaPlaying() { return S.media.some(function (st) { return st.playing; }); }

  /* ── INPUT, IDLE AND THE PAGE LIFECYCLE (Prompt 03) ───────────────────── */
  var lastInputAt = Date.now();
  function noteInput() { lastInputAt = Date.now(); }
  function onVisibility() {
    if (!pageVisible()) { S.hiddenAt = Date.now(); persist("scene", true); return; }   // a checkpoint: phones often never fire pagehide
    if (S.hiddenAt && Date.now() - S.hiddenAt >= RULES.resumeGapMs && !S.finished && cur.index >= 0) encourage("resume");
    S.hiddenAt = 0; noteInput();
  }
  function onError() { if (lastTapAt && Date.now() - lastTapAt <= 2000) struggle("errtap"); }
  try {
    var D = root.document;
    if (D && D.addEventListener) {
      D.addEventListener("click", onTap, true);
      D.addEventListener("pointermove", onMove, { passive: true, capture: true });
      D.addEventListener("pointerover", onOver, true);
      D.addEventListener("pointerout", onOut, true);
      ["keydown", "pointerdown", "touchstart", "wheel", "scroll"].forEach(function (t) { D.addEventListener(t, function (e) { if (inScope(e.target)) noteInput(); }, { passive: true, capture: true }); });
      ["play", "pause", "ended", "timeupdate", "seeking", "seeked", "waiting", "stalled"].forEach(function (t) { D.addEventListener(t, onMedia, true); });   // media events don't bubble; capture does reach them
      D.addEventListener("visibilitychange", onVisibility);
    }
    if (root.addEventListener) {
      root.addEventListener("error", onError, true);
      ["hashchange", "popstate", "beforeunload"].forEach(function (t) { root.addEventListener(t, function () { acknowledged("navigation"); }); });
    }
  } catch (e) {}

  /* ── INTERCEPTS: ASK INSTEAD OF GUESSING ──────────────────────────────────
     A behaviour says something happened. Only the prospect can say what it
     meant. So at a few moments the engine tells the experience it MAY offer
     something, and the experience decides whether and how to ask. The engine
     names no venture and writes no words.

     Rewritten at 1.12.0. What changed, and why:

     · AN ELIGIBILITY DECISION IS NOT AN IMPRESSION. The engine proposes; the
       experience reports what actually happened with
           PI.track("offer", { kind, stage })
       stage = "shown" | "dismissed" | "accepted" | "requested" | "fulfilled".
       The two-per-visit limit, the never-twice rule and the 90-second spacing
       count SHOWN offers only. An offer nobody rendered costs nothing.
     · ONE OFFER, ONE DELIVERY. With PI.config({ intercept: fn }) the function
       is called; otherwise document gets "pi:intercept". Never both, and a
       second "shown" for the same offer is ignored.
     · NATURAL MOMENTS ONLY. An offer is delivered at a scene boundary or at the
       finish, never mid-scene, never while a form field has focus, never while
       the experience holds it (PI.hold("narration") … PI.release("narration")),
       never while another offer is up, never in preview, and never without
       analytics permission.
     · AN INFORMATION OFFER IS NOT A CONTACT REQUEST.
           help, walkthrough, pricing, send_media, share_link   information
           question                                             one closed question
           contact                                              asks for a person
       Accepting an information offer opens content. It never becomes a
       request, under any rule version. Only kind "contact" at stage
       "requested", WITH a channel the prospect can actually be reached on,
       is a request — and it alerts the affiliate exactly once.
     · DISMISSING COSTS NOTHING. It is recorded, and scores nothing.
     · SHORT EXPERIENCES ARE NOT INTERRUPTED. Under SHORT_SCENES scenes the only
       offer is one optional question at the end.
     · LIMITS SURVIVE A RELOAD (same browser, same day).
     · OFF until the experience enables it AND names a registered experiment:
           PI.config({ intercepts: true, experiment: { id, holdoutPct } })
       A session in the holdout arm is offered nothing; ctx says which arm.

       triggers  struggle → help · second revisit → walkthrough
                 replay → send_media · finished → share_link
       ask       PI.offer(kind, { scene, about })   the experience proposes one
                 (pricing, contact, question); same limits, same moments
       question  PI.nextQuestion() → "direction" | "timing" | "help" | null
                 the ONE question still worth asking; answers the prospect has
                 already volunteered are never asked again

     PI.track("intercept", { kind, answer }) is still accepted from an older
     experience and behaves exactly as before.                              */
  var OFFER_TYPE = { help: "info", walkthrough: "info", pricing: "info", send_media: "info", share_link: "info", question: "question", contact: "contact" };
  var SHORT_SCENES = 6, OFFER_RENDER_MS = 8000;
  var holds = {}, pendingOffer = null, liveOffer = null, offerSeq = 0, limitsLoaded = false;
  function fnv(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
  // The same assignment src/outcomes.js arm() makes, so the server can recompute it.
  function offerArm() {
    var x = CFG.experiment;
    if (!x || !/^[a-z][a-z0-9-]{2,39}$/.test(String(x.id || ""))) return "off";
    if (!(x.holdoutPct > 0 && x.holdoutPct < 100)) return "exposed";
    return (fnv(x.id + "|" + S.session) % 1000) < x.holdoutPct * 10 ? "holdout" : "exposed";
  }
  function offersOn() { return !!CFG.intercepts && !CFG.preview && offerArm() === "exposed" && consentOk(); }
  function loadOfferLimits() {
    if (limitsLoaded) return; limitsLoaded = true;
    try {
      var v = JSON.parse(localStorage.getItem(PREFIX + "offers") || "null");
      if (!v || v.day !== new Date().toISOString().slice(0, 10)) return;
      (v.kinds || []).forEach(function (k) { if (OFFER_TYPE[k]) S.offered[k] = true; });
      if (+v.last > S.lastOfferAt) S.lastOfferAt = +v.last;
    } catch (e) {}
  }
  function saveOfferLimits() {
    if (!consentOk()) return;
    try { localStorage.setItem(PREFIX + "offers", JSON.stringify({ day: new Date().toISOString().slice(0, 10), kinds: Object.keys(S.offered), last: S.lastOfferAt })); } catch (e) {}
  }
  function sceneCount() {
    var M = CFG.scenesV3, sf = surfaceNow();
    if (M && M.surfaces && sf && M.surfaces[sf] && M.surfaces[sf].sceneIds) return M.surfaces[sf].sceneIds.length;
    return S.totalDepth || 0;
  }
  function offerAllowed(kind, scene, atEnd) {
    if (!OFFER_TYPE[kind] || !offersOn()) return false;
    loadOfferLimits();
    var R = RULES.intercept;
    if (S.offered[kind] || Object.keys(S.offered).length >= R.maxPerSession) return false;
    var n = sceneCount();
    if (n > 0 && n < SHORT_SCENES && !(kind === "question" && atEnd)) return false;
    if (!atEnd && !(scene >= R.notBeforeScene)) return false;
    if (S.lastOfferAt && Date.now() - S.lastOfferAt < R.cooldownMs) return false;
    return true;
  }
  function formFocused() {
    try {
      var a = root.document && root.document.activeElement, t = a && String(a.tagName || "").toUpperCase();
      return !!a && (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable === true);
    } catch (e) { return false; }
  }
  function offerSuppressed() {
    if (liveOffer && Date.now() - liveOffer.at > OFFER_RENDER_MS && !liveOffer.shown) liveOffer = null;   // nobody rendered it
    if (liveOffer) return true;
    for (var k in holds) if (holds[k]) return true;
    return formFocused();
  }
  function deliverOffer(o) {
    var rec = S.offers[o.kind] || (S.offers[o.kind] = { n: 0 });
    rec.n = Math.min(9, rec.n + 1);
    liveOffer = { kind: o.kind, at: Date.now(), shown: false };
    var topics = (CFG.scenes && CFG.scenes.topics) || [];
    var offer = { id: "o" + (++offerSeq) + "-" + o.kind, kind: o.kind, type: OFFER_TYPE[o.kind], scene: o.scene, topic: topics[o.scene] || null };
    if (o.about) offer.about = o.about;
    if (o.kind === "question") offer.question = nextQuestion();
    if (typeof CFG.intercept === "function") { try { CFG.intercept(offer); } catch (e) {} return true; }
    try {
      var D = root.document, Ev = root.CustomEvent;
      if (D && D.dispatchEvent && typeof Ev === "function") D.dispatchEvent(new Ev("pi:intercept", { detail: offer }));
    } catch (e) {}
    return true;
  }
  // boundary: true = this IS a natural moment (a scene just changed, the end,
  // or the experience chose it); false = wait for the next one.
  function proposeOffer(kind, scene, about, boundary, atEnd) {
    if (!offerAllowed(kind, scene, atEnd)) return false;
    if (kind === "question" && !nextQuestion()) return false;
    var o = { kind: kind, scene: scene, about: /^[a-z_]{1,24}$/.test(String(about || "")) ? String(about) : null, atEnd: !!atEnd };
    if (!boundary || offerSuppressed()) { pendingOffer = o; return false; }
    pendingOffer = null;
    return deliverOffer(o);
  }
  function flushOffer() {
    var o = pendingOffer; if (!o) return;
    if (!offerAllowed(o.kind, o.scene, o.atEnd)) { if (S.offered[o.kind] || !offersOn()) pendingOffer = null; return; }
    if (offerSuppressed()) return;
    pendingOffer = null; deliverOffer(o);
  }
  function considerIntercept(trigger, scene) {
    var kind = { struggle: "help", revisit: "walkthrough", replay: "send_media", finished: "share_link" }[trigger];
    if (!kind) return;
    proposeOffer(kind, scene, null, trigger === "revisit" || trigger === "finished", trigger === "finished");
  }
  function reachable(channel) {
    if (channel === "email") return !!S.email;
    if (channel === "text" || channel === "call" || channel === "whatsapp") return !!S.phone;
    return channel === "calendar";
  }
  function offerStage(data) {
    var kind = String(data.kind || "").toLowerCase(), stage = String(data.stage || "").toLowerCase(), rec = S.offers[kind];
    if (!OFFER_TYPE[kind] || !rec) return;            // only an offer the engine delivered has stages
    if (stage === "shown") {
      if (rec.shown) return;                           // the event and the callback both wired: still one offer
      rec.shown = true; S.offered[kind] = true; S.lastOfferAt = Date.now(); saveOfferLimits();
      if (liveOffer && liveOffer.kind === kind) liveOffer.shown = true;
      return;
    }
    if (!rec.shown) return;                            // nothing happens to an offer nobody saw
    if (stage === "dismissed" || stage === "accepted") {
      if (rec.out) return;
      rec.out = stage;
      if (liveOffer && liveOffer.kind === kind) liveOffer = null;
      // "info", never "yes": under every rule version only a yes can be read as a request.
      if (S.intercepts.length < 4 && kind !== "question") S.intercepts.push({ kind: kind, answer: stage === "dismissed" ? "dismissed" : "info" });
      return;
    }
    if (stage === "requested") {
      var ch = String(data.channel || "").toLowerCase();
      if (OFFER_TYPE[kind] !== "contact" || rec.out !== "accepted" || rec.req || !has(RULES3.channels, ch) || !reachable(ch)) return;
      rec.req = ch;
      if (S.requests.length < 4) S.requests.push({ kind: "intercept", channel: ch });
      if (S.intercepts.length < 4) S.intercepts.push({ kind: "contact", answer: "yes" });
      notify("hot_lead");                              // one alert: the held contact alert, released once
      return;
    }
    if (stage === "fulfilled") {
      if (rec.ful || (OFFER_TYPE[kind] === "contact" ? !rec.req : rec.out !== "accepted")) return;
      rec.ful = true;
      if (kind === "share_link") encourage("share");   // a share that actually happened, not a tap on "yes"
      if (kind === "send_media") encourage("save");
    }
  }
  function compactOffers() {
    var out = [];
    Object.keys(S.offers).slice(0, 7).forEach(function (k) {
      var r = S.offers[k], o = { kind: k, n: r.n };
      if (r.shown) o.shown = true; if (r.out) o.out = r.out; if (r.req) o.req = r.req; if (r.ful) o.ful = true;
      out.push(o);
    });
    return out;
  }
  // The one question still worth asking, or null. A path chosen on a welcome
  // screen already says which direction; an answer given or declined is final.
  var QUESTIONS = { direction: ["products", "business", "both", "exploring"], timing: ["now", "month", "later", "looking"],
    help: ["product_info", "business_info", "cost", "conversation", "nothing"], experience: ["yes", "no"] };
  function answered(k) { return !!(S.answers[k] || S.answerStates[k]); }
  function nextQuestion() {
    if (!answered("direction") && !S.lean && !S.path) return "direction";
    if (!answered("timing")) return "timing";
    if (!answered("help")) return "help";
    return null;
  }

  /* ── FOREGROUND TIME PER SCENE ────────────────────────────────────────────
     maxDepth says how far someone got. It does not say they watched: a deck
     can be scrubbed end to end in a minute, and a hands-free one runs to the
     last scene in a tab nobody is looking at. So the engine keeps its own
     clock — the time each scene spent on screen while the page was visible —
     and the evidence read counts a scene only when that clears a threshold.
     Going back to an earlier scene is recorded here too. Until now it relied
     on PI.track("back"), which no experience has ever sent, so `backtracks`
     was 0 for every prospect who ever went back.                            */
  var cur = { index: -1, since: 0 };
  function pageVisible() { try { return !root.document || root.document.visibilityState !== "hidden"; } catch (e) { return true; } }
  /* Long stretches on screen with no input and no media playing are
     uncertain: the person may be reading, or may have walked away. The
     seconds past IDLE_CAP are recorded as uncertain in every version; under
     rules 3.0.0 they are also left out of the scene's foreground time. A
     video playing counts as activity, so passive viewing is never punished.  */
  var IDLE_CAP_MS = 120000, pageGone = false;
  function settle() {
    var now = Date.now();
    if (cur.index >= 0 && cur.since) {
      var span = Math.max(0, now - cur.since), quietFrom = Math.max(cur.since, lastInputAt + IDLE_CAP_MS);
      var quiet = mediaPlaying() ? 0 : Math.max(0, now - quietFrom);
      quiet = Math.min(quiet, span);
      S.uncertainMs = Math.min(36e5, S.uncertainMs + quiet);
      S.fg[cur.index] = (S.fg[cur.index] || 0) + (CFG.rules === "3.0.0" ? span - quiet : span);
    }
    cur.since = cur.index >= 0 && pageVisible() && !pageGone ? now : 0;
  }
  function enterScene(index) {
    if (typeof index !== "number" || !isFinite(index) || index < 0 || index === cur.index) return;
    settle();
    if (cur.index >= 0 && index < cur.index) S.backtracks++;
    if (S.fg[index] != null) S.revisits[index] = (S.revisits[index] || 0) + 1; else S.fg[index] = 0;
    cur.index = index; cur.since = pageVisible() && !pageGone ? Date.now() : 0;
    acknowledged("scene");
    if ((S.revisits[index] || 0) >= RULES.intercept.revisits) considerIntercept("revisit", index);
    flushOffer();                                      // a scene boundary: an offer that was waiting may be made now
  }
  try {
    if (root.document && root.document.addEventListener) root.document.addEventListener("visibilitychange", function () {
      if (pageVisible()) { if (cur.index >= 0 && !cur.since && !pageGone) cur.since = Date.now(); } else { settle(); cur.since = 0; acknowledged("hidden"); }
    });
    // Leaving the page stops the clock; coming back from the back/forward
    // cache restarts it once, never twice.
    if (root.addEventListener) {
      root.addEventListener("pagehide", function () { settle(); cur.since = 0; pageGone = true; });
      root.addEventListener("pageshow", function (e) { if (!pageGone) return; pageGone = false; if (e && e.persisted && pageVisible() && cur.index >= 0 && !cur.since) { cur.since = Date.now(); noteInput(); } });
    }
  } catch (e) {}
  /* CONFIG. Everything a venture can change is here and nowhere else.
       notify        where alerts POST. From the tenant record (TENANT.piNotify) or
                     here; never from the page link. Unset = no alert is sent
       persist       where profiles POST (default: the venture's pi-profile function)
       session       where the engine asks for an intake capability (TENANT.piSession).
                     Unset = none is asked for and uploads go without one
       rep           the affiliate HANDLE this visit is credited to — from ?u=, and
                     never a display name (an alert addressed by a name is rejected)
       email/site/closer   affiliate contact facts, for the alert payload
       identityKeys  { name, email } localStorage keys the venture's deck already
                     writes, so the engine can pick the prospect up from them
       paths         the path vocabulary for this venture (replaces PATHS)
       preview       true = compute the read, send NOTHING. For an affiliate
                     watching their own presentation: no profile is persisted,
                     no alert is sent, so nobody is emailed about themselves.
                     Set from ?preview= on the address, or PI.config().
       debug         console logging
     Read at load from window.TENANT (the venture's generated tenant record),
     then from the address, then from PI.config(). */
  var CFG = { notify: null, persist: null, rep: null, email: null, site: null, closer: null, identityKeys: null, preview: false, debug: false,
    // for the evidence read — see read(): { narration:[sec], topics:[topic], actions:{…} },
    // whether this experience offers a phone field at all, and whether the
    // visit is the venture's own traffic (never scored)
    scenes: null, phoneOffered: true, internal: false,
    // which evidence rules PI.read()/profile().read use. "2.1.0" until the
    // integration checks for 3.0.0 pass; channels offered for contact
    rules: "2.1.0", channels: null,
    // intercepts are off until the experience can render one (see considerIntercept)
    intercepts: false, intercept: null,
    // …and until a registered experiment is named: { id, holdoutPct }. No experiment, no offers.
    experiment: null,
    // analytics permission is REQUIRED by default (Prompt 05, D3): with no
    // consent hook on the page, nothing is identified, stored, sent or alerted.
    // A venture that genuinely needs no permission sets TENANT.piConsentRequired = false.
    consentRequired: true };
  (function () {
    try {
      var T = root.TENANT || {};
      if (T.piIdentityKeys) CFG.identityKeys = T.piIdentityKeys;
      if (T.piScenes) CFG.scenes = T.piScenes;
      if (T.piScenesV3) CFG.scenesV3 = T.piScenesV3;
      if (typeof T.piNotify === "string" && T.piNotify) CFG.notify = T.piNotify;
      if (T.piConsentRequired === false) CFG.consentRequired = false;
      if (typeof T.piSession === "string" && T.piSession) CFG.session = T.piSession;
      if (T.piIntercepts === true) CFG.intercepts = true;
      if (T.piExperiment && typeof T.piExperiment === "object") CFG.experiment = T.piExperiment;
    } catch (e) {}
  })();
  var lastSig = "";
  var sentStrong = false;   // a high-value alert (contact shared or CTA tapped) already went — don't dilute with weaker finish/exit pings

  /* ── 26 September 2026 · the alert waits for the read to be true ──────────
     The "shared their contact details" alert used to go the instant the
     prospect typed an email — on the welcome screen, before a single scene
     was watched — and, being the "strong" alert, it then SUPPRESSED the
     finish alert. So an affiliate was told "window-shopper, scene 0" about
     someone who went on to watch the whole thing, and never heard otherwise.
     The lead itself is safe the moment it is typed (the venture's lead
     endpoint stores it); only the EMAIL is deferred, until the session has
     something true to say: the prospect finished, tapped a CTA, left the
     page, or went quiet for IDLE_MS. And a later finish may still send an
     upgrade when the read has moved by UPGRADE_SCENES or a CTA appeared. */
  var IDLE_MS = 3 * 60 * 1000;
  var UPGRADE_SCENES = 3;
  var pendingStrong = null;     // "hot_lead" while a contact alert is waiting for a truer moment
  var idleTimer = null;
  var sentAt = { depth: -1, booked: false };
  function armIdle() {
    if (!pendingStrong) return;
    try {
      if (idleTimer && root.clearTimeout) root.clearTimeout(idleTimer);
      if (root.setTimeout) idleTimer = root.setTimeout(function () { idleTimer = null; flushPending("idle"); }, IDLE_MS);
    } catch (e) {}
  }
  function flushPending(why) {
    if (!pendingStrong) return false;
    var r = pendingStrong; pendingStrong = null;
    try { if (idleTimer && root.clearTimeout) root.clearTimeout(idleTimer); } catch (e) {}
    idleTimer = null;
    if (CFG.debug) log("contact alert released by " + why);
    deliver(r);
    return true;
  }

  /* ── WHERE ALERTS GO: THE TENANT RECORD OR PI.config(), NOTHING ELSE ─────
     10 November 2026 (D15). The alert endpoint used to be read from the page
     link (?notify=), and before that from window globals. An alert carries a
     prospect's name, email and phone, so anyone who could hand someone a
     link could have had those details posted to an address of their choosing.
     The endpoint now comes only from window.TENANT.piNotify (the venture's
     generated tenant record) or PI.config({ notify }). With neither, no alert
     is sent: the profile is still saved, and nothing goes anywhere unexpected.
     ?email= and ?site= are ignored for the same reason. Only ?u= (the
     affiliate handle, which the server resolves and never trusts) and
     ?preview= are read from the link. */
  // Storage keys, namespaced by the venture's storagePrefix so two ventures on
  // a shared origin never read each other's prospect. Declared HERE, before
  // the load-time hydration below runs: as a `var` further down it was hoisted
  // as undefined at that moment, and the remembered identity was never read
  // back on a reload (found during the extraction, 5 Sep 2026).
  var PREFIX = (root.TENANT && root.TENANT.storagePrefix) || "pi_";
  var ID_KEY = PREFIX + "prospect_id";        // who the prospect said they are
  var PROSPECT_KEY = PREFIX + "prospect";     // the anonymous per-browser id
  var DAY_KEY = PREFIX + "prospect_day";      // the day that id was first seen (for "came back later")
  (function () {
    try {
      var q = new URLSearchParams(location.search);
      CFG.rep = q.get("u") || q.get("rep") || null;
      if (q.has("preview")) CFG.preview = true;   // the affiliate's own walkthrough — observe, never record
      if (q.get("u")) S.name = null; // u is the rep, not the prospect
      hydrateIdentity();               // ...but who the PROSPECT said they are does survive
    } catch (e) {}
    // Tell the venture's consent module the engine wants to collect, so it asks.
  })();

  /* ── WHO THEY ARE SURVIVES A RELOAD ──────────────────────────────────────
     The prospect types their name once, on the welcome screen. Every later
     alert — finished, CTA tapped — is sent from a fresh page state if the deck
     reloads, the PWA restarts, or they come back on the same link. The name
     lived only in memory, so those alerts went out saying "Someone" for a
     person who had introduced themselves an hour earlier. Found 4 Sep 2026 on a
     live beta lead: the leads table had the name and email, the alert that
     reached the affiliate had neither.
     The venture's own keys (CFG.identityKeys) are read too, so a prospect who
     identified themselves on the deck before the engine ran is still named. */
  function hydrateIdentity() {
    try {
      var raw = localStorage.getItem(ID_KEY);
      var v = raw ? JSON.parse(raw) : {};
      if (!S.name && v.name) S.name = String(v.name).slice(0, 80);
      if (!S.email && v.email) S.email = String(v.email).slice(0, 160);
      if (!S.phone && v.phone) S.phone = String(v.phone).slice(0, 32);
      if (!S.contactMethod && v.method) S.contactMethod = String(v.method).slice(0, 20);
      // A venture's own deck may already have the prospect's name and email under
      // its own storage keys (a venture-specific name key and email key). Those
      // keys are the venture's, not the engine's: they arrive via config, never
      // as a literal here. See CFG.identityKeys.
      var ik = CFG.identityKeys || {};
      if (!S.name && ik.name) { var n = localStorage.getItem(ik.name); if (n) S.name = String(n).slice(0, 80); }
      if (!S.email && ik.email) { var m = localStorage.getItem(ik.email); if (m) S.email = String(m).slice(0, 160); }
    } catch (e) {}
  }
  function rememberIdentity() {
    if (!consentOk()) return;        // nothing about the prospect is kept on the device without permission
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({
        name: S.name || "", email: S.email || "", phone: S.phone || "", method: S.contactMethod || ""
      }));
    } catch (e) {}
  }

  function bump() { S.lastEventAt = Date.now(); armIdle(); }
  // Declined or withdrawn: drop everything observed this session and cancel
  // anything waiting to go out (a held contact alert, the idle timer).
  function forgetSession() {
    try { if (idleTimer && root.clearTimeout) root.clearTimeout(idleTimer); } catch (e) {}
    idleTimer = null; pendingStrong = null;
    if (S.lastEventAt || S.maxDepth || S.name) { S = fresh(); cur = { index: -1, since: 0 }; taps = []; hoverOn = null; }
  }
  function track(event, data) {
    if (consentDenied()) { forgetSession(); return; }   // declined or withdrawn: observe nothing, hold nothing
    data = data || {}; bump();
    switch (String(event || "").toLowerCase()) {
      case "name": if (data.name) { S.name = data.name; rememberIdentity(); } break;
      case "contact":
        if (data.name) S.name = data.name;
        if (data.method) S.contactMethod = String(data.method).toLowerCase();
        if (data.phone) S.phone = String(data.phone).trim();
        if (data.email) S.email = String(data.email).trim();
        if (data.smsConsent === true) S.smsConsent = true;
        rememberIdentity();
        break;
      case "scene": case "slide": case "beat":
        if (typeof data.index === "number" && data.index > S.maxDepth) S.maxDepth = data.index;
        // Stable identity (Prompt 03): which scene this number means, on which surface.
        var sid = String(data.sceneId || data.key || "").toLowerCase();
        if (typeof data.index === "number" && data.index >= 0 && data.index < MAX_SCENES && /^[a-z][a-z0-9_-]{1,47}$/.test(sid)) S.ids[data.index] = sid;
        var sf = String(data.surface || "").toLowerCase();
        if (!CFG.surface && /^[a-z][a-z0-9_-]{1,23}$/.test(sf)) CFG.surface = sf;
        if (typeof data.total === "number") S.totalDepth = Math.max(S.totalDepth, data.total);
        enterScene(data.index); break;
      case "path": case "choice": case "priority": {
        var v = (data.path || data.choice || data.value || "").toString().toLowerCase();
        if (v) { S.path = v; S.pathLabel = data.label || (v.charAt(0).toUpperCase() + v.slice(1)); S.lean = (PATHS[v] && PATHS[v].lean) || ""; } break;
      }
      case "interact": case "slider": case "calc": case "explore": case "guess": S.interactions++; encourage("interact"); break;
      case "question":
        // The COUNT is a signal; the words are the prospect's. The latest text
        // is held in memory for the affiliate's alert email only, and never
        // enters the snapshot that is stored (3.0.0, 10 Nov 2026).
        if (data.q || data.text) { S.qCount = Math.min(99, S.qCount + 1); S.questions = [String(data.q || data.text).slice(0, 300)]; }
        break;
      case "reaction": if (data.value) S.reactions.push(data.value); break;
      case "back": S.backtracks++; break;
      case "answer": {
        // The prospect's own answer to a question the experience asked. A closed
        // vocabulary on purpose: nothing free-form is stored about a person.
        var ak = String(data.key || "").toLowerCase(), av = String(data.value || "").toLowerCase();
        if (!QUESTIONS[ak]) break;
        if (av === "skipped" || av === "declined") { if (!S.answers[ak]) S.answerStates[ak] = av; }
        else if (QUESTIONS[ak].indexOf(av) >= 0) {
          // The answer is stored as given. "later" is a real answer the rules do not score yet.
          S.answers[ak] = av; delete S.answerStates[ak];
          // Saying which direction is the same declaration a welcome-screen path makes.
          if (ak === "direction" && !S.path) S.lean = av === "products" ? "customer" : av === "business" ? "builder" : "";
        }
        break;
      }
      case "offer": offerStage(data); break;
      case "finished": S.finished = true; considerIntercept("finished", cur.index); break;
      // ── encouragement an experience reports (2.1.0) ──
      // ── explicit requests and confirmations (rules 3.0.0) ──
      case "contact_request": case "callback": {
        // Only an experience whose wording asks for a HUMAN RESPONSE may send these.
        var ch = String(data.channel || "").toLowerCase();
        if (S.requests.length < 4) S.requests.push({ kind: event === "callback" ? "callback" : "contact_form", channel: /^(email|text|call|whatsapp|calendar)$/.test(ch) ? ch : "" });
        break;
      }
      case "booking_confirmed": S.bookingConfirmed = true; break;      // only when the scheduler confirmed it
      case "checkout_started": S.checkoutStarted = true; break;
      case "share": encourage("share"); break;
      case "save": case "save_contact": case "later": encourage("save"); break;
      case "host_panel_open": case "host": encourage("host"); break;
      case "faq": case "diligence": case "disclosure": case "compare": encourage("diligence"); break;
      case "intercept": {
        var ik2 = String(data.kind || "").toLowerCase(), ia = String(data.answer || "").toLowerCase();
        if (/^[a-z_]{1,24}$/.test(ik2) && /^(yes|no|dismissed)$/.test(ia) && S.intercepts.length < 4) {
          S.intercepts.push({ kind: ik2, answer: ia });
          if (ia === "yes" && ik2 === "share_link") encourage("share");
          if (ia === "yes" && ik2 === "send_media") encourage("save");
        }
        break;
      }
      case "drop": S.droppedEarly = true; break;
      case "cta": case "booked":
        S.booked = true;
        if (data.action) {
          S.ctaAction = String(data.action).toLowerCase();   // enroll | shop | calendar | text | call | email | whatsapp | social | website
          if (S.ctaActions.indexOf(S.ctaAction) < 0 && S.ctaActions.length < 12) S.ctaActions.push(S.ctaAction);
        }
        notify("cta_click");
        return;
      case "contact_saved": case "hot_lead":
        notify("hot_lead");
        return;
    }
    persist(String(event || "").toLowerCase() === "contact" ? "contact" : "scene", String(event || "").toLowerCase() === "contact");
  }
  function compactStruggle() {
    var out = {};
    Object.keys(S.struggle).filter(function (k) { return +k < MAX_SCENES; }).slice(0, 12).forEach(function (k) { out[k] = Object.assign({}, S.struggle[k]); });
    return out;
  }
  var MAX_SCENES = 80;   // bounds the snapshot: the persistence endpoint caps `signals` at 4 KB
  function signals() {
    settle();   // bank the scene on screen right now, so a read mid-scene is a true one
    var n = Math.min(Math.max(+S.totalDepth || 0, +S.maxDepth + 1 || 0), MAX_SCENES), sceneSec = [], revisits = {}, i;
    for (i = 0; i < n; i++) sceneSec.push(Math.min(999, Math.round((S.fg[i] || 0) / 1000)));
    Object.keys(S.revisits).forEach(function (k) { if (+k < MAX_SCENES) revisits[k] = Math.min(99, S.revisits[k]); });
    var snap = { name: S.name, phone: S.phone, email: S.email, contactMethod: S.contactMethod, ctaAction: S.ctaAction, path: S.path, pathLabel: S.pathLabel, maxDepth: S.maxDepth, totalDepth: S.totalDepth,
      interactions: S.interactions, questions: S.qCount, reactions: S.reactions.slice(),
      booked: S.booked, droppedEarly: S.droppedEarly, backtracks: S.backtracks, startedAt: S.startedAt, lastEventAt: S.lastEventAt,
      lean: S.lean, ctaActions: S.ctaActions.slice(), finished: S.finished, returning: S.returning, smsConsent: S.smsConsent,
      phoneOffered: CFG.phoneOffered !== false, internal: !!CFG.internal, answers: { timing: S.answers.timing || null, experience: S.answers.experience || null },
      sceneSec: sceneSec, revisits: revisits, session: S.session,
      enc: Object.assign({}, S.enc), struggle: compactStruggle(), hovered: S.hovered.slice(), intercepts: S.intercepts.slice(),
      requests: S.requests.slice(), bookingConfirmed: S.bookingConfirmed, checkoutStarted: S.checkoutStarted,
      answerStates: Object.assign({}, S.answerStates), ctx: ctx() };
    var ofs = compactOffers(); if (ofs.length) snap.offers = ofs;
    if (S.answers.direction) snap.answers.direction = S.answers.direction;
    if (S.answers.help) snap.answers.help = S.answers.help;
    return snap;
  }
  /* Where this snapshot came from and what could be measured (Prompt 03).
     Small on purpose: the profile endpoint caps signals at 4 KB.           */
  function ctx() {
    var M = CFG.scenesV3, mid = M && M.manifest ? String(M.manifest).split("@") : [], sf = surfaceNow();
    var lang = CFG.locale || (root.document && root.document.documentElement && String(root.document.documentElement.lang || "").slice(0, 2).toLowerCase()) || null;
    var seen = [], i;
    for (i = 0; i <= S.maxDepth && i < MAX_SCENES; i++) if (S.fg[i] != null) seen.push(S.ids[i] || String(i));
    var elig = null;
    if (M && M.surfaces && sf && M.surfaces[sf]) elig = M.surfaces[sf].sceneIds.filter(function (id, k) { return M.surfaces[sf].eligible ? M.surfaces[sf].eligible[k] !== false : true; });
    var mo = !!root.MutationObserver;
    var c = {
      v: 1, p: mid[0] || null, cv: mid[1] || null, sf: sf, l: lang, route: CFG.route || "full", e: S.session + "-" + S.seq,
      scope: rooted() ? "root" : "document", seen: seen.slice(0, 40), elig: elig ? elig.slice(0, 40) : null,
      unc: Math.round(S.uncertainMs / 1000), fr: friction().version,
      media: S.media.map(function (st) { return { id: st.id, dur: Math.round(st.dur || 0), w: Math.round(watchedSec(st)), pl: st.plays, rs: st.resumes, rp: st.replays, sk: st.seeks, stl: st.stalls, done: !!st.done }; }),
      avail: { visibility: !!(root.document && "visibilityState" in root.document), ack: mo, media: !!mediaSeen, thirdPartyMedia: thirdParty() },
      tx: { q: S.tx.queued, r: S.tx.refused, f: S.tx.fallback }
    };
    if (CFG.experiment && CFG.intercepts) c.x = { id: String(CFG.experiment.id || "").slice(0, 40), arm: offerArm() };
    return c;
  }
  function thirdParty() {
    try { var D = root.document; if (!D || !D.querySelectorAll) return 0; var n = 0; [].forEach.call(D.querySelectorAll("iframe"), function (f) { if (inScope(f) && /youtube|vimeo|wistia|loom/i.test(String(f.src || ""))) n++; }); return n; } catch (e) { return 0; }
  }
  /* Scene configuration from the presentation manifest (Prompt 02). Used only
     under rules 3.0.0, which is still behind its flag: the default 2.1.0 read
     keeps exactly the inputs it had. An explicit PI.config({ scenes }) or
     TENANT.piScenes always wins. The surface is PI.config({ surface }) or, until
     the decks say it (Prompt 03), the one whose scene count matches; the locale
     is PI.config({ locale }) or the page's lang. Anything ambiguous → nothing,
     never a guess that could misnumber the scenes.                          */
  function manifestScenes() {
    try {
      var M = CFG.scenesV3; if (!M || !M.surfaces) return null;
      var sn = surfaceNow(), surf = sn && M.surfaces[sn] ? sn : null;
      if (!surf) {
        var n = +S.totalDepth || 0, hits = Object.keys(M.surfaces).filter(function (k) { return M.surfaces[k].sceneIds.length === n; });
        if (hits.length === 1) surf = hits[0];
      }
      if (!surf) return null;
      var sf = M.surfaces[surf];
      var lang = CFG.locale || (root.document && root.document.documentElement && String(root.document.documentElement.lang || "").slice(0, 2).toLowerCase()) || "";
      var nar = sf.narration && (sf.narration[lang] || null);
      if (!nar) return null;
      return { narration: nar, topics: sf.topics, actions: M.actions, questions: M.questions };
    } catch (e) { return null; }
  }
  function readOpts() { var sc = CFG.scenes || (CFG.rules === "3.0.0" ? manifestScenes() : null) || {}; return { narration: sc.narration, topics: sc.topics, actions: sc.actions, questions: sc.questions, channels: CFG.channels || undefined, internal: !!CFG.internal, rules: CFG.rules }; }
  function readAt(sig, opts) { return (opts && opts.rules === "3.0.0") ? readV3(sig, opts) : read(sig, opts); }
  /* The model's read, with the evidence read riding inside it as `.read`.
     analyze() itself is frozen and never sees it — the golden reads are of
     analyze(), and they do not move. */
  function profile() { var sig = signals(), p = analyze(sig); p.read = readAt(sig, readOpts()); return p; }

  /* ====================  PERSISTENCE — the profile outlives the tab  ====================
     Until 4 Sep 2026 this read lived only in the prospect's browser and reached the
     affiliate only as an alert email; the profiles table had 0 rows. Every read now
     also goes to the venture's pi-profile function, keyed by the same anonymous
     per-browser id the venture's event tracker uses (localStorage
     <storagePrefix>prospect), so the second visit builds on the first and the
     back office can show WHO someone is, not only what they tapped. Consent-gated:
     if the consent module is present and has not been granted, nothing is
     persisted. */
  var PERSIST_URL_DEFAULT = "/.netlify/functions/pi-profile";
  function persistUrl() { return CFG.persist || PERSIST_URL_DEFAULT; }
  var lastPersistAt = 0, visitClaimed = false;
  function prospectKey() {
    if (!consentOk()) return null;   // no identifier is minted without permission
    try {
      var k = localStorage.getItem(PROSPECT_KEY);
      var today = new Date().toISOString().slice(0, 10), day = localStorage.getItem(DAY_KEY);
      if (!k) { k = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem(PROSPECT_KEY, k); }
      // A return visit is this browser coming back on a LATER day. A key with no
      // day beside it predates this stamp: start its clock today rather than guess.
      if (!day) localStorage.setItem(DAY_KEY, today); else if (day !== today) S.returning = true;
      return k;
    } catch (e) { return null; }
  }
  /* ── ANALYTICS PERMISSION FAILS CLOSED ──────────────────────────────────
     11 November 2026 (Prompt 05, D3). The host page decides consent: PI_CONSENT
     is the engine's name for the hook, HSConsent the venture module's. This
     used to return TRUE when no hook was on the page, and two of the four
     presentations never loaded one — so they identified, stored and alerted
     without asking. Now a missing, broken or undecided hook means NO: no
     identifier is minted, nothing is stored or sent, no alert goes out. Only a
     venture that sets TENANT.piConsentRequired = false runs without a hook.
     The presentation itself never waits on any of this. */
  function consentHook() { var c = root.PI_CONSENT || root.HSConsent; return c && typeof c.granted === "function" ? c : null; }
  function consentOk() {
    try { var c = consentHook(); return c ? !!c.granted() : !CFG.consentRequired; } catch (e) { return false; }
  }
  function consentDenied() {
    try { var c = consentHook(); return !!(c && typeof c.state === "function" && c.state() === "denied"); } catch (e) { return false; }
  }
  function persist(reason, force) {
    if (CFG.preview) { if (CFG.debug) log("preview — not persisted:", reason); return; }
    var handle = CFG.rep; if (!handle) return;
    if (!consentOk()) return;
    var key = prospectKey(); if (!key) return;
    var now = Date.now();
    if (!force && now - lastPersistAt < 20000) return;   // scene-by-scene at most every 20s; strong events always
    lastPersistAt = now;
    var intel = profile();
    S.seq++;
    var payload = { handle: handle, prospect: key, event: PERSIST_EVENT[reason] || "scene", newVisit: !visitClaimed, signals: fit(signals()), intelligence: intel };
    if (cap) payload.cap = cap; else capability();
    // The visit is claimed by the first upload the server can accept: with a
    // capability endpoint configured, that is the first one carrying it.
    if (cap || !CFG.session) visitClaimed = true;
    send(persistUrl(), payload);
  }
  /* ── INTAKE CAPABILITY (1.9.0) ───────────────────────────────────────────
     When the venture names an endpoint (CFG.session), the engine asks it once
     per page for a short-lived token bound to this affiliate link, this
     presentation and this browser session, and sends it with every upload.
     It lets the server tell "an upload from a page we served" from "a POST
     from anywhere". It reads nothing, proves no identity, is kept in memory
     only, and is never asked for without analytics permission.            */
  var cap = null, capAsked = 0;
  function capability() {
    if (cap || !CFG.session || CFG.preview || !CFG.rep || !consentOk() || !root.fetch) return;
    var now = Date.now(); if (capAsked && now - capAsked < 30000) return; capAsked = now;
    try {
      var M = CFG.scenesV3;
      root.fetch(CFG.session, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: CFG.rep, session: S.session, presentation: M && M.manifest ? String(M.manifest) : null }) })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (j) { if (j && typeof j.cap === "string" && j.cap.length < 400) cap = j.cap; })
        .catch(function () {});
    } catch (e) {}
  }
  /* The profile endpoint accepts six event names and rejects anything else
     with 400 (D17: "cta_click", "hot_lead" and "consent" were refused, so the
     profile was not saved at the moment that mattered most).                */
  var PERSIST_EVENT = { visit: "visit", scene: "scene", cta: "cta", cta_click: "cta", contact: "contact", hot_lead: "contact",
    finished: "finished", exit: "exit", idle: "exit", question: "scene", reaction: "scene", consent: "visit" };
  /* Keep `signals` under the endpoint's 4 KB cap by dropping what matters
     least first, rather than having the whole upload refused.               */
  var SIGNALS_MAX = 4000;
  function fit(sig) {
    function size() { try { return JSON.stringify(sig).length; } catch (e) { return 0; } }
    if (size() <= SIGNALS_MAX) return sig;
    var c = sig.ctx || {};
    var steps = [function () { c.media = c.media && c.media.slice(0, 2); }, function () { c.seen = null; c.elig = null; },
      function () { sig.hovered = []; sig.intercepts = []; delete sig.offers; }, function () { delete sig.ctx; },
      function () { sig.struggle = {}; sig.enc = {}; }, function () { sig.sceneSec = sig.sceneSec.slice(0, 40); sig.revisits = {}; }];
    for (var i = 0; i < steps.length && size() > SIGNALS_MAX; i++) { steps[i](); if (sig.ctx) sig.ctx.trimmed = i + 1; }
    return sig;
  }
  function send(url, payload) {
    if (!consentOk()) return;      // every upload passes here: profile, alert, retry
    try {
      // sendBeacon returning true means QUEUED by the browser, not stored. When
      // it refuses (too large, too many queued), one fetch with keepalive
      // tries instead. Nothing retries forever and nothing blocks the page.
      var body = JSON.stringify(payload), nav = root.navigator, queued = false;
      if (nav && nav.sendBeacon) { queued = !!nav.sendBeacon(url, new Blob([body], { type: "application/json" })); if (queued) S.tx.queued++; else S.tx.refused++; }
      if (!queued && root.fetch) { S.tx.fallback++; root.fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: body, keepalive: body.length < 60000 }).catch(function () {}); }
    } catch (e) {}
  }


  /* ====================  ALERTS — structured signals only  ====================
     prospect-alert.js accepts a fixed schema and rejects unknown fields; the old
     payload carried emailHtml/emailSubject and was refused with 400 for every
     alert (MANUAL-ACTIONS D4). The email is rendered server-side now. */
  var EVENT_MAP = { cta_click: "cta", finished: "finish", hot_lead: "activity", exit: "activity", question: "question", reaction: "reaction", scene: "scene" };
  var CTA_MAP = { calendar: "calendar", enroll: "enroll", shop: "link", website: "link", link: "link", text: "contact", call: "contact", email: "contact", whatsapp: "contact", social: "contact", contact: "contact" };
  function notify(reason) {
    var r = String(reason || "");
    if (CFG.preview) { if (CFG.debug) log("preview — no alert:", r); return; }
    if (!consentOk()) { forgetHeld(); if (CFG.debug) log("no analytics permission — no alert:", r); return; }
    persist(r, r !== "scene");
    if (!CFG.notify) { if (CFG.debug) log(r + " (no notify URL set)"); return; }

    /* A contact is held, not sent: it is released by whichever comes first of
       finish, CTA, exit, or idle — each of which arrives here as its own
       reason and carries the read as it stands THEN. */
    if (r === "hot_lead") { pendingStrong = "hot_lead"; armIdle(); return; }
    if (pendingStrong && (r === "finished" || r === "exit")) { flushPending(r); return; }
    if (pendingStrong && r === "cta_click") {
      /* A CTA is its own strong alert and carries the contact; one email, not two. */
      pendingStrong = null;
      try { if (idleTimer && root.clearTimeout) root.clearTimeout(idleTimer); } catch (e) {}
      idleTimer = null;
    }

    if ((r === "finished" || r === "exit") && sentStrong) {
      /* Already told once. Say more only when there is more: the prospect
         went a good deal further than the last email said, or has since
         tapped a CTA. Otherwise stay quiet, as before. */
      var moved = ((+S.maxDepth || 0) - sentAt.depth) >= UPGRADE_SCENES;
      var nowBooked = !!S.booked && !sentAt.booked;
      if (!moved && !nowBooked) return;
    }
    deliver(r);
  }
  function forgetHeld() {
    try { if (idleTimer && root.clearTimeout) root.clearTimeout(idleTimer); } catch (e) {}
    idleTimer = null; pendingStrong = null;
  }
  function deliver(r) {
    if (!consentOk()) return;
    var intel = profile();
    // An exit is only worth an email when the read is warm or better; the profile is
    // persisted regardless, so nothing is lost by staying quiet. A released
    // contact alert is the exception — they gave their details; the affiliate
    // must hear it even if the read is cool.
    var contactKnown = !!(S.email || S.phone);
    if (r === "exit" && !contactKnown && !(intel.temperature && (intel.temperature.band === "Hot" || intel.temperature.band === "Molten" || intel.temperature.band === "On Fire" || intel.temperature.band === "Warm"))) return;
    var sig = r + intel.headline + "|" + (S.maxDepth || 0); if (sig === lastSig) return; lastSig = sig;   // de-dupe
    if (r === "hot_lead" || r === "cta_click" || contactKnown) sentStrong = true;
    sentAt = { depth: +S.maxDepth || 0, booked: !!S.booked };
    if (!CFG.rep) return;
    var payload = {
      handle: CFG.rep,
      event: EVENT_MAP[r] || "activity",
      headline: String(intel.headline || "").slice(0, 140),
      prospectName: (intel.prospect && intel.prospect.name && intel.prospect.name !== "(anonymous)") ? String(intel.prospect.name).slice(0, 80) : undefined,
      prospectEmail: (intel.prospect && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(intel.prospect.email || ""))) ? String(intel.prospect.email).trim().slice(0, 160) : undefined,
      prospectPhone: (intel.prospect && /^[0-9+()\-.\s]{7,32}$/.test(String(intel.prospect.phone || ""))) ? intel.prospect.phone : undefined,
      score: intel.temperature ? intel.temperature.heat : undefined,
      stage: intel.stage ? String(intel.stage.label || "").slice(0, 40) : undefined,
      furthestScene: intel.meta ? intel.meta.furthestBeat : undefined,
      totalScenes: (+S.totalDepth || 0) > 0 ? +S.totalDepth : undefined,
      finished: r === "finished" ? true : undefined,
      path: intel.dna && intel.dna.pathChosen ? String(intel.dna.pathChosen).slice(0, 40) : undefined,
      question: S.questions.length ? String(S.questions[S.questions.length - 1]).slice(0, 300) : undefined,
      nextMove: intel.nextBestAction ? String(intel.nextBestAction.headline || "").slice(0, 300) : undefined,
      ctaAction: S.ctaAction ? (CTA_MAP[S.ctaAction] || "other") : undefined,
      // Digital DNA — so the email can show who they are
      archetype: intel.archetype ? String(intel.archetype.name || "").slice(0, 60) : undefined,
      read: intel.archetype ? String(intel.archetype.read || "").slice(0, 200) : undefined,
      temperature: intel.temperature ? intel.temperature.band : undefined,
      motivation: intel.dna ? String(intel.dna.primaryMotivation || "").slice(0, 60) : undefined,
      timing: intel.nextBestAction ? String(intel.nextBestAction.timing || "").slice(0, 40) : undefined,
      probability: intel.conversion ? intel.conversion.probability : undefined,
      confidence: intel.conversion ? intel.conversion.confidence : undefined,
      customer: intel.scores ? intel.scores.customer : undefined,
      builder: intel.scores ? intel.scores.builder : undefined,
      leadership: intel.scores ? intel.scores.leadership : undefined,
      intent: intel.scores ? intel.scores.intent : undefined,
      urgency: intel.scores ? intel.scores.urgency : undefined,
      trust: intel.scores ? intel.scores.trust : undefined
    };
    Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });
    send(CFG.notify, payload);
    if (CFG.debug) log(r, intel.headline, intel.scores);
  }
  function log() { try { console.log.apply(console, ["[PI]"].concat([].slice.call(arguments))); } catch (e) {} }

  /* A session that ends this shallow, with nothing asked for, IS an early drop.
     12 September 2026: `droppedEarly` drives six separate penalties — trust,
     conversion probability, friction, the Precontemplation gate, the
     Window-Shopper archetype, and Fogg ability — and not one of them had ever
     fired, because the only thing that set the flag was PI.track("drop") and no
     consumer has ever emitted it. The flag was written, wired to six places,
     and left dangling.

     Inferring it here rather than asking the experience to declare it is the
     honest place for it: the engine owns the session lifecycle, and "left
     before a fifth of it, having asked for nothing" is a fact about the
     session, not an opinion the host page has to volunteer. */
  function markDropIfShallow() {
    if (S.droppedEarly || S.booked || S.ctaAction) return;
    var total = Math.max(+S.totalDepth || 0, +S.maxDepth || 0, 1);
    if ((+S.maxDepth || 0) / total < DROP_AT) S.droppedEarly = true;
  }
  var DROP_AT = 0.2;

  // fire a final read when the tab goes away (covers normal "finish")
  if (root.addEventListener) root.addEventListener("pagehide", function () { markDropIfShallow(); notify("exit"); });


  /* ====================  PUBLIC API  ==================== */
  root.PI = {
    track: track,
    profile: profile,
    signals: signals,
    finish: function () { if (!S.finished) { S.finished = true; considerIntercept("finished", cur.index); } markDropIfShallow(); notify("finished"); },
    notify: notify,
    config: function (o) {
      if (o && o.paths && typeof o.paths === "object") { PATHS = o.paths; EV.setPaths(o.paths); }
      if (o) for (var k in o) if (k !== "paths" && o[k] != null) CFG[k] = o[k];
      // Identity keys may arrive after load; pick the prospect up now.
      if (o && o.identityKeys) hydrateIdentity();
      return CFG;
    },
    reset: function () { S = fresh(); cur = { index: -1, since: 0 }; taps = []; hoverOn = null; lastSig = ""; sentStrong = false; holds = {}; pendingOffer = null; liveOffer = null; limitsLoaded = false; },
    analyze: analyze,
    present: present,
    PRESENT: PRESENT,
    read: function (sig, opts) { return sig ? readAt(sig, opts || readOpts()) : readAt(signals(), readOpts()); },
    // An experience can confirm an action the page itself cannot see.
    ack: function () { acknowledged("app"); },
    // ── offers (1.12.0) ──
    // The experience proposes an offer of its own (pricing, contact, question…).
    // Same limits and moments as the engine's; true = delivered now.
    offer: function (kind, o) { o = o || {}; var k = String(kind || "").toLowerCase(), end = !!o.atEnd || S.finished;
      return proposeOffer(k, typeof o.scene === "number" ? o.scene : cur.index, o.about, true, end); },
    // Hold offers back while something must not be interrupted (narration, a
    // contact flow, an important control); release makes a waiting one eligible again.
    hold: function (why) { holds[String(why || "x").slice(0, 24)] = true; },
    release: function (why) { delete holds[String(why || "x").slice(0, 24)]; flushOffer(); },
    nextQuestion: nextQuestion,
    RULES: RULES,
    RULES3: RULES3,
    version: 2
  };
  // If permission is granted LATER in this page, save the read as it stands.
  // Registered after everything above exists: a module that already holds a
  // "yes" may call back at once, and an answer given on an earlier page needs
  // nothing caught up, so that case is not registered at all.
  try {
    var c0 = consentHook();
    if (consentOk()) capability();
    if (c0 && !CFG.preview && !consentOk() && typeof c0.whenGranted === "function") c0.whenGranted(function () {
      capability();
      if (S.name) rememberIdentity();
      if (S.maxDepth || S.lastEventAt) persist("consent", true);
    });
  } catch (e) {}
  try { Object.defineProperty(root.PI, "__collector", { value: 1, enumerable: false }); } catch (e) {}
  if (typeof module !== "undefined" && module.exports) module.exports = root.PI;
})(typeof window !== "undefined" ? window : this);
