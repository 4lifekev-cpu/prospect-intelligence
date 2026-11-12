# Status of this package — 12 November 2026

Release 1.13.1. 208 tests pass. Three consumers (two sites and the sandbox brand) carry the
same browser bundle and evaluator; `tools/compare.mjs` reports an identical core.

| Part | Built | Used by a consumer | Live anywhere |
| --- | --- | --- | --- |
| Engine, evaluator, row shape, outcomes, config contracts | yes | yes, both sites (on their release branches) | an older release only |
| Rules 3.0.0 | yes | switched off in both | no |
| Intercepts and questions | yes | switched off in both | no |
| Tenancy (permissions, gate, versioned configuration) | yes | sandbox only | no |
| Provisioning tool `tools/admin.mjs` | yes | sandbox only | no |
| Integration contract | yes | nobody | no |
| Web admin screen, hosted registry, live integrations | no | — | — |

Known gaps: coverage is not computed per declared route; a shared browser is not asked who is
using it (the consumers keep replaced contact details in history instead).

Each consumer keeps its own release audit beside its code.
