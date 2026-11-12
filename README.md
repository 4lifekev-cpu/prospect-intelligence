# @kmin/prospect-intelligence

Prospect Intelligence is the engine underneath every KMIN venture experience. It
watches how a prospect moves through an interactive presentation, turns that
behaviour into a structured read — six scores, a stage, an archetype, a
temperature and a next best action — and hands the read to the venture that
owns the prospect.

**It is the one thing the ventures share.** They compete in the same industry
and their field must never see one venture's platform leak into the other's, so
the line is drawn here: the science is shared, and *everything* with a name on
it stays on the venture's side of the line. A test in this package fails the
build if a venture string gets in.

## What is in the package

| Path | What it is |
| --- | --- |
| `src/evaluate.js` | The evaluator: frozen model and evidence reads. Pure; runs in the browser and on a server (`createEvaluator`). |
| `src/engine.js` | The browser collector: lifecycle, signals, storage, consent, alerts. Exposes `window.PI`. |
| `src/config.js` | Configuration contracts: presentation manifest and brand config validators (`pi-presentation-manifest@1`, `pi-brand-config@1`). Node only. |
| `src/profile-shape.js` | The server-side row shape: `toProfileRow(read, ctx)`. Pure. |
| `src/outcomes.js` | Outcome events, the frozen pre-action read, labels, the person-grouped split, the report and presentation quality. Pure; server-side. |
| `schema/profile.json` | The read's contract (`h2-intel-v2`) as JSON Schema. |
| `dist/prospect-intelligence.js` | `evaluate.js` + `engine.js` with a provenance header — what a venture ships. |
| `test/` | Model freeze (golden reads), boundary, engine behaviour, row shape. |

## The boundary

Nothing in `src/`, `dist/`, `schema/` or the docs may name a company, product,
brand, domain, person or storage key that belongs to a venture. Everything a
venture needs to say about itself arrives through two seams and nowhere else:

**`window.TENANT`** — the venture's generated tenant record, loaded before the
engine. The engine reads three fields from it:

| Field | Purpose |
| --- | --- |
| `storagePrefix` | Namespaces the engine's two localStorage keys (`<prefix>prospect`, `<prefix>prospect_id`), so two ventures on one origin never read each other's prospect. Falls back to `pi_`. |
| `piPaths` | The venture's path vocabulary: `{ pathKey: { motivation, lean } }`. |
| `piIdentityKeys` | `{ name, email }` — the localStorage keys the venture's own deck writes when a prospect introduces themselves, so the engine can pick them up. |

**`PI.config({...})`** — at runtime: `notify`, `persist`, `rep`, `email`,
`site`, `closer`, `identityKeys`, `paths`, `preview`, `debug`.

`preview` (also `?preview=` on the address) computes the read and sends
nothing — for an affiliate watching their own presentation.

Consent is the host page's decision: if `window.PI_CONSENT` (or the older
`HSConsent`) exists and `granted()` is false, nothing is persisted.

## Instrumenting a presentation

Mark the presentation's root (and any overlay it opens) with
`data-pi-root="<surface>"`. Send the scene's stable id with each scene:
`PI.track("scene", { index, total, sceneId, surface })`. Tag calls-to-action
with `data-pi-cta="<action>"` and media with `data-pi-media="<id>"`. A control
whose result the page cannot see (a new tab, an external app) can confirm it
with `PI.ack()`. Each snapshot's `ctx` block records the presentation, the
scenes seen and eligible, media actually played, what could not be measured,
and how uploads went.

## Showing a read

`PI.analyze()` is the model and the model is frozen. What a room is *allowed to
render* is a separate decision, and it lives in one function.

**`PI.present(scores, confidence)`** → `{ ready, confidence, gate, anchor, scores }`

Every score is a sigmoid with a negative intercept, so the model's floor is not
zero — a visitor who opens a link and closes it reads 35. And an experience that
asks for a name and a path before it shows anything hands the model two taps
worth +1.1 on customer fit. The commonest sessions in any deployment therefore
produced cards in the 55–80 range that nobody had earned.

`present()` shrinks each score toward `anchor` (what a stranger deserves) in
proportion to the model's own `confidence`, and returns `ready:false` below
`gate`. A caller that gets `ready:false` must say what it *does* have —
"3 of 24 screens, 40 seconds" — rather than print a number.

It takes the two values instead of a whole read on purpose: a consumer can call
it with columns off a stored row exactly as easily as with a live read, so one
function repairs the rows already in a database as well as the next one.

```js
var view = PI.present(row.scores, row.confidence);
if (!view.ready) renderEvidenceInstead(row);
else renderBars(view.scores);
```

**`PI.PRESENT`** — `{ gate, anchor }`, exposed so a consumer's tests can assert
against the same constants rather than copying them.

## The evidence read (rules 2.0.0)

`PI.read()` is the read meant to replace the model's. It runs beside it today:
`PI.profile().read`, and `profile.read` in a stored row.

| | The model (`analyze`) | The evidence read (`read`) |
|---|---|---|
| Arithmetic | sigmoids with intercepts and hand-set weights | additive points, visible in `PI.RULES` |
| Nothing observed | 31–35 on every score | 0 on every score |
| A required name | ×1.6 on "% likely", +0.7 on trust | nothing |
| "Watched" | the furthest scene reached | scenes in the foreground long enough to have been watched |
| Any link tap | `booked` → "The Ready-Now" | a request only if it asks for contact or enrolment |
| Says how sure | "confidence" (evidence volume) | `evidence.strength`, plus `rules.status` |
| Probability | "% likely" | none, until outcome data earns one |
| Language | English sentences | codes a consumer renders |

```js
var r = PI.read();
r.band                       // "molten"
r.dims.intent                // { measured:true, score:52, reasons:[{code:"views",pts:22},{code:"finished",pts:10},{code:"asked_contact",pts:20}] }
r.dims.urgency               // { measured:false, why:"not_asked" }
r.evidence                   // { strength:"solid", qualified:17, total:23, share:74, types:[…] }
r.approach                   // { key:"ready_now", name:"The Ready-Now", rule:"asked_next_step" }
r.action                     // { timing:"within_hour", opener:"ask_about_business" }
r.wouldChange                // [{ if:"tapped_enroll", band:"molten", intent:77 }, { if:"no_reply_3d", band:"warm" }]
r.rules                      // { version:"2.0.0", status:"unvalidated" }
```

A venture tells the engine about its scenes once, through its tenant record
(`TENANT.piScenes`) or `PI.config({ scenes })`:

```js
PI.config({ scenes: {
  narration: [8, 22, 14, …],                  // seconds of narration per scene index → the viewing threshold
  topics:    [null, null, "business", "product", …],   // which scenes make which case
  actions:   { business: ["enroll"], product: ["shop"] }
}, phoneOffered: true });
```

Without `topics` the two interest scores say `notes:["topics_not_configured"]`
and leave those points out; without `narration` every scene needs 4 seconds.
Per-scene seconds are stored in the signal snapshot, so both can be supplied
later and old rows replayed.

### Behaviour signals and intercepts (rules 2.1.0)

The engine listens on the document for taps, pointer movement, hovers on
`data-pi-cta` elements, and play/ended on media a person controls. Nothing to
wire for those. An experience reports the rest:

```js
PI.track("share"); PI.track("save"); PI.track("faq"); PI.track("host_panel_open");
PI.config({ intercepts: true });                        // opt in, once the experience can render an offer
document.addEventListener("pi:intercept", function (e) {
  // e.detail = { kind: "help" | "walkthrough" | "send_media" | "share_link", scene, topic }
  // render the offer in the experience's own words and language, then:
  PI.track("intercept", { kind: e.detail.kind, answer: "yes" });   // or "no" | "dismissed"
});
```

`read().observed.encouraged` and `.struggled` list what happened. Neither
moves a score. A yes to `help` or `walkthrough` counts as asking for contact.

### Rules 3.0.0 (behind a flag)

`PI.config({ rules: "3.0.0" })` switches `PI.read()` and `PI.profile().read` to
schema `pi-read-v4`. Lead with `request` (what they asked for), then
`declared`, then `observed`, then `action`; the temperature and dimensions are
supporting detail. Every code is defined, with its allowed wording, in
[`signals.json`](signals.json). Experiences that ask for a human response send
`PI.track("contact_request", { channel: "email" })` or `PI.track("callback", { channel: "call" })`;
a scheduler that confirms a booking sends `PI.track("booking_confirmed")`.

**Every weight is a hypothesis.** Until outcomes are recorded and a validation
gate is passed, a consumer must not present this read as a prediction.

## Consuming it


A venture does not install this from a registry. It vendors the built file and
checks it in, so its deploy never reaches outside its own repository:

```
<script src="/assets/tenant.js"></script>
<script src="/assets/prospect-intelligence.js"></script>
```

Vendoring is one command, the same for every consumer, run from this
repository:

```
node tools/vendor.mjs --consumer ../the-site            # write the files and the pin
node tools/vendor.mjs --consumer ../the-site --check    # fail if anything differs
```

The consumer keeps one small file, `pi.consumer.json`, that says where each
artifact goes in its own tree (`dist/prospect-intelligence.js`,
`src/evaluate.js`, `src/config.js`, `src/profile-shape.js`, `src/outcomes.js`,
the golden sets). The tool writes `pi.lock.json` beside it:

- `sha256` — one hash per artifact. Two consumers on the same release have the
  same hashes here, which is how "both sites run the same core" is checked.
- `files` — one hash per vendored file, which the consumer's own tests verify
  without needing this repository.

The vendored file is a *projection* of the package, never a fork of it.

The read the venture receives, and the row `toProfileRow()` produces from it,
are described in `schema/profile.json` and `src/profile-shape.js`
(`ROW_COLUMNS`). A venture's migration for its profiles table should be
asserted against `ROW_COLUMNS`, not re-typed.

## What the engine sends

To `persist` (default `/.netlify/functions/pi-profile`), the whole read:
`{ handle, prospect, event, newVisit, signals, intelligence }`.

To `notify` (default `/.netlify/functions/prospect-alert`), a flat summary a
mailer can render without trusting markup from a browser: handle, event,
headline, prospect name / phone / email, score, stage, temperature, archetype,
next move, the six scores. **No HTML ever leaves the browser.** The email is the
venture's; the engine only reports.

`handle` is the affiliate's handle from `?u=` — never a display name. A venture
that passes `PI.config({ rep: someone.name })` will have every alert rejected at
validation, and it will look like a security event, not a delivery failure.

## Rules

- **The model is frozen.** `test/golden.json` holds reads the engine produced
  in production on 5 Sep 2026. A change to any of them is a schema bump and a
  CHANGELOG entry, not an edit.
- **Zero dependencies.** This package touches prospect data.
- **No venture strings.** The boundary test enumerates them; add a venture to
  the list the day it starts consuming the engine.
- **Never edit `dist/`.** `npm run build` writes it; `node build.mjs --check`
  fails when it is stale. The header is a pure function of (version, source),
  so a consumer can compare bytes.

## Layers

| Layer | Where | Knows about |
| --- | --- | --- |
| Evaluator | `src/evaluate.js` | Normalized signals, a rule version, a path vocabulary. Nothing else. |
| Collector | `src/engine.js` | The browser: events, foreground time, storage, consent, delivery. |
| Contracts | `src/config.js`, `schema/` | The shape of manifests, brand configs and stored rows. |
| Adapters | each venture | Its deck's events, its storage, its alert endpoint, its UI. |
| Renderers | each venture | Turning codes into the brand's words and the visitor's language. |

## Releasing

1. Change `src/`, add tests, run `npm run verify`.
2. Bump `version` in `package.json`; write the CHANGELOG entry; if it changes
   how the engine behaves, add an entry to `docs/DECISIONS.md`.
3. `npm run build` writes `dist/` and `release.json` (the hash of every
   artifact). Commit `src/`, `dist/`, `release.json`, `test/` and the docs together.
4. For each consumer: `node tools/vendor.mjs --consumer <its checkout>`, run its
   full test suite, and commit the vendored files with a message that names the
   release. Every consumer moves to the same release on the same day.

`release.json` is byte-reproducible: the same source always gives the same
hashes.

## Where this came from

The engine was extracted in place inside its first consumer, so that
consumer's tests could prove the extraction changed nothing, and moved to this
repository at 1.11.0. No consumer holds a copy of `src/` any more; they hold
vendored files and a pin.
