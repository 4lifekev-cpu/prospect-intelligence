# A third brand, by configuration only

Meadowlark Home is a made-up direct-sales home goods company. It is here to prove one thing: a
new brand runs on the same engine as every other consumer with **no change to the engine**.

What makes it a brand is in four data files and one adapter:

| File | What it holds |
| --- | --- |
| `brand.json` | ids, terminology, approved domains, rule version, switches (`pi-brand-config@1`) |
| `appearance.json` | logo, colours, email look, links, approved resources and disclosures, how a distributor is named on a link (`pi-brand-appearance@1`) |
| `presentation.json` | its one presentation: scenes, topics, narration lengths, what each button means (`pi-presentation-manifest@1`) |
| `paths.json` | the two routes a guest can choose and what each means |
| `scripts/pi-adapter.cjs` | points the comparison tool at this consumer's vendored files |

`vendor/` and `pi.lock.json` are written by `tools/vendor.mjs`. `site/` is written by
`tools/admin.mjs preview`. Neither is edited by hand.

```
node tools/vendor.mjs --consumer sandbox/third-brand            # copy this release in and pin it
node tools/admin.mjs validate sandbox/third-brand               # check every file
node tools/admin.mjs publish  sandbox/third-brand --actor owner # version it in sandbox/registry.json
node tools/admin.mjs preview  sandbox/third-brand               # write site/ (a page you can open)
node tools/admin.mjs health                                     # what is live, on which release
node tools/admin.mjs rollback meadowlark --actor owner          # back to the previous version
```

Nothing here is deployed anywhere, and the domain is a reserved example name that cannot resolve.
