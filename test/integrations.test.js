// The integration contract: events, credentials, signatures, destinations,
// delivery. Everything here runs in memory. Nothing is contacted.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var I = require("../src/integrations.js");
var NOW = Date.parse("2026-11-12T12:00:00Z"), ISO = "2026-11-12T12:00:00Z";
var REF = I.prospectRef("meadowlark-co", "visitor-1", "pepper");
function request(over, meta) {
  return I.build("pi.request.created.v1", "meadowlark-co", Object.assign({ prospectRef: REF, presentation: "meadowlark-tour", distributor: "wren", kind: "contact", channel: "email", occurredAt: ISO }, over || {}),
    Object.assign({ createdAt: ISO, source: "req-1" }, meta || {}));
}
function replay() { var m = new Map(); return { has: function (k) { return m.has(k); }, add: function (k, t) { m.set(k, t); }, size: function () { return m.size; } }; }

test("an event carries only its allowed fields, and never a contact detail", function () {
  var r = request({ email: "guest@somewhere.example", phone: "555", note: "call me after six", pointer: [1, 2], name: "A Guest" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.event.data).sort(), ["channel", "distributor", "kind", "occurredAt", "presentation", "prospectRef"]);
  assert.equal(/guest@|555|after six|A Guest/.test(JSON.stringify(r.event)), false);
  assert.equal(r.event.apiVersion, I.API_VERSION); assert.match(r.event.id, /^evt_[a-f0-9]{32}$/);
  assert.equal(request({ prospectRef: "guest@somewhere.example" }).ok, false, "an email is not a reference");
  assert.equal(request({ kind: "cold_call" }).ok, false);
  assert.equal(I.build("pi.pointer.moved.v1", "meadowlark-co", {}, { createdAt: ISO }).ok, false, "there is no such event");
  assert.equal(I.build("pi.brief.updated.v1", "meadowlark-co", { prospectRef: REF, presentation: "meadowlark-tour", distributor: "wren", band: "likely_to_buy", evidence: "solid", rules: "2.1.0", updatedAt: ISO }, { createdAt: ISO }).ok, false, "no likelihood wording in a brief event");
});

test("the same thing recorded twice is one event; a different thing is another", function () {
  var a = request(), b = request({}, { createdAt: "2026-11-12T12:03:00Z" });
  assert.equal(a.event.id, b.event.id, "a retry of the same record");
  assert.equal(a.event.idempotencyKey, b.event.idempotencyKey);
  assert.notEqual(request({ channel: "call" }).event.id, a.event.id);
  assert.notEqual(request({}, { source: "req-2" }).event.id, a.event.id);
  // A receiver that keys on the id stores it once however often it arrives.
  var stored = new Map(); [a, b, a].forEach(function (x) { stored.set(x.event.idempotencyKey, x.event); });
  assert.equal(stored.size, 1);
});

test("a prospect's reference differs under every customer, so it cannot join their data", function () {
  assert.notEqual(I.prospectRef("meadowlark-co", "visitor-1", "pepper"), I.prospectRef("copperline-co", "visitor-1", "pepper"));
  assert.equal(I.prospectRef("meadowlark-co", "visitor-1", "pepper"), REF);
  assert.equal(REF.indexOf("visitor-1"), -1);
});

test("credentials: scoped, hashed, expiring, revocable, and never good for another customer", function () {
  var c = I.issue("meadowlark-co", ["briefs:read", "requests:receive"], { days: 30 }, NOW);
  assert.equal(c.ok, true);
  assert.equal(JSON.stringify(c.record).indexOf(c.secret), -1, "the stored record does not contain the secret");
  var recs = [c.record];
  assert.equal(I.authorize(recs, c.secret, "briefs:read", "meadowlark-co", NOW).ok, true);
  assert.equal(I.authorize(recs, c.secret, "outcomes:write", "meadowlark-co", NOW).reason, "scope");
  assert.equal(I.authorize(recs, c.secret, "briefs:read", "copperline-co", NOW).reason, "cross_tenant");
  assert.equal(I.authorize(recs, "pisk_" + "0".repeat(64), "briefs:read", "meadowlark-co", NOW).reason, "unknown_credential");
  assert.equal(I.authorize(recs, "", "briefs:read", "meadowlark-co", NOW).ok, false);
  assert.equal(I.authorize(recs, c.secret, "briefs:read", "meadowlark-co", NOW + 31 * 864e5).reason, "expired");
  assert.equal(I.authorize([I.revoke(c.record, NOW)], c.secret, "briefs:read", "meadowlark-co", NOW + 1).reason, "revoked");
  assert.equal(I.issue("meadowlark-co", ["everything"], {}, NOW).ok, false);
  assert.equal(I.issue("meadowlark-co", [], {}, NOW).ok, false);
  assert.ok(Date.parse(I.issue("meadowlark-co", ["briefs:read"], { days: 5000 }, NOW).record.expiresAt) <= NOW + 365 * 864e5, "no credential outlives a year");
  // Rotation: the new key works at once; the old one for a day, then not.
  var r = I.rotate(c.record, NOW), both = [r.previous, r.record];
  assert.equal(I.authorize(both, r.secret, "briefs:read", "meadowlark-co", NOW).ok, true);
  assert.equal(I.authorize(both, c.secret, "briefs:read", "meadowlark-co", NOW + 3600e3).ok, true);
  assert.equal(I.authorize(both, c.secret, "briefs:read", "meadowlark-co", NOW + 25 * 3600e3).reason, "expired");
});

test("a signed delivery verifies once; tampering, age, a wrong key and a replay are refused", function () {
  var ev = request().event, body = JSON.stringify(ev), secret = "whsec_test_1", h = I.sign(secret, ev.id, NOW, body), seen = replay();
  assert.equal(I.verify([secret], h, body, seen, NOW + 1000).ok, true);
  assert.equal(I.verify([secret], h, body, seen, NOW + 2000).reason, "replay");
  assert.equal(I.verify([secret], h, body.replace("wren", "ash"), replay(), NOW).reason, "signature");
  assert.equal(I.verify(["another"], h, body, replay(), NOW).reason, "signature");
  assert.equal(I.verify([secret], h, body, replay(), NOW + 6 * 60e3).reason, "stale");
  assert.equal(I.verify([secret], h, body, replay(), NOW - 6 * 60e3).reason, "stale", "a timestamp from the future");
  assert.equal(I.verify([secret], Object.assign({}, h, { "pi-signature": "v1=zz" }), body, replay(), NOW).reason, "malformed");
  assert.equal(I.verify([secret], {}, body, replay(), NOW).reason, "malformed");
  assert.equal(I.verify([], h, body, replay(), NOW).reason, "signature", "no key is not a pass");
  // Moving the timestamp forward to dodge the age check breaks the signature.
  assert.equal(I.verify([secret], Object.assign({}, h, { "pi-timestamp": String(Math.floor((NOW + 3600e3) / 1000)) }), body, replay(), NOW + 3600e3).reason, "signature");
  assert.equal(I.verify(["new", secret], h, body, replay(), NOW).ok, true, "during rotation either current key verifies");
});

test("a webhook may only go to a public https name", function () {
  var bad = {
    "http://hooks.partner-crm.com/pi": "https_only", "https://user:pw@hooks.partner-crm.com/pi": "credentials_in_url", "https://hooks.partner-crm.com:8443/pi": "port",
    "https://127.0.0.1/pi": "address_literal", "https://[::1]/pi": "address_literal", "https://2130706433/pi": "address_literal", "https://0x7f000001/pi": "address_literal",
    "https://localhost/pi": "hostname", "https://db.internal/pi": "internal_name", "https://metadata.google.internal/": "internal_name", "https://printer.local/": "internal_name",
    "https://hooks.partner-crm.com/pi#frag": "fragment", "file:///etc/passwd": "https_only", "not a url": "not_a_url", "https://169.254.169.254/latest/meta-data": "address_literal"
  };
  Object.keys(bad).forEach(function (u) { var d = I.destination(u); assert.equal(d.ok, false, u); assert.equal(d.reason, bad[u], u); });
  assert.deepEqual(I.destination("https://hooks.partner-crm.com/pi?x=1"), { ok: true, host: "hooks.partner-crm.com", url: "https://hooks.partner-crm.com/pi?x=1" });
  assert.equal(I.destination("https://hooks.partner-crm.com/pi", ["partner-crm.com"]).ok, true);
  assert.equal(I.destination("https://hooks.partner-crm.com.evil.net/pi", ["partner-crm.com"]).reason, "host_not_registered");
  assert.equal(I.destination("https://evilpartner-crm.com/pi", ["partner-crm.com"]).reason, "host_not_registered");
});

test("the address a name resolves to is checked too, so a name that points inward is refused", function () {
  ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1", "999.1.1.1", "nonsense"].forEach(function (ip) {
    assert.equal(I.privateAddress(ip), true, ip);
    assert.equal(I.resolved(["93.184.216.34", ip]).ok, false, "one inward address among several: " + ip);
  });
  assert.equal(I.privateAddress("93.184.216.34"), false); assert.equal(I.privateAddress("2606:2800:220:1::1"), false);
  assert.deepEqual(I.resolved(["93.184.216.34"]), { ok: true, pin: "93.184.216.34" });
  assert.equal(I.resolved([]).reason, "unresolved");
});

test("only a 2xx is a delivery; failures retry with backoff, then stop where a person can see", function () {
  assert.equal(I.next(0, { status: 204 }, NOW).state, "delivered");
  assert.equal(I.next(0, { status: 202 }, NOW).state, "delivered");
  var r = I.next(0, { status: 503 }, NOW); assert.equal(r.state, "retry"); assert.equal(Date.parse(r.notBefore) - NOW, 60e3);
  assert.equal(Date.parse(I.next(4, { error: "timeout" }, NOW).notBefore) - NOW, 12 * 3600e3);
  assert.deepEqual(I.next(5, { status: 500 }, NOW), { state: "dead", reason: "retries_exhausted" });
  assert.deepEqual(I.next(0, { status: 302 }, NOW), { state: "dead", reason: "redirect_refused" });
  assert.equal(I.next(0, { status: 410 }, NOW).state, "dead"); assert.equal(I.next(0, { status: 401 }, NOW).state, "dead");
  assert.equal(I.next(0, { status: 429 }, NOW).state, "retry"); assert.equal(I.next(0, null, NOW).state, "retry");
  for (var i = 1; i < I.BACKOFF_MS.length; i++) assert.ok(I.BACKOFF_MS[i] > I.BACKOFF_MS[i - 1]);
});

test("what is still queued does not go after deletion, withdrawal, revocation or a no-contact request", function () {
  var item = request().event;
  assert.equal(I.suppressed(item, {}), null);
  assert.equal(I.suppressed(item, { prospectErased: true }), "prospect_erased");
  assert.equal(I.suppressed(item, { consentWithdrawn: true }), "consent_withdrawn");
  assert.equal(I.suppressed(item, { noContact: true }), "no_contact");
  assert.equal(I.suppressed(item, { credentialRevoked: true }), "credential_revoked");
  assert.equal(I.suppressed(item, { subscriptionRevoked: true }), "subscription_revoked");
  assert.equal(I.suppressed(item, { customerStatus: "suspended" }), "customer_suspended");
  assert.equal(I.suppressed(item, { subscriptionTenant: "copperline-co" }), "cross_tenant");
  // The no-contact state itself must still reach the other system, or it would keep contacting.
  var f = I.build("pi.followup.updated.v1", "meadowlark-co", { prospectRef: REF, distributor: "wren", state: "no_contact" }, { createdAt: ISO }).event;
  assert.equal(I.suppressed(f, { noContact: true }), null);
  assert.equal(I.suppressed(f, { prospectErased: true }), "prospect_erased");
});

test("a subscription hears only its own customer's events, and only what its scopes cover", function () {
  var s = I.subscription("meadowlark-co", "https://hooks.partner-crm.com/pi", ["pi.request.created.v1", "pi.brief.updated.v1"]);
  assert.equal(s.ok, true);
  var mine = request().event, theirs = I.build("pi.request.created.v1", "copperline-co", mine.data, { createdAt: ISO }).event;
  assert.equal(I.wants(s.subscription, mine, ["requests:receive"]), true);
  assert.equal(I.wants(s.subscription, theirs, ["requests:receive"]), false, "another customer's event");
  assert.equal(I.wants(s.subscription, mine, ["briefs:read"]), false, "not scoped for requests");
  assert.equal(I.wants(Object.assign({}, s.subscription, { status: "revoked" }), mine, ["requests:receive"]), false);
  var o = I.build("pi.outcome.recorded.v1", "meadowlark-co", { prospectRef: REF, distributor: "wren", kind: "product_purchase", verification: "verified", occurredAt: ISO }, { createdAt: ISO }).event;
  assert.equal(I.wants(s.subscription, o, I.SCOPES), false, "not subscribed to it");
  assert.equal(I.subscription("meadowlark-co", "https://10.0.0.1/pi", ["pi.request.created.v1"]).ok, false);
  assert.equal(I.subscription("meadowlark-co", "https://hooks.partner-crm.com/pi", ["pi.everything"]).reason, "events");
});

test("one customer's backlog cannot use up the worker", function () {
  var q = []; for (var i = 0; i < 1000; i++) q.push({ tenant: "big-co", n: i });
  q.push({ tenant: "meadowlark-co", n: 0 }, { tenant: "copperline-co", n: 0 });
  var batch = I.fairBatch(q, 20, 50);
  assert.equal(batch.filter(function (x) { return x.tenant === "big-co"; }).length, 20);
  assert.equal(batch.filter(function (x) { return x.tenant !== "big-co"; }).length, 2);
  assert.ok(I.fairBatch(q, 100, 50).length <= 50);
});

test("an outcome is verified only when the provider says so; queued or unclear is unknown", function () {
  assert.deepEqual(I.outcomeFrom({ authenticated: true, event: "purchase", status: "completed" }), { verification: "verified", kind: "product_purchase" });
  assert.equal(I.outcomeFrom({ authenticated: true, event: "purchase", status: "queued" }).verification, "unknown");
  assert.equal(I.outcomeFrom({ authenticated: false, event: "purchase", status: "completed" }).verification, "unknown");
  assert.equal(I.outcomeFrom({ reportedBy: "affiliate", kind: "conversation_held" }).verification, "affiliate_reported");
  assert.equal(I.outcomeFrom("ok").verification, "unknown"); assert.equal(I.outcomeFrom({ status: 200 }).verification, "unknown");
});

test("sandbox contract: build, route, sign, deliver, verify, retry and suppress, end to end in memory", function () {
  var cred = I.issue("meadowlark-co", ["requests:receive"], { test: true }, NOW), secret = "whsec_sandbox";
  var sub = I.subscription("meadowlark-co", "https://hooks.partner-crm.com/pi", ["pi.request.created.v1"]).subscription;
  var calls = [], seen = replay(), received = new Map(), answers = [{ status: 503 }, { status: 200 }];
  // The stand-in for an HTTP client. It never opens a connection.
  function transport(url, headers, body, t) {
    calls.push(url);
    var a = answers.shift() || { status: 200 };
    if (a.status === 200) { var v = I.verify([secret], headers, body, seen, t); if (!v.ok) return { status: 401 }; received.set(JSON.parse(body).idempotencyKey, JSON.parse(body)); }
    return a;
  }
  function deliver(ev, facts, t) {
    if (!I.wants(sub, ev, cred.record.scopes)) return "not_routed";
    var why = I.suppressed(ev, facts); if (why) return why;
    if (!I.resolved(["93.184.216.34"]).ok) return "private_address";
    for (var attempt = 0; ; attempt++) {
      var body = JSON.stringify(ev), n = I.next(attempt, transport(sub.url, I.sign(secret, ev.id, t, body), body, t), t);
      if (n.state !== "retry") return n.state;
      t = Date.parse(n.notBefore);
    }
  }
  var ev = request({}, { test: true }).event;
  assert.equal(ev.test, true);
  assert.equal(deliver(ev, {}, NOW), "delivered"); assert.equal(calls.length, 2, "one failure, one retry");
  assert.equal(received.size, 1);
  assert.equal(deliver(request({ channel: "call" }, { test: true }).event, { noContact: true }, NOW), "no_contact"); assert.equal(calls.length, 2, "nothing was sent");
  assert.equal(deliver(I.build("pi.request.created.v1", "copperline-co", ev.data, { createdAt: ISO }).event, {}, NOW), "not_routed");
  assert.ok(calls.every(function (u) { return u === "https://hooks.partner-crm.com/pi"; }));
});

test("this file opens no connection and is switched on by nothing", function () {
  var src = fs.readFileSync(path.join(__dirname, "..", "src", "integrations.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/require\(\s*["'](node:)?(https?|net|tls|dgram|dns|child_process|fs)["']\s*\)|\bfetch\s*\(|XMLHttpRequest|process\.env/.test(src), false);
});
