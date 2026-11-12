// Who may do what, across customers; versioned configuration; embedding rules.
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var T = require("../src/tenancy.js");
var ROOT = path.resolve(__dirname, "..");
var DIR = path.join(ROOT, "sandbox", "third-brand");
var json = function (f) { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); };
function bundle() { return { brand: json("brand.json"), appearance: json("appearance.json"), manifests: [json("presentation.json")] }; }
// A second, unrelated customer, made from the first by renaming only.
function other() {
  var b = bundle();
  b.brand.brandId = "copperline"; b.brand.customerId = "copperline-co"; b.appearance.brandId = "copperline";
  return b;
}
var owner = { role: "owner", tenant: "meadowlark-co", handle: "o1" };
var NOW = Date.parse("2026-11-12T12:00:00Z");

test("the sandbox brand is valid, and a broken one says why", function () {
  assert.deepEqual(T.validateBundle(bundle()).errors, []);
  var b = bundle(); b.appearance.logo.url = "http://assets.meadowlark-home.example/x.png";
  assert.equal(T.validateBundle(b).ok, false);
  b = bundle(); b.appearance.logo.url = "https://elsewhere.example/x.png";
  assert.equal(T.validateBundle(b).ok, false, "a logo from a host the brand did not approve");
  b = bundle(); b.appearance.logo.url = "https://assets.meadowlark-home.example/x.svg";
  assert.equal(T.validateBundle(b).ok, false, "a logo that can carry script");
  b = bundle(); b.appearance.colors.brand = "red;background:url(x)";
  assert.equal(T.validateBundle(b).ok, false);
  b = bundle(); b.appearance.email.footer = "<img src=x onerror=alert(1)>";
  assert.equal(T.validateBundle(b).ok, false, "markup in text");
  b = bundle(); b.appearance.links.privacy = "javascript:alert(1)";
  assert.equal(T.validateBundle(b).ok, false);
  b = bundle(); b.appearance.colors.brand = "#E8D9A0";
  assert.match(T.validateBundle(b).errors.join("\n"), /too faint/, "a brand colour nobody could read");
  b = bundle(); b.appearance.surprise = 1;
  assert.equal(T.validateBundle(b).ok, false, "an unknown key");
  b = bundle(); b.manifests = [];
  assert.match(T.validateBundle(b).errors.join("\n"), /no such manifest/);
});

test("distributor identifiers follow the brand's own pattern and nothing else gets through", function () {
  var a = json("appearance.json");
  assert.equal(T.distributorId(a, "Wren_22"), "wren_22");
  assert.equal(T.distributorId(a, "../../etc"), "");
  assert.equal(T.distributorId(a, "<script>"), "");
  assert.equal(T.distributorId({ distributor: { pattern: "numeric" } }, "12345"), "12345");
  assert.equal(T.distributorId({ distributor: { pattern: "numeric" } }, "abc"), "");
  assert.equal(T.distributorId({ distributor: { pattern: "anything" } }, "abc"), "");
});

test("every capability is refused across customers, whatever the role", function () {
  T.ROLES.forEach(function (role) {
    T.CAPABILITIES.forEach(function (cap) {
      var r = T.can({ role: role, tenant: "copperline-co", handle: "x" }, cap, { tenant: "meadowlark-co", owner: "x" }, NOW);
      assert.equal(r.allowed, false, role + " " + cap);
    });
  });
  assert.equal(T.can({ role: "owner", tenant: "meadowlark-co" }, "config.publish", {}, NOW).reason, "cross_tenant", "no resource tenant is not a pass");
  assert.equal(T.can({ role: "superuser", tenant: "meadowlark-co" }, "config.read", { tenant: "meadowlark-co" }, NOW).reason, "unknown_actor");
  assert.equal(T.can(owner, "everything", { tenant: "meadowlark-co" }, NOW).reason, "unknown_capability");
});

test("an affiliate reads their own prospects only; team or upline is not ownership", function () {
  var wren = { role: "affiliate", tenant: "meadowlark-co", handle: "wren", upline: "ash", team: ["finch"] };
  assert.equal(T.can(wren, "prospect.read", { tenant: "meadowlark-co", owner: "wren" }, NOW).allowed, true);
  assert.equal(T.can(wren, "prospect.read", { tenant: "meadowlark-co", owner: "finch" }, NOW).reason, "not_owner");
  assert.equal(T.can({ role: "affiliate", tenant: "meadowlark-co", handle: "ash", team: ["wren"] }, "prospect.export", { tenant: "meadowlark-co", owner: "wren" }, NOW).reason, "not_owner");
  assert.equal(T.can(wren, "prospect.read", { tenant: "meadowlark-co" }, NOW).reason, "not_owner", "a list with no owner is not theirs");
  assert.equal(T.can(wren, "config.publish", { tenant: "meadowlark-co" }, NOW).reason, "role");
  assert.equal(T.can({ role: "analyst", tenant: "meadowlark-co" }, "prospect.read", { tenant: "meadowlark-co", owner: "wren" }, NOW).reason, "role", "an analyst sees totals, not people");
  assert.equal(T.can({ role: "admin", tenant: "meadowlark-co" }, "prospect.read", { tenant: "meadowlark-co", owner: "wren" }, NOW).reason, "role");
});

test("support works only under a short, named, audited grant", function () {
  var grant = { ticket: "T-1", approvedBy: "o1", reason: "alert not arriving", capabilities: ["prospect.read", "deployment.health"], prospect: "p-9",
    from: "2026-11-12T11:00:00Z", until: "2026-11-12T15:00:00Z" };
  var s = { role: "support", tenant: "meadowlark-co", handle: "s1", grant: grant };
  var res = { tenant: "meadowlark-co", owner: "wren", prospect: "p-9" };
  var ok = T.can(s, "prospect.read", res, NOW);
  assert.deepEqual([ok.allowed, ok.audit], [true, true]);
  assert.equal(T.can(s, "prospect.read", Object.assign({}, res, { prospect: "p-10" }), NOW).reason, "support_scope", "one named record");
  assert.equal(T.can(s, "prospect.read", { tenant: "meadowlark-co" }, NOW).reason, "support_scope", "never a list");
  assert.equal(T.can(s, "config.read", res, NOW).reason, "support_scope", "not in the grant");
  assert.equal(T.can(s, "prospect.read", res, Date.parse("2026-11-12T15:00:00Z")).reason, "support_grant_expired");
  assert.equal(T.can({ role: "support", tenant: "meadowlark-co" }, "deployment.health", res, NOW).reason, "support_grant_required");
  var long = Object.assign({}, grant, { until: "2026-11-14T11:00:00Z" });
  assert.equal(T.can(Object.assign({}, s, { grant: long }), "prospect.read", res, NOW).reason, "support_grant_invalid", "longer than a day");
  assert.equal(T.can(s, "prospect.export", res, NOW).reason, "role");
  assert.equal(T.can(Object.assign({}, s, { tenant: "copperline-co" }), "prospect.read", res, NOW).audit, true, "a refused support attempt is audited too");
});

test("a suspended, revoked or unknown customer is refused at the gate", function () {
  assert.equal(T.gate({ id: "meadowlark-co", status: "active" }).allowed, true);
  assert.deepEqual(T.gate({ id: "meadowlark-co", status: "suspended" }), { allowed: false, reason: "suspended" });
  assert.deepEqual(T.gate({ id: "meadowlark-co", status: "revoked" }), { allowed: false, reason: "revoked" });
  assert.equal(T.gate({ id: "meadowlark-co" }).allowed, false);
  assert.equal(T.gate(null).allowed, false);
  assert.equal(T.gate({ status: "active" }).allowed, false);
});

test("publish, change, roll back: versions are kept and nothing is changed in place", function () {
  var r0 = T.empty(), frozen = JSON.stringify(r0);
  var p1 = T.publish(r0, bundle(), owner, NOW);
  assert.equal(p1.ok, true); assert.equal(JSON.stringify(r0), frozen, "the registry handed in is untouched");
  assert.equal(T.publish(p1.registry, bundle(), owner, NOW).unchanged, true, "publishing the same thing twice is one version");
  var b2 = bundle(); b2.appearance.colors.accent = "#AA5500";
  var p2 = T.publish(p1.registry, b2, owner, NOW + 1000);
  assert.notEqual(p2.version, p1.version);
  assert.equal(T.active(p2.registry, "meadowlark", owner, NOW).appearance.colors.accent, "#AA5500");
  var back = T.rollback(p2.registry, "meadowlark", owner, null, NOW + 2000);
  assert.equal(back.version, p1.version);
  assert.equal(T.active(back.registry, "meadowlark", owner, NOW).appearance.colors.accent, "#C97B3A", "the earlier look is back exactly");
  assert.equal(back.registry.deployments.meadowlark.history.length, 2, "history is kept");
  assert.equal(T.rollback(back.registry, "meadowlark", owner, "0000000000000000", NOW).reason, "no_such_version");
  // An invalid change leaves what was live exactly as it was.
  var bad = bundle(); bad.appearance.logo.url = "http://x.example/a.png";
  var p3 = T.publish(back.registry, bad, owner, NOW);
  assert.equal(p3.ok, false); assert.equal(p3.registry, back.registry);
});

test("one customer cannot publish, read, roll back or disable another's brand", function () {
  var reg = T.publish(T.empty(), bundle(), owner, NOW).registry;
  var them = { role: "owner", tenant: "copperline-co", handle: "c1" };
  assert.equal(T.publish(reg, bundle(), them, NOW).reason, "cross_tenant");
  assert.equal(T.rollback(reg, "meadowlark", them, null, NOW).reason, "cross_tenant");
  assert.equal(T.setStatus(reg, "meadowlark", them, "disabled", NOW).reason, "cross_tenant");
  assert.equal(T.active(reg, "meadowlark", them, NOW), null);
  // Taking over a brand id by claiming it under your own customer is refused.
  var hijack = other(); hijack.brand.brandId = "meadowlark"; hijack.appearance.brandId = "meadowlark";
  assert.equal(T.publish(reg, hijack, them, NOW).reason, "brand_belongs_to_another_customer");
  assert.equal(T.publish(reg, bundle(), { role: "presentation_editor", tenant: "meadowlark-co" }, NOW).reason, "role");
});

test("disabling one brand changes nothing for any other", function () {
  var reg = T.publish(T.empty(), bundle(), owner, NOW).registry;
  var them = { role: "owner", tenant: "copperline-co", handle: "c1" };
  reg = T.publish(reg, other(), them, NOW).registry;
  var before = JSON.stringify(reg.deployments.copperline);
  var off = T.setStatus(reg, "meadowlark", owner, "disabled", NOW);
  assert.equal(off.ok, true);
  assert.equal(T.active(off.registry, "meadowlark", owner, NOW), null);
  assert.equal(JSON.stringify(off.registry.deployments.copperline), before);
  assert.notEqual(T.active(off.registry, "copperline", them, NOW), null);
  var on = T.setStatus(off.registry, "meadowlark", owner, "enabled", NOW);
  assert.notEqual(T.active(on.registry, "meadowlark", owner, NOW), null);
  assert.equal(T.setStatus(reg, "meadowlark", owner, "deleted", NOW).reason, "invalid_status");
});

test("embedded players: only a co-operating frame on an approved origin is heard", function () {
  assert.equal(T.coverage("web"), "full"); assert.equal(T.coverage("iframe_opaque"), "limited");
  assert.equal(T.coverage("pdf"), "none"); assert.equal(T.coverage("something-new"), "none", "unknown is none, not a guess");
  var origins = ["meadowlark-home.example"], msg = { source: "pi-embed", v: 1, type: "scene", index: 2, total: 6 };
  assert.deepEqual(T.acceptMessage({ origin: "https://meadowlark-home.example", data: msg }, origins), { type: "scene", index: 2, total: 6 });
  assert.equal(T.acceptMessage({ origin: "https://evil.example", data: msg }, origins), null);
  assert.equal(T.acceptMessage({ origin: "http://meadowlark-home.example", data: msg }, origins), null);
  assert.equal(T.acceptMessage({ origin: "https://meadowlark-home.example.evil.example", data: msg }, origins), null);
  assert.equal(T.acceptMessage({ origin: "https://meadowlark-home.example", data: Object.assign({}, msg, { index: 9999 }) }, origins), null);
  assert.equal(T.acceptMessage({ origin: "https://meadowlark-home.example", data: { source: "pi-embed", v: 1, type: "cta", action: "<b>" } }, origins), null);
  // Extra fields a frame adds are dropped, never passed on.
  assert.deepEqual(T.acceptMessage({ origin: "https://meadowlark-home.example", data: { source: "pi-embed", v: 1, type: "cta", action: "shop", email: "a@b.example" } }, origins), { type: "cta", action: "shop" });
  assert.equal(T.acceptMessage({ origin: "https://meadowlark-home.example", data: "scene" }, origins), null);
});
