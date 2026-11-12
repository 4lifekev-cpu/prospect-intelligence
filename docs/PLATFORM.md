# ProspectIntelligencePlatform.com — plan, not a build

Status: **documentation only.** No domain record, hosting, database or account was created for
this. Nothing below exists until an agreement with a first outside customer is signed and the
owner approves the build.

## What it would be

One place where a licensed customer's owner signs in to set up their brand, preview it, publish
it, and see its health. It is the web form of `tools/admin.mjs`, on the same functions in
`src/tenancy.js`; no new rules.

## What it needs that does not exist yet

| Need | Why | Decision owner |
| --- | --- | --- |
| A signed customer agreement and data-processing terms | No effort or brand is committed before this | Owner, with counsel |
| A database with row-level security keyed by customer id | The file registry is for one operator on one machine | Owner |
| Sign-in for customer staff, with the six roles | `can()` needs a trustworthy actor | Owner |
| An audit log store | Support grants and publishes must be reviewable | Owner |
| A verified email-sending domain per brand | A brand cannot send until verified | Each customer |
| Counsel's review of privacy wording per brand | Each brand is the controller of its prospects' data | Each customer, with counsel |
| A security review against the build standard, and a penetration test before any outside customer | Cross-customer isolation is the product's first promise | Owner |
| Pricing and billing | Not designed | Owner |

## Order of work, when approved

1. Database and sign-in; port the registry; every `tenancy` test rerun against the database.
2. Admin screens: validate, preview, publish, roll back, disable, health.
3. Move the two existing sites onto the hosted registry, one at a time, each reversible.
4. Outside security review.
5. First outside customer, in the sandbox first.

## What can be said about it today

That the engine already runs three brands from configuration in test, and that customer
isolation rules are written and tested as code. Not that a platform is available, not a launch
date, and no security certification.
