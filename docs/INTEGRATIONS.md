# Integrations: the contract

Status: **a contract and its checks. Nothing is switched on.** `src/integrations.js` opens no
connection, reads no environment variable and is called by neither site. No credential has been
issued, no webhook registered and no outside system contacted. Turning any of this on is a
separate, approved piece of work per customer.

API version `2026-11-12`.

## Events

| Event | Needs scope | Carries |
| --- | --- | --- |
| `pi.request.created.v1` | `requests:receive` | prospect reference, presentation, distributor, kind (`contact`, `next_step`), channel, time |
| `pi.brief.updated.v1` | `briefs:read` | prospect reference, presentation, distributor, band, evidence strength, rule version, time |
| `pi.outcome.recorded.v1` | `outcomes:write` | prospect reference, distributor, kind, verification level, time |
| `pi.followup.updated.v1` | `followup:write` | prospect reference, distributor, state, due date |
| `pi.test.ping.v1` | none | a note |

An event carries only the fields listed. Anything else handed to `build()` is dropped: no name,
email, phone, typed text or pointer data leaves in an event. A prospect is named by an opaque
reference that is different under every customer, so it cannot be used to join two customers'
data. Contact details, where a customer is entitled to them, are read by an authorised API call,
not pushed.

Envelope: `id`, `type`, `apiVersion`, `tenant`, `createdAt`, `correlationId`, `idempotencyKey`,
`test`, `data`. The id is a function of what happened, so recording the same thing twice gives
the same id; a receiver stores by `idempotencyKey` and a duplicate is harmless.

## Credentials

Per customer, with scopes from `briefs:read`, `requests:receive`, `outcomes:write`,
`followup:write`. The secret is shown once; only its hash is stored. Default life 90 days,
never more than a year. Rotation issues a new key and lets the old one work for 24 hours.
Revocation is immediate. A credential's customer comes from its stored record; a request cannot
name a different one.

## Signed webhooks

Headers `pi-event-id`, `pi-timestamp` (seconds), `pi-signature: v1=<hex>`, where the signature
is HMAC-SHA256 over `id.timestamp.body`. A receiver must: check the signature in constant time,
refuse a timestamp more than five minutes from its own clock, and refuse an id it has already
accepted. `verify()` does all three.

## Where a webhook may go

`https` on port 443 to a public host name the customer registered. Refused: addresses of any
form, private or internal names, credentials in the URL, fragments, other ports. After the name
is resolved and before connecting, every resolved address is checked again (`resolved()`), the
connection is pinned to a checked address, and redirects are not followed.

## Delivery

Only a 2xx is a delivery. Other failures retry after 1 min, 5 min, 30 min, 2 h and 12 h, then
stop in a dead-letter list a person can see. 400, 401, 403, 404, 410, 422 and any redirect stop
at once. "Queued" is never reported as success. One customer's backlog cannot take more than its
share of a worker run (`fairBatch`).

Checked at send time, not queue time: a queued delivery does not go if the prospect was erased,
consent was withdrawn, the credential or subscription was revoked, the customer is not active,
or the prospect asked for no contact. The no-contact state itself is still delivered, so the
other system stops too.

## Outcomes coming in

`verified` only when the provider authenticated the event and reports it completed.
`affiliate_reported` when a distributor says so. Anything else is `unknown`. Nothing is inferred.

## Testing without contacting anyone

`test/integrations.test.js` runs the whole path (build, route, sign, deliver, verify, retry,
suppress) with a stand-in for the HTTP client. Credentials and events can be marked `test`.

## Before switching on for a customer

1. Signed agreement naming the events and scopes.
2. A server worker and outbox table in that site (not written).
3. Their endpoint registered and a `pi.test.ping.v1` verified by them.
4. Their privacy notice covers the disclosure; counsel has reviewed it.
5. Owner approval.
