# Changelog

## 1.12.1 — 2026-11-11

- Two code comments quoted phrases that a consumer's visible-copy check read
  as new wording. Reworded; no code change. A test now fails if a line comment
  in the bundle would read as visible wording to that kind of check.

## 1.12.0 — 2026-11-11

**Careful intercepts and better questions (Prompt 08). Every existing read is unchanged: all golden sets reproduce exactly.**

- **Offered is not shown.** The experience reports each offer's life with
  `PI.track("offer", { kind, stage })`, stage `shown | dismissed | accepted |
  requested | fulfilled`. The two-per-visit limit, never-twice and the 90-second
  spacing count SHOWN offers only. A snapshot carries `offers` (per kind:
  times offered, shown, outcome, requested channel, fulfilled) when there are any.
- **One delivery.** `PI.config({ intercept })` or the `pi:intercept` event,
  never both; a second `shown` is ignored.
- **Natural moments.** Delivered at a scene boundary or the finish; never
  mid-scene, with a form field focused, during `PI.hold(reason)`, over another
  offer, in preview, or without analytics permission. `PI.release(reason)`
  lets a waiting offer through.
- **Information is not contact.** Kinds `help`, `walkthrough`, `pricing`,
  `send_media`, `share_link` open content and never become a request under any
  rule version (accepted is recorded as `info`, not `yes`). Kind `contact` is a
  request only at stage `requested`, after a yes, with a channel the prospect
  can be reached on; it alerts once. `PI.offer(kind, { scene, about })` lets the
  experience propose one, under the same limits.
- **Dismissal scores nothing.** A share or a send counts at `fulfilled`, not at yes.
- **Short experiences** (under 6 scenes) are not interrupted; one optional
  question at the end is allowed.
- **Limits survive a reload** (same browser, same day).
- **Registered experiment required.** `PI.config({ intercepts: true,
  experiment: { id, holdoutPct } })` or `TENANT.piIntercepts` +
  `TENANT.piExperiment`. The holdout arm is offered nothing; `ctx.x` carries the
  arm, computed exactly as `outcomes.arm()` does.
- **Questions.** `answer` now accepts `direction` (products, business, both,
  exploring), `timing` (now, month, later, looking) and `help` (product_info,
  business_info, cost, conversation, nothing), each with skipped / declined.
  `PI.nextQuestion()` names the one question still worth asking. A stated
  direction sets the lean only when no path was chosen.
- **Evaluator, new inputs only.** `later` is reported as answered and unscored
  (2.1.0: `why: "answered_unscored"`; 3.0.0: measured self-report, no score)
  instead of "not asked". Rules 3.0.0 accept a request of kind `intercept`
  with its channel.
- `PI.track("intercept", { kind, answer })` from an older experience behaves as before.

## 1.11.1 — 2026-11-11

- `tools/compare.mjs`: runs the golden journeys through two or more consumers'
  vendored evaluators. Fails if the core differs; lists, without failing, what
  differs because of each site's own configuration.

- A code comment in the collector quoted a phrase that a consumer's
  visible-copy check read as new wording. Reworded; no code change.

## 1.11.0 — 2026-11-11

**The engine has its own repository. No behaviour change.**

- `tools/vendor.mjs`: one vendor-and-check tool for every consumer, driven by
  the consumer's `pi.consumer.json`; writes `pi.lock.json` with a hash per
  artifact (equal across consumers) and per vendored file.
- `release.json`: the hash of every artifact, written by `npm run build` and
  checked by `node build.mjs --check`.
- `docs/DECISIONS.md`: the brand-neutral log of behaviour decisions.
- The bundle's header no longer names a path inside a consumer, so its hash
  differs from 1.10.0 although `src/` does not.

## 1.10.0 — 2026-11-11

**Outcomes (Prompt 10). The engine and both reads are unchanged.**

- **`src/outcomes.js`** (pure, server-side). Nine outcome kinds as events;
  verification decided by the source (`affiliate_reported`,
  `provider_verified`, `import_verified`), never by the caller. `freeze()`
  takes the latest eligible read before the first outreach, intercept or
  outcome; `assertNoLeakage()` rejects anything later. `label()` separates
  positive, negative, censored (window still open) and unknown (nothing
  recorded) for three distinct targets — conversation, purchase, enrollment.
  `build()` groups a prospect's visits into one row; `split()` keeps a person
  on one side. `report()` is per tenant and per presentation, suppresses cells
  under ten known cases, reports explicit-request and completion baselines
  beside the bands, carries the reference's gates A/B/C as minimum milestones,
  and says "insufficient" until gate A. No probability and no causal wording.
  `quality()` is the presentation view; `arm()` / `impact()` are the
  registered randomized holdout for intercepts.

## 1.9.0 — 2026-11-11

**Intake capability and visible truncation (Prompt 04). The 2.1.0 read is unchanged.**

- **Capability.** With `TENANT.piSession` (or `PI.config({ session })`) set, the
  engine asks that endpoint once per page for a short-lived token and sends it
  as `cap` with every profile upload. Asked only with analytics permission and
  never in preview; held in memory only. Until it arrives, uploads go without
  it and do not claim the visit. Unset = no request, as before.
- **profile-shape.** `toRead` reports what it cut: `truncated: { lists, keys,
  depth, values }`, a `<list>Total` beside a cut list, and the identity fields
  of a read are kept ahead of any others. `LIMITS` is exported. Every golden
  read at 2.1.0 and 3.0.0 passes through uncut.

## 1.8.0 — 2026-11-11

**Presentation instrumentation (Prompt 03). The default 2.1.0 read is unchanged; corrections that would move it are under rules 3.0.0.**

- **Scope.** Elements marked `data-pi-root` are the presentation. Once a page
  registers one, taps, pointer moves, hovers, input and media outside it are
  not collected; the value names the surface (`phone`, `desktop`). A page with
  no root keeps whole-document listening and says so (`ctx.scope`).
- **Identity.** `PI.track("scene", { index, total, sceneId | key, surface })`.
  Every snapshot carries `ctx`: presentation id and content version (from the
  manifest), surface, locale, route, an event id (session + sequence), the
  scene ids seen and the scene ids eligible on that surface — so a coverage
  figure can always show its denominator.
- **Friction, named for what it is (D9).** `unhandled` = a tap on a surface
  that is not a control. `deadctl` = a control (link, button, `data-pi-cta`)
  that got no acknowledgement: no navigation, scene change, page change,
  media start or busy state within 1.5 s; `aria-busy` extends that to 10 s;
  no MutationObserver means it is never called dead. `errtap` = a script error
  within 2 s of a tap, with no message kept. Under 2.1.0 `dead` keeps its old
  meaning; under 3.0.0 it means a dead control. Rage, thrash and acknowledgement
  thresholds are configurable only inside fixed bounds (`PI.config({ friction })`).
  `PI.ack()` lets an experience confirm an action the page cannot see.
- **Media (D11).** Per item: id, duration, seconds actually played (merged
  ranges — a seek to the end adds nothing), plays, resumes, replays, seeks,
  stalls. Completion needs 90 % played. A replay is a restart after real
  viewing; a resume near the start is not one. Looping background clips and
  cross-origin players are excluded (the latter counted as unknown). The
  legacy media rules still apply under 2.1.0.
- **Idle and lifecycle.** Foreground time stops on hide, on pagehide, and
  restarts once on a back/forward-cache return. Quiet stretches past two
  minutes with no input and no media playing are recorded as uncertain; under
  3.0.0 they are also left out of the scene's time. Touch, keys, wheel and
  scroll count as input. A second copy of the engine on one page does nothing.
- **Transport (D17).** The profile endpoint accepts six event names and
  rejected `cta_click`, `hot_lead` and `consent` with 400, so the profile was
  not saved at the CTA. Uploads now use the endpoint's names. A refused beacon
  falls back to one keepalive request. `signals` is trimmed, least important
  first, to stay under the endpoint's 4 KB cap. A visibility change to hidden
  saves a checkpoint.
- The frozen model and every golden set are unchanged.

## 1.7.0 — 2026-11-11

**The product boundary (Prompt 02). No change to any read.**

- `src/evaluate.js` — the frozen model and both evidence reads, moved out of
  `src/engine.js` unchanged. Pure: no DOM, storage, network, environment,
  module loading, venture or model service. `createEvaluator({ paths })`
  returns `analyze`, `present`, `read`, `readV3`, `readAt`. The same file is
  required on a server and bundled first in `dist/` (as `window.PIEvaluate`),
  so browser and server run identical bytes; a test compares them on every
  golden fixture.
- `src/engine.js` is now the browser collector. If the evaluator is missing it
  installs a no-op `PI` and the presentation carries on.
- `src/config.js` — two versioned contracts, both data only:
  `pi-presentation-manifest@1` (stable scene ids, topic per scene, narration
  seconds per locale, how each surface numbers its scenes, CTA meanings,
  questions, approved content) and `pi-brand-config@1` (ids, display tokens,
  terminology, domains, pinned manifests, channels, policy versions, rule
  version, boolean flags, and a `server` section holding environment variable
  NAMES only). Code, formulas, secret-shaped keys or values, unknown keys and
  free-form rule versions are refused. `toScenesConfig()` turns a manifest into
  the arrays the evaluator already takes; `browserView()` drops `server`.
- The engine reads `TENANT.piScenesV3` (built from a manifest) **only under
  rules 3.0.0**, which stays behind its flag. The surface comes from
  `PI.config({ surface })` or a unique scene-count match; the locale from
  `PI.config({ locale })` or the page's `lang`. Anything ambiguous gives no
  scene configuration rather than a misnumbered one. The default 2.1.0 read is
  byte-identical with or without a manifest (tested).
- `npm run release` checks the build, runs the tests and packs a tarball;
  `npm pack` output is byte-reproducible (verified twice, same sha256).
- All golden sets unchanged.

## 1.6.0 — 2026-11-11

**Privacy: nothing is recorded or sent until the visitor says yes (D3).**

Before this release the engine stored a visitor's progress, remembered their
name, posted their profile and sent the affiliate an alert whether or not they
had answered the consent banner. The banner also said "behaviour only — no
name, no email", which was not true: an alert carries both.

- Consent is required by default and **fails closed**. The engine asks
  `window.PI_CONSENT` (a test or host hook) or `window.HSConsent` (the site's
  consent module). No hook, no answer, or a hook that throws all mean "no".
- Until consent is granted: no profile is persisted, no prospect key is minted,
  the name is not remembered, no alert is queued or delivered. Viewing still
  works; the presentation is unaffected.
- When consent is granted later in the visit, the engine registers with
  `whenGranted()` and persists what it has, so a visitor who says yes at
  scene 5 is not treated as a first-time visitor.
- When consent is withdrawn, any held alert is cancelled and the in-memory
  session is wiped.
- A venture with its own consent arrangement can set `piConsentRequired: false`
  in its tenant record. Only the boolean `false` turns the requirement off.
- `?preview=` never registers a consent callback.
- The frozen model and every golden set are unchanged.

Outside the package, in the same change: desktop decks load the consent module
and their event forwarder waits for consent; the banner text (EN, ES) now says
plainly what the person who shared the presentation will see; and migration
0038 extends `erase_prospect()` to the affiliate CRM tables.

## 1.5.1 — 2026-11-10

**Security: the alert endpoint can no longer be set from the page link (D15).**

An alert carries a prospect's name, email and phone. The engine read its alert
endpoint from `?notify=` in the address, and before that from
`window.PI_NOTIFY_URL` / `HS_NOTIFY_URL` / `H2_NOTIFY_URL`, so anyone who could
hand a prospect a link could have those details posted to an address of their
choosing.

- The endpoint now comes only from `window.TENANT.piNotify` (the venture's
  generated tenant record) or `PI.config({ notify })`, which wins.
- `?notify=`, `?email=` and `?site=` are ignored. Only `?u=` (the affiliate
  handle, resolved server-side) and `?preview=` are read from the link.
- The window globals are no longer read.
- With neither the record nor config set, **no alert is sent** — the engine
  does not guess an address. The profile is still persisted.
- The frozen model and every golden set are unchanged.

Consumers must set the endpoint in their tenant record. The first consumer
uses `integrations.prospectIntelligence.endpoints.notify`, restricted by its
tenant schema to a same-site path.

## 1.5.0 — 2026-11-10

**Rules 3.0.0 (schema `pi-read-v4`), behind a flag.** 2.1.0 stays the default
and stays replayable; `analyze()` and every golden set from earlier versions
are byte-for-byte unchanged. Select 3.0.0 with `PI.config({ rules: "3.0.0" })`
or `PI.read(signals, { rules: "3.0.0" })`.

3.0.0 keeps 2.1.0's weights where they were sound and changes what the read is
allowed to claim (Prompt 01 of the build pack; defects D5–D8, D10, D12, D13 in
`docs/prospect-intelligence/BASELINE-00.md`):

- **Requests are separate from temperature.** `request.state` is `none`,
  `next_step` (opened a contact link, calendar or enrollment page),
  `requested` (explicit wording asking for a human response: a contact form,
  a callback, or a `contact` intercept answered yes) or `confirmed` (a booking
  the scheduler confirmed). Only `requested` and `confirmed` set
  `permitsContact`. `temperature.band` is `insufficient`, `cool`, `warm`,
  `hot` or `excluded`.
- **Help, explanation, pricing, sharing and saving are self-service.** A yes
  to `help`, `walkthrough`, `pricing`, `share_link` or `send_media` is not a
  request.
- **Clicked is not confirmed.** `outcomes.booking` is `unconfirmed` until
  `booking_confirmed`; `outcomes.enrollment` and `outcomes.purchase` are
  `unverified` from the browser, always. `checkout_started` is its own fact.
- **Explicit states on every dimension:** `measured` (a zero is a zero),
  `insufficient`, `unavailable`, `not_asked`, `skipped`, `declined`, `excluded`.
- **Coverage scales with the experience:** sufficient when the qualified views
  reach `min(3, ceil(eligible × 0.5))` and total at least 8 seconds. A two-scene
  teaser can be read. A request is actionable at any coverage.
- **The intent index is labelled** (`kind: "rules_index"`) and carries
  `ceilingWithoutRequest`: 40 on a first visit, 55 after a later-day return.
  It is never a percentage. Weights are unchanged.
- **Openness is measurable without a phone field** (an email request counts);
  channels offered and requested are recorded separately from the score.
  A phone number or SMS permission never moves intent.
- **One tap is one fact:** repeated taps, and a request that arrives by two
  routes, count once. Reasons always sum to the score; a cap would appear as
  its own negative reason (unreachable under current weights).
- **Questions are a bounded count.** The typed words never enter the stored
  snapshot; the latest is held in memory for the alert email only.
  `signals().questions` is now a number (the frozen model reads numbers).
- **Experience is a self-report** (`dims.experience`), never leadership.
- **`approach.describe`** says what the prospect did and is the primary label;
  `key` and `name` keep the legacy archetype for compatibility.
- **No claim about the future:** `wouldChange` no longer lists "no reply in 3 days".
- Bounded lists carry true totals (`encouragedTotal`, `struggledTotal`).
- New events: `contact_request` and `callback` (with `channel`),
  `booking_confirmed`, `checkout_started`, and `answer` values `skipped` /
  `declined`. Config: `rules`, `channels`, `scenes.questions`.
- **`signals.json` — the signal dictionary:** every code 3.0.0 can emit, with
  its event, detector, evidence category, alternative explanations, allowed
  display wording, score contribution and validation status. A test fails if
  the read emits a code the dictionary lacks.
- `toProfileRow()` stores `pi-read-v4` as well as `pi-read-v3`.

Fogg, Prochaska and Cialdini remain in the frozen model as documented design
hypotheses; nothing in 3.0.0 treats their product as a measurement.

## 1.4.0 — 2026-11-10

**Behaviour signals and intercepts (rules 2.1.0).** Two lists, kept apart on
purpose, both observed and shown, neither scored until outcome data shows one
predicts something.

- **Encouragement** — effort the prospect did not have to spend:
  `share`, `save`, `host` (opened the host's details), `diligence` (FAQ,
  disclosure, comparison), `interact`, `media_replay`, `media_done` (a video of
  10s or more watched to the end), `resume` (back after 5+ minutes away,
  mid-presentation), and `lingered` (a scene on screen twice its narration, or
  45s with none). Media is tracked only when a person controls it: a muted,
  looping background clip is ignored.
- **Struggle** — friction, per scene: `rage` (≥4 taps, each within 200px and
  300ms of the last), `dead` (a tap on nothing interactive that changes nothing
  for 700ms), `thrash` (≥6 pointer reversals at ≥4 px/ms within 1.5s, mouse
  only). The rage and thrash thresholds follow the published definitions of a
  mainstream experience-analytics product so they can be named and compared.
  What they measure is that the page failed this person somewhere — not what
  the person is like.
- **Hover** on any element marked `data-pi-cta="…"` for 800ms or more.
- In the read: `observed.encouraged`, `observed.struggled`, `observed.hovered`,
  `observed.intercepts`, and a `voluntary` evidence type. The suggested opener
  now offers help with where they struggled before anything else.
- **Intercepts — ask instead of guessing.** At four moments the engine tells
  the experience it MAY offer something: `help` (struggled), `walkthrough`
  (back to the same scene twice), `send_media` (replayed a video),
  `share_link` (finished). It dispatches `pi:intercept` on the document (and
  calls `PI.config({ intercept })` if given) with `{ kind, scene, topic }`, and
  writes no words. The experience reports the answer with
  `PI.track("intercept", { kind, answer: "yes" | "no" | "dismissed" })`.
  Off unless `PI.config({ intercepts: true })`; never in preview; never before
  scene 3; at most two per session; never the same kind twice; 90s between offers.
- **A YES to `help`, `walkthrough` or `pricing` scores as a request for
  contact** — the one behaviour-led signal that scores from day one, because
  the prospect said it in their own tap. A yes to `share_link` or `send_media`
  is encouragement, not a request.
- `PI.track("share" | "save" | "host_panel_open" | "faq" | "disclosure" | "compare")`.
  The presentations already send `host_panel_open`; it now counts.

All 2.0.0 scores and bands are unchanged: the eleven golden cases land in the
same bands with the same points. `golden-read.json` is regenerated because the
read gained fields. `analyze()` is untouched; the nine model golden reads still
reproduce.

## 1.3.0 — 2026-11-09

**The evidence read (rules 2.0.0, schema `pi-read-v3`) — runs beside the model; nothing a consumer renders changes yet.**

An audit of both ventures that share this engine found that nothing the v2
model says has ever been compared with what a prospect went on to do. No
outcome is recorded anywhere. And in the source: the "% likely" is a 12% prior
multiplied by hand-set factors (×1.6 for a name that the experience requires);
the leadership score has no leadership input; `PI.track("back")` is sent by no
experience, so `backtracks` was 0 for every prospect who ever went back; and a
tap on any link at all — a website, a social profile — sets `booked` and
produces "The Ready-Now". The model can be explained. It cannot be validated,
and so it cannot be defended.

- **`PI.read(signals?, opts?)`** — an additive scorecard. No intercepts, so
  nothing observed scores nothing. A required field earns nothing. Every point
  carries a reason code and the reasons sum to the score. What could not be
  measured is `measured:false`, never 0. There is no probability. The read
  reports `rules.status: "unvalidated"` and a consumer is expected to print it.
  Codes, not sentences: the engine still names no venture, and now speaks no
  language either.
  - Dimensions: `intent`, `customer` and `builder` (interest, not "fit" or
    "potential"), `openness` (was "trust"), `urgency` (their own answer to one
    question, or not measured). Leadership is withdrawn as a score; an
    experience may ask and the answer is shown as their answer.
  - Bands: `none` · `cool` · `warm` · `hot` · `molten` (an explicit request
    after a real viewing) · `request` (a request without one) · `excluded`.
  - `evidence.strength`: `thin` · `partial` · `solid` — how much there was to go
    on. This replaces "confidence", which was always evidence volume and never
    the chance of being right.
  - `approach`: the archetype names survive, each as a stated rule
    (`ready_now` ⇐ `asked_next_step`) — how to approach someone, not who they are.
  - `wouldChange`: computed by re-running the rules with one fact flipped.
- **`PI.RULES`** — every weight and threshold, in one object. **All of them are
  hypotheses**, written down before any outcome was seen. Change one only at a
  validation gate, with a version bump and a new `golden-read.json`.
- **Foreground time per scene.** The engine now keeps its own clock: the time
  each scene was on screen while the page was visible. A scene counts as a
  *qualified view* at half its narration length, never under 4 seconds.
  Scrubbing a deck, or leaving a hands-free one running in a background tab,
  no longer reads as watching it.
- **Going back is inferred** from the scene index, so `backtracks` and
  `revisits` are real without any change to an experience.
- **A return visit** is the same browser on a later day (`<prefix>prospect_day`).
- **`PI.track("answer", { key, value })`** — `timing`: `now|month|looking`;
  `experience`: `yes|no`. A closed vocabulary; nothing free-form is kept.
- `PI.track("contact", { smsConsent: true })`, `PI.config({ scenes, phoneOffered, internal })`,
  and `TENANT.piScenes`.
- The signal snapshot grows (`sceneSec`, `revisits`, `ctaActions`, `lean`,
  `finished`, `returning`, `answers`, `session`…), bounded to fit the 4 KB the
  persistence endpoint allows. Because the per-scene seconds are stored, **a
  stored row can be replayed through a later rules version.**
- **`toProfileRow()` stores the read at `profile.read`** — inside the existing
  JSON column. No new column, no migration. `toRead()` reduces whatever a
  browser sent to finite numbers, booleans and short code strings.

`analyze()` is untouched and all nine golden reads reproduce exactly. The
header no longer calls the model "validated".

**Not in this release, on purpose:** no consumer renders the new read. The
back office and the alert email still show the model. That switch is its own
change, with its own wording review.

## 1.2.2 — 2026-11-11 (hotfix line, merged to `main` as PR #17)

**Fix: the profile is saved at a CTA again (D17).** The profile endpoint
accepts the events `visit, scene, cta, contact, finished, exit` and rejects
anything else with 400. The engine sent `cta_click` (after a CTA) and
`hot_lead`, so those saves were refused and the profile was stored only at the
next scene change or exit. Uploads now use the endpoint's names. Nothing else
changes; the frozen model and the golden set are untouched.

## 1.2.1 — 2026-11-10 (hotfix line, merged to `main` as PR #16)

The D15 fix of 1.5.1, applied to 1.2.0 alone and deployed to production on
11 Nov 2026. Identical behaviour to 1.5.1; recorded here so the version
history is complete.

## 1.2.0 — 2026-09-12

- **`PI.present(scores, confidence)`** — the separation of what the model thinks
  from what a consumer may render. Additive; `analyze()` is untouched and every
  golden read still reproduces exactly.

  Every score is a sigmoid with a negative intercept, so the model's floor was
  never zero: a visitor who opened a link and closed it read 35 customer, 35
  trust. And because an experience typically asks for a name and a path before
  it shows anything, those two taps were worth +1.1 on customer fit or +1.3 on
  builder — so the two commonest sessions in any deployment, the bounce and the
  two-tap bounce, produced cards in the 55-80 range. Consumers rendered those
  numbers beside the `confidence` figure the engine had already computed for
  them (0% for the ghost, 39% for the two-tap bounce) and nobody read the
  second one.

  `present()` shrinks each score toward `PRESENT.anchor` in proportion to that
  confidence, and returns `ready:false` below `PRESENT.gate`, where a consumer
  is expected to show the evidence it actually has instead. It takes scores and
  confidence rather than a whole read, so it repairs rows already stored in a
  database as well as the next one computed.

  `anchor` (15) is a judgement about what a stranger deserves, not a measured
  base rate. It should be revisited against real conversion data.

- **`PI.PRESENT`** exposed so consumers can test against the same constants.

## 1.1.0 — 2026-09-05

- `preview` mode: `?preview=` on the address, or `PI.config({ preview: true })`,
  makes the engine compute the read and send nothing — no profile persisted,
  no alert. For an affiliate walking through their own presentation, who
  until now was emailed an alert about themselves and had a real profile
  written under their own account every time they checked their link.
  The model is unchanged; the golden reads still pass.

## 1.0.0 — 2026-09-05

Extracted from the first consumer's `assets/prospect-intelligence.js` (496
lines, schema `h2-intel-v2`) into a package of its own.

**The model is byte-identical.** `test/golden.json` was generated from the
live pre-extraction engine and the extracted engine reproduces every read
exactly, from `src/` and from `dist/`.

Changed at the boundary, deliberately:

- Storage keys are derived from `TENANT.storagePrefix` (fallback `pi_`) instead
  of being hardcoded to one venture's prefix. With the first consumer's tenant
  record loaded, the keys resolve to the same strings as before, so no
  prospect's stored identity is orphaned.
- The two localStorage keys a venture's deck writes for the prospect's name and
  email arrive through `TENANT.piIdentityKeys` / `PI.config({ identityKeys })`
  instead of as literals.
- The path vocabulary can also be supplied through `PI.config({ paths })`, not
  only through the tenant record.
- Notify endpoint override: `window.PI_NOTIFY_URL` is the engine's name for it;
  the older `HS_NOTIFY_URL` / `H2_NOTIFY_URL` globals still work.
- Consent hook: `window.PI_CONSENT`; the older `HSConsent` still works.
- `PI.analyze(signals)` is exported, so a read can be computed from a stored
  signal snapshot without a live session.
- The venture-branded email builder (127 lines, zero callers since the alert
  became a flat payload) is gone. The email is the venture's.

Fixed on the way:

- The remembered-identity key was declared with `var` *after* the load-time
  hydration that read it, so it was hoisted as `undefined` at that moment and a
  prospect's stored name, email, phone and contact method were never restored
  on a reload. Only the deck's own name/email keys ever worked. The key is now
  declared before hydration runs; a test loads the engine twice against the
  same storage and asserts the identity survives.
- `toProfileRow` reads `framing.frame` — the field the engine actually emits —
  into the row's `framing.style`, which had always been empty.

Added:

- `src/profile-shape.js` — the row shape, pure, with `ROW_COLUMNS`, `BANDS`,
  `LEGACY_BANDS` and `SCHEMA_ID` for consumers to assert against.
- `schema/profile.json` — the read as JSON Schema.
- 22 tests: model freeze, boundary (venture strings, literal keys, domains),
  engine behaviour, row shape.
