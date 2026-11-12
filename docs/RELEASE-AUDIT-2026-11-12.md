# Prospect Intelligence 2.0 — Step 16: third brand, integration contract, release audit

12 November 2026. Covers Prompts 11, 12 and 13 of the build pack.

**Nothing is deployed. No production database was changed. No message was sent. No outside system was contacted.**
The live sites still run what is on each repository's `main` branch. Release happens only when Kevin says so.

---

## 1 · What was built in this step

### Prompt 11: a third brand by configuration

| Item | State |
| --- | --- |
| Appearance contract (`pi-brand-appearance@1`): logo, colours, email look, links, approved resources and disclosures, distributor link format | Built, tested |
| Validation of every brand setting as untrusted input: https only on approved hosts, raster logos only, hex colours with a readability check (4.5:1), plain text only, unknown keys refused | Built, tested |
| One permission map for six roles; every capability refused across customers; an affiliate sees only their own prospects (team or upline grants nothing); support needs a named grant of 24 hours or less, audited | Built, tested as functions |
| Customer gate: suspended, revoked or unknown customers are refused | Built, tested as a function |
| Versioned configuration: publish, roll back, disable, enable, health | Built, tested (`tools/admin.mjs`, file registry) |
| Fictional third brand "Meadowlark Home" on the same engine files, with a preview page and an alert-email preview | Built, tested in a real browser |
| A brand may name its own link parameter (`TENANT.piRepParam`) | Built, tested |
| Embedded players: only a co-operating frame on an approved origin is heard; PDF, slide files and video sites report limited or no coverage | Built, tested |
| Docs: `docs/WHITE-LABEL.md`, `docs/PLATFORM.md` | Written |
| **Web admin screen** | **Not built.** Provisioning is a command-line tool run by a person |
| **Hosted registry and customer database** | **Not built.** The registry is a JSON file |
| **The two live sites calling the gate and permission map on their servers** | **Not wired.** They keep their existing sign-in checks |
| **ProspectIntelligencePlatform.com** | **Docs only.** No DNS, hosting or account touched |

Proof the engine was not changed for the brand: all three consumers carry browser bundle `494759a8fc59` and evaluator `9a0eecd416c8`; `tools/compare.mjs` reports "3 consumers, 32 journeys, identical core"; a test fails if any engine file names the sandbox brand.

### Prompt 12: the integration contract

| Item | State |
| --- | --- |
| Five versioned events limited to listed fields; no name, email, phone, typed text or pointer data can leave in an event | Built, tested |
| Opaque prospect reference, different under every customer | Built, tested |
| Scoped credentials stored as a hash; expiry (90 days default, 1 year maximum), revocation, rotation with a 24-hour overlap | Built, tested |
| Signed deliveries (HMAC-SHA256), five-minute tolerance, replay refused | Built, tested |
| Destination rules: public https host only; addresses, private names, other ports, credentials in URL and redirects refused; resolved address checked again before connecting | Built, tested |
| Retries with backoff (1 min to 12 h), then dead-letter; only a 2xx is a delivery | Built, tested |
| Suppression at send time after erasure, withdrawal, revocation, suspension or a no-contact request | Built, tested |
| One customer cannot take more than its share of a worker run | Built, tested |
| Provider answers mapped to verified / affiliate-reported / unknown | Built, tested |
| End-to-end sandbox contract test with a stand-in HTTP client | Built, passing |
| Docs: `docs/INTEGRATIONS.md` | Written |
| **A server worker, outbox wiring, issued credentials, any registered webhook** | **None.** The module opens no connection and nothing calls it |

### Things I found and fixed while auditing

1. The engine's link parameter was fixed to `u` / `rep`. A third brand could not use its own. Added `piRepParam`; the old names still work.
2. My earlier work had made two HighSquared gates worse than `main` (tenant hardcoded-value count, type-size floor). Both now report exactly what `main` reports.
3. A HighSquared test pins the engine line that reads the handle. Engine 1.13.0 broke it; 1.13.1 restores the line. Caught by the site's tests before any commit to the site.
4. I committed High & High once with a message saying 1.13.1 while the files were 1.13.0. Corrected in the next commit; the site's own check caught it.
5. The sandbox preview's small orange text was too faint to read. Fixed, and the validator now refuses a brand colour that fails the contrast rule.

---

## 2 · Exact versions

| | Value |
| --- | --- |
| Engine package | `@kmin/prospect-intelligence` 1.13.1, commit `a60fba5` on `main` |
| Browser bundle sha256 | `494759a8fc598ce17d1a9a447b8c447a3c0f15116271154cb8454d07671d0cda` |
| Evaluator sha256 | `9a0eecd416c86a63ae5fcddcb1b71bd9474473b1837450436765a9b82c5b2719` |
| Row shape / outcomes / config | `8b7dae76…` / `69d49da8…` / `4da78896…` |
| Tenancy / integrations (not used by the sites) | `bbbb6beb…` / `d3180a49…` |
| Rule version live on both sites | 2.1.0 (rules 3.0.0 is built and switched off) |
| Read schema | `pi-read-v3` (brief), `h2-intel-v2` (legacy wire id, unchanged) |
| Brand / manifest / appearance contracts | `pi-brand-config@1`, `pi-presentation-manifest@1`, `pi-brand-appearance@1` |
| Integration API version | `2026-11-12` (nothing live) |
| HighSquared | branch `feature/pi-2.0`, commit `edc85ae`, 35 commits ahead of `main` (`27ec4cb`) |
| High & High | branch `feature/pi-2.0`, commit `76d8461`, 11 commits ahead of `main` (`f5d9a28`) |

---

## 3 · Test results (actual, run 12 November 2026)

| Suite | Result |
| --- | --- |
| Engine | 208 pass, 0 fail (includes the boundary test and all three golden sets reproducing exactly) |
| HighSquared unit | 272 pass, 0 fail |
| HighSquared integration | 1163 pass, 1 fail (#176 claims, see below) |
| HighSquared gates passing | lint, format, generated files, engine pin, security, accessibility, deploy check, both translation checks, deck build |
| High & High | 383 pass, 0 fail; database tests "ALL PI SERVER TESTS PASSED"; copy gate 31 files, 1628 strings |
| Three-consumer comparison | identical core across 32 journeys |

### Every failing check: baseline against changed

| Check | On `main` | On the branch | Caused by this work? | Blocks release? | Owner |
| --- | --- | --- | --- | --- | --- |
| Integration #176, claims governance | Fails: 44 claim waivers were due 15 Oct 2026 and are overdue | Fails, same reason, same entries | No | Not a PI defect. It is a standing compliance item: each claim needs a named approval and a new review date | Kevin with JD |
| `tenant` (hardcoded brand values) | Fails: colour in 47 files (limit 42), domain in 38 (limit 33) | Fails with the identical output | No (I had added one file to each count; fixed) | No | Kevin; cleanup task |
| `type:check` (text size floor) | 1 item (`hub.html`) | 1 item, the same one | No (I had added two; fixed) | No | Cleanup task |
| `perf:check` | 2 items: image library 17.2 MB over 8 MB; `intelligence.html` 27 requests over 26 | 3 items: the same two, plus **the desktop presentation makes 28 requests, over 26** | **Yes.** The desktop deck now loads the consent notice and the offer card (one request each) | Kevin's call, see decision D-1 | Kevin |
| Integration #808 on `main` in my comparison run | Failed only because the comparison copy had no built `dist/` folder | Passes | No, an artefact of how I ran the comparison | No | — |

**Decision D-1 (needed before release).** The desktop presentation is two requests over the project's own ceiling. Options: (a) raise the ceiling from 26 to 28 with a dated note, which is how this project has handled each earlier increase; (b) I merge the consent and offer scripts into one file for the decks, bringing it to 27, and still raise by one; (c) leave the gate failing as it already is on `main`. I recommend (a): the two requests are the consent notice, which is required, and the share card, and both are small (5.6 KB and 5.8 KB compressed). I did not change the ceiling myself because the project's rule is that it moves only deliberately.

### Size

| File | `main` | Branch |
| --- | --- | --- |
| Engine, raw | 38.0 KB | 125.6 KB |
| Engine, compressed | 12.9 KB | 38.6 KB |
| Offer card / brief card / next action / outcomes (compressed) | none | 5.8 / 11.0 / 6.9 / 4.2 KB |

The engine is about three times its size on `main`. That is the cost of the evidence rules, consent handling, instrumentation, intercept logic and both rule versions. The brief, next-action and outcome files load on member pages only, never on a prospect's presentation. No network request is made on pointer movement; the engine has no mouse-move listener at all. **Not measured: real mobile load time on a deploy preview.** That needs a preview deployment.

---

## 4 · The twenty final scenarios

"Tested" means a named automated test asserts it. Where a scenario is only partly covered, it says so.

| # | Scenario | State | Where |
| --- | --- | --- | --- |
| 1 | Opens and leaves | Tested | "empty data: insufficient evidence, scores hidden, no trait or probability"; "a visitor who did nothing is never published as a score" |
| 2 | Full deck, no contact request | Tested | "the intent ceiling is honest: 40 on a first visit, 55 after a return, no forced hot" |
| 3 | Two-scene teaser | Tested under rules 3.0.0 (switched off) | "a short experience is readable by its own coverage rule". Under live rules 2.1.0 the older three-scene gate still applies |
| 4 | Product route chosen | **Partly.** A presentation's manifest can declare its routes and they are validated. Coverage is counted as qualified views over the total the presentation reports, so partial viewing never becomes 100%. **The evaluator does not yet compute coverage per declared route, and there is no dedicated test** | `config.test.js` (manifest routes); coverage tests in `rules-v3.test.js` |
| 5 | Help with pricing | Tested | "help, pricing, walkthrough, sharing and saving are never permission to contact"; "an information offer never becomes a contact request, under either rule version" |
| 6 | Calendar opened, never booked | Tested | "clicked, submitted, requested, confirmed, started and verified are different facts" |
| 7 | Enroll clicked, checkout abandoned | Tested | same test; outcomes: "purchase is never enrollment" |
| 8 | Touch or keyboard | Tested | "touch, keyboard and scroll count as input; a phone never records hover" |
| 9 | Video seeks to the end | Tested | "seeking to the end and ending does not prove a video was watched"; "a looping background clip is never counted" |
| 10 | Slow control | Tested | "a slow control that says it is busy gets time…" |
| 11 | Retry, restore, duplicate, delayed packet | Tested in parts | duplicates and sequence: "a retry is not a second event", "intake passes session and sequence…"; one email: "CTA, retry, unload and finish make ONE email". The back-forward restore is handled in the engine and exercised in `instrument.test.js`; **no real-browser restore test was run** |
| 12 | Distributor's own preview | Tested | "preview: the read is computed and nothing leaves the browser"; "internal traffic is excluded" |
| 13 | Analytics declined | Tested | "declined: nothing identified, stored, sent or alerted"; "the presentation keeps working without permission" |
| 14 | Another tenant guesses an ID | Tested | "another affiliate's prospect is 'not found'"; "the outbox never reaches across affiliates or tenants"; "every capability is refused across customers" |
| 15 | Shared browser | **Partly.** The database keeps the replaced name, email and phone in a history table instead of silently overwriting (migration 0039 / 12a), and the database tests cover it. **There is no prompt asking "is this still you?"**, so the latest person is shown on the card |
| 16 | Withdrawn or erased while an alert is queued | Tested | "withdrawn mid-session: the held alert is cancelled"; database cascade tests; integration `suppressed()` |
| 17 | Verified purchase | Tested | "a purchase in an import is stored as a purchase, never as an enrollment"; "nobody can make themselves verified" |
| 18 | Malicious note to Beacon | **Partly.** The Hub's next-action opener is rule-based, takes nothing a prospect typed, and can send nothing ("prompt injection: nothing a prospect typed steers the opener"). **The hosted Beacon assistant was not in this session and is not covered** |
| 19 | Third brand | Tested | `whitelabel.test.js`, plus the three-consumer comparison |
| 20 | Analytics or backend fails | Tested | "no tenant record and no config: reads work, nothing is posted anywhere"; "a refused beacon falls back to one keepalive request"; "unreachable, the instance limit still applies" |

**Not performed:** load test of a shared-link burst against real infrastructure (the limits are unit-tested; the burst is not); provider or database outage on a live stack; any check on a physical phone. Browser checks so far are desktop Chrome and Chrome's phone emulation.

---

## 5 · Rollback rehearsal (run, on throwaway local databases)

| Site | What was rehearsed | Result |
| --- | --- | --- |
| High & High | Applied the exact file Kevin will run, added a profile row, ran the rollback file, restored the previous function, compared the schema, applied again | Schema after rollback is identical to the schema before. The profile row is still there. Re-applying works |
| HighSquared | Applied 0039, 0040, 0041 twice (safe to repeat), added a profile row, ran the three down files in reverse, compared the schema, applied again | Same three results |

Honest limit: HighSquared's base tables were created in production outside its migration files, so my local base was assembled from the migrations plus a stand-in profiles table. The three PI migrations and their rollbacks ran strictly on it.

**What rollback loses:** recorded outcomes, the alert outbox, intake counts, read history and replaced-contact history. **What it keeps:** every prospect profile and lead.

Files for Kevin: `highandhigh-4life-pi-ROLLBACK.sql`, `highsquared-acm-pi-ROLLBACK.sql`. In the repository: `db/rollback/2026-11-12-pi-rollback.sql` and `tests/db/rollback-rehearsal.sh` (High & High); the three `.down.sql` files (HighSquared).

**Code rollback** for either site: revert the merge commit on `main`. Stored profiles are unaffected because every table change is additive.
**Switching the new engine behaviour off without a rollback:** HighSquared `features.prospectBrief` and `features.prospectNext` to `false` restores the previous cards; High & High `brief_v1` and `outcomes_v1` are already off.

---

## 6 · Release order and switches

The pack's order is A to F. One dependency changes it: the brief card reads history the database stores, so **database first, then code, then switches**.

| Stage | What | Switch | Roll back by |
| --- | --- | --- | --- |
| A | Local fixtures and tests | — | Done |
| A2 | Deploy preview of each branch; walk one phone and one desktop journey | — | Not done; needs Kevin's go |
| B | HighSquared: run SQL, set `PI_SESSION_SECRET`, merge. Consent-gated collection and history begin. Alerts still sent the old way | none needed | revert the merge |
| C | HighSquared: brief and next action on The Mine | `features.prospectBrief`, `features.prospectNext` (set `true` on the branch) | set `false` |
| C2 | HighSquared: server-built alerts, one per event | brand flag `serverAlerts` (off) | set off |
| C3 | HighSquared: require the intake token | brand flag `requireCapability` (off); only a week or more after release | set off |
| D | Optional intercept holdout experiment | `integrations.prospectIntelligence.intercepts` (off), `experiment` (none) | set off |
| E | High & High: SQL, `PI_SESSION_SECRET`, merge; then `brief_v1`, then `outcomes_v1` | both off | set off |
| F | Third brand proof (done in sandbox). External pilot | nothing exists to switch | — |

### What to watch after each stage, and who

| Signal | Where | Owner |
| --- | --- | --- |
| Uploads accepted, dropped, duplicate, forged | `pi_intake_report` in each database | Kevin (I can read it on request) |
| Alert queue lag and failures | `pi_alert_outbox` | Kevin |
| One email per event, not several | Kevin's own inbox on a test run | Kevin |
| Consent: nothing stored for a decline | spot check with a private window | Kevin or Teri |
| Function errors | Netlify function logs | Kevin |
| Presentation speed on a phone | a real phone on the preview | Kevin |

---

## 7 · Open items before release

**Kevin's decisions**

- D-1: the request ceiling (section 3).
- High & High wording awaiting approval in its copy gate: the two brief lines and the outcome control wording.
- The seven next-action openers (and JD).
- Homepage lines listed in section 8.
- Release approval for each site.

**Counsel / JD**

- Privacy paragraphs §3 and §4 on HighSquared.
- Brain section wording and the corrected homepage lines.
- 44 overdue claim reviews (pre-existing).

**After launch**

- Teri's review of the Spanish.
- First experiment name and holdout.
- The hosted Beacon repository, so scenario 18 can be closed.

**Not built, stated plainly**

- Per-route coverage in the evaluator (scenario 4); Prompt 09 on High & High; approved resources attached to suggestions; High & High Spanish card; the High & High legacy stats page; a web admin screen; a hosted registry; any live integration; an identity prompt for shared browsers.

---

## 8 · Homepage and site check (asked 12 November)

**Is the live website the latest? No.** Nothing has been deployed. Both live homepages are served from `main`, which does not contain the new Brain section ("Measure. Explain. Respond.") and still contains the old scoring language (five places on HighSquared's homepage). I could not open the live sites from this session to read them directly; this is from the repositories the sites deploy from.

**Is the homepage on the release branch up to date?** The Prospect Intelligence and Brain sections are. These visible lines still describe the old promise ("who's ready") and do not match "a read, not a prediction":

| Site · page | Line now | Suggested |
| --- | --- | --- |
| HighSquared · home, hero | "…then tells you exactly who's ready and what to say next." | "…then shows you what each prospect did, what they asked for, and what to say next." |
| HighSquared · home, hero sample card | "Readiness: HOT · Reply within 24h" | "Asked for a call · Reply within 24h" |
| HighSquared · enroll | "Share it anywhere, see who's ready…" | "Share it anywhere, see who watched and what they asked for…" |
| HighSquared · enroll | "…every viewer, how far they got, and who's ready to talk." | "…every viewer, how far they got, and who asked to talk." |
| HighSquared · partner | "…and who's ready to talk — so you spend time on real interest, not guesswork." | "…and who asked to talk — so you spend time on real interest, not guesswork." |
| High & High · home, hero | "It warms them up, reads who's ready, and hands you back…" | "It warms them up, shows you what they did and asked for, and hands you back…" |
| High & High · home, Brain heading | "Every signal in. A read on who's ready, out." | "Every signal in. A clear read, out." |
| High & High · home, step 03 | "See who's ready. Every viewer is tracked and read — hot, warm, or cool…" | "See who's interested. Every viewer gets a plain read: what they watched, what they asked for, and their interest level." |
| High & High · home, closing | "…so you know exactly who's ready before you say a word." | "…so you know what they care about before you say a word." |
| High & High · home, footer call | "See who's ready before you say a word." | "Know what they care about before you say a word." |
| High & High · enroll (two lines) | same two lines as HighSquared's enroll page | same two replacements |

I have not changed these. They are public promises, High & High's go through its copy gate, and the hero lines are the first thing a visitor reads, so they are Kevin's to approve. Say "approve the homepage lines" and I will apply all twelve and their Spanish.

**Other things worth upgrading to match**

1. HighSquared's pitch page still says the engine "weighs six dimensions… each 0 to 100". True of the engine, but the card no longer shows six scores. Suggest: "It reads six kinds of evidence and shows you the reasons, not a score."
2. High & High's legacy `stats.html` still shows the old read. Either move it to the stored read behind `brief_v1` or retire it for `insights.html`.
3. High & High has no next-action block yet (Prompt 09 is HighSquared only), so the two sites' member pages are not at parity.
4. The desktop presentation request count (D-1).
5. A deploy preview walk on a real phone before any release.
