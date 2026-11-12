// GENERATED — do not edit. Vendored from @kmin/prospect-intelligence 1.13.0 (src/evaluate.js) by tools/vendor.mjs. Change the package, then re-vendor.
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
        // The answer later is real but unscored: it is reported as given, never as not asked.
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
