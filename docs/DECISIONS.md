# Prospect Intelligence — decisions log

One engine runs under several brands. This file records decisions about **how
the engine behaves**, written without any brand's name, wording or numbers, so
a lesson learned on one brand reaches the others with the code itself. A
brand's wording, claims, colours and settings live in that brand's own
repository, never here.

Each entry: date · decision · why · where it is configured · who decided · open questions.

---

## 2026-11-11 · Consent: notice in the US, ask first elsewhere
- **Decision:** consent mode is a brand setting (`gate` or `notice`, with a region rule).
  With notice for the US, a visitor on a US time zone is told on page open and can turn
  tracking off; every other or unknown zone is asked before anything is stored. Browser
  do-not-track signals always mean off. No setting means gate.
- **Why:** a blocking banner in front of a presentation is not required for US visitors
  and costs attention. Found on one brand and adopted by the second the same day.
- **Configured in:** the brand's own record and consent module; the brand's privacy
  policy must say the same thing.
- **Decided by:** the owner.
- **Open for counsel:** state wiretap-law exposure; whether time zone is an adequate
  region test; any US states that should stay on gate.

## 2026-11-11 · Intake: a scoped capability, and alerts sent from the stored read
- **Decision:** an upload may carry a short-lived token bound to the brand, the affiliate
  link, the browser session and a registered presentation. It grants no read and proves
  no identity. Alerts are queued by the server after the read is stored and are built
  from the stored profile, once per session and class. Both are brand switches, off by default.
- **Why:** a public handle alone let anyone post reads or trigger emails, and the
  browser's own summary could disagree with the stored row.
- **Configured in:** the brand's flags and its session endpoint; a server-only secret.
- **Decided by:** the owner's build prompts. **Open:** when each brand turns the switches on.

## 2026-11-11 · Outcomes are events, and unknown is not failure
- **Decision:** what happens after a read is recorded as events with a source and a
  verification level. A hand-recorded result is the affiliate's word; verified comes only
  from an authenticated provider or an approved import, attached only on certainty, to
  the prospect's real owner; anything ambiguous waits for a person. A purchase is never
  an enrollment. A read is judged only as it stood before anyone acted. No recorded
  outcome means unknown. Reports are per brand and per presentation, hide groups under
  ten, and publish no probability and no causal claim.
- **Why:** so accuracy can be measured honestly later, and nothing is claimed before it is known.
- **Configured in:** `src/outcomes.js`; each brand's registry of verified sources.
- **Decided by:** the owner's build prompts. **Open:** each brand's verified source;
  the outcome windows are starting values.

## 2026-11-11 · One home for the engine
- **Decision:** the engine's source lives only in this repository. Every brand vendors
  the same release with `tools/vendor.mjs` and pins it; all brands move to a release on
  the same day. Brand chats change brand files; engine changes are made here.
- **Why:** two copies of the source drift, and then "the same engine" is no longer true.
- **Configured in:** each brand's `pi.consumer.json` and `pi.lock.json`.
- **Decided by:** the owner.
