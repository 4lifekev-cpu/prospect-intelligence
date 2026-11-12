# Running a brand on the engine

A brand is data and one adapter. The engine is never edited for a brand; `test/whitelabel.test.js`
fails if it is. `sandbox/third-brand/` is a complete worked example (a made-up company).

## What exists today, and what does not

| Piece | State |
| --- | --- |
| Brand, appearance and presentation contracts, with validators | Built, tested |
| Roles and permissions, customer gate, cross-customer denial | Built, tested (as functions a server calls) |
| Versioned configuration: publish, roll back, disable, health | Built, tested (`tools/admin.mjs`, a file registry) |
| Preview page and alert-email preview for a brand | Built, tested in a real browser |
| A web admin screen | **Not built.** A brand is provisioned by a person with `tools/admin.mjs` |
| A hosted registry and database for customers | **Not built.** The registry is a JSON file |
| The two existing sites calling `gate()` and `can()` on their servers | **Not wired.** They keep their own sign-in checks; the vendored module is available to them |
| Billing, self-service sign-up, a customer contract | **Not built**, and nothing here should be offered to a customer before an agreement is signed |

## The files a brand supplies

| File | Contract | Holds |
| --- | --- | --- |
| `brand.json` | `pi-brand-config@1` | ids, the words it uses for customer / business / prospect, approved domains, rule version, switches. Server secrets are named by environment variable, never written here |
| `appearance.json` | `pi-brand-appearance@1` | logo, colours, email look, policy links, approved resources and disclosures, how a distributor is named on a link |
| `presentation*.json` | `pi-presentation-manifest@1` | each presentation: scenes, topics, narration lengths, what each button means |
| `paths.json` | — | the routes a prospect can choose |
| `pi.consumer.json` | — | where each engine file is copied to in the brand's site |
| `scripts/pi-adapter.cjs` | — | points `tools/compare.mjs` at the brand's vendored files |

Rules the appearance validator enforces, because a brand's settings are input like any other:

- every URL is `https` on a host the brand listed; no addresses, ports, credentials or script schemes
- logos are raster images (`png`, `jpg`, `webp`); no `svg`, which can carry script
- colours are six-digit hex, and the brand colour and text colour must be readable (4.5:1) on the page colour and under white button text; the accent is decoration and is never used for text
- text is plain text with length limits; markup is refused, not cleaned
- unknown keys are refused, so a typo cannot silently do nothing
- an email sender is not usable until its sending domain is marked verified

## Setting up a brand, step by step

```
1.  mkdir brands/<brand> and write the five files above (copy sandbox/third-brand as a start)
2.  node tools/vendor.mjs  --consumer brands/<brand>                 copies this release in, pins hashes
3.  node tools/admin.mjs validate brands/<brand>                    lists every problem, or passes
4.  node tools/admin.mjs preview  brands/<brand>                    writes site/index.html and email-preview.html
5.  open the preview; check look, words, consent prompt, keyboard use
6.  node tools/admin.mjs publish  brands/<brand> --actor owner      versions it in the registry
7.  node tools/admin.mjs health                                      shows release, rule version, status
8.  node tools/compare.mjs --consumer <site A> --consumer <site B> --consumer brands/<brand>
```

To undo: `rollback <brandId> --actor owner` returns to the previous version exactly.
To stop a brand: `disable <brandId> --actor owner`. No other brand is touched by either.

## The install snippet (web page)

```html
<script src="/tenant.js"></script>                 <!-- generated from the brand's files -->
<script src="/vendor/prospect-intelligence.js"></script>
```

`tenant.js` sets `window.TENANT`: `storagePrefix` (so two brands on one device never share
storage), `piPaths`, `piScenes`, `piConsentRequired`, `piRepParam` (the brand's own link
parameter) and, when the brand has a server, `piSession` and `piNotify`. The page must also
provide a consent object (`PI_CONSENT` with `granted()` and `state()`); without one the engine
collects nothing.

## The adapter contract (server)

The brand's server supplies storage, sign-in and email. From the vendored files it calls:

| Call | When |
| --- | --- |
| `tenancy.gate(customer)` | first, on every gated request; a suspended or revoked customer stops here |
| `tenancy.can(actor, capability, resource)` | before every read or write; the customer id on `actor` and `resource` comes from the server's own session and row, never from the request |
| `evaluate` / `profile-shape` | to recompute and store a read |
| `outcomes` | to record what happened |
| `integrations` | only if the customer has asked for an integration (see `INTEGRATIONS.md`) |

Roles: `owner`, `admin`, `presentation_editor`, `affiliate`, `analyst`, `support`. An affiliate
reads only their own prospects; being someone's upline or team grants nothing. An analyst sees
totals, not people. Support acts only under a named grant of at most 24 hours for listed
capabilities and, for a prospect, one named record; every use, allowed or refused, is flagged
for the audit log.

## Embedded presentations

| Player | What can be measured |
| --- | --- |
| A web page running the engine | everything |
| An iframe whose author posts `{source:"pi-embed", v:1, type:"scene"|"finished"|"cta"}` from an approved origin | scenes, finish, buttons |
| Any other iframe, a video embed | limited: that it was opened, not what was watched |
| A PDF or a slide file | nothing |

`tenancy.acceptMessage(event, approvedOrigins)` is the only way a frame's message is heard. It
checks the origin exactly, accepts three message types, and drops every other field. Coverage
is reported as it is; it is never estimated.

## What a brand must never be told

No security certification is held (not SOC 2, not ISO 27001). The read describes what a
prospect did and asked for. It does not predict a purchase, and no wording may say it does.
