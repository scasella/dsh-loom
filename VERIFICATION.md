# Standalone Loom verification

Verified on macOS with the official npm package `@deepseek-ai/dsh@0.2.1-rc.2`, its resolved `@earendil-works/pi-ai@1.3.0`, and pnpm 10.11.1. The reference fork stays at `77ccab27d200241ddf49d0ec9f5de1524343374f`; upstream source is `687f282e8625c6b8d11ff58211a90524be2e4317`. The standalone package neither links the reference checkout nor replaces official installation files.

## Repeat the checks

Build from this source project:

```sh
npm ci
npm run build
npm run typecheck
npm run pack:check
npm pack
```

Provide a complete, independent official npm installation and the packed archive to the verifier:

```sh
DEEPSEEK_API_KEY= OPENROUTER_DEEPSEEK_API_KEY= npm run verify:stock -- \
  --runtime /absolute/path/official/node_modules/@deepseek-ai/dsh \
  --tarball /absolute/path/scasella-dsh-loom-0.1.0-alpha.3.tgz \
  --web-smoke
```

The verifier creates a private temporary home, installs through the original `dsh plugin` CLI, runs eight integration tests against the installed tarball, checks Web startup on an allocated port, removes the bundle through the same CLI, checks bundle rollback, and compares the original installation's files. It clears model keys, starts no paid calls, prints the archive checksum, and removes its temporary files and owned processes. It refuses a linked source checkout as the official runtime. It does not create a version exemption.

For all 48 tests, set `LOOM_STOCK_NODE_MODULES` to the official installation's `node_modules` and `LOOM_INSTALLED_PACKAGE` to the bundle installed in an isolated Web profile, then run `DEEPSEEK_API_KEY= OPENROUTER_DEEPSEEK_API_KEY= npm test`. The installed package is necessary: importing a development build beside development dependencies can create duplicate Session classes and is not a valid runtime proof.

## Results

| Check | Result |
| --- | --- |
| Independent Host/browser build | Pass: 22 Host entries in one shared ESM graph; ten browser factories |
| Strict Host and Client TypeScript | Pass; 1,672 Host and 980 Client compiler inputs; none outside the standalone project |
| Standalone tests | 48 passed, zero failed/skipped |
| Fresh official-CLI install and activation | Pass, without source aliases, symlinks, patched installed files, or version exemptions |
| Installed-tarball integration | Eight passed using stock services, actual JSONL persistence, SQLite, Git and subprocess output |
| Web readiness/authentication | Pass on an allocated port |
| Removal and original bundle rollback | Pass |
| Original runtime unchanged | 68,789 file/directory/link entries unchanged; tree digest `528f5227fc341f170cb7eb484b00fc74bb6ca3f4ebb8cf06e984ac6d223f9460` |
| Package privacy and completeness | Pass: npm-selected files scanned for credentials, private files, machine paths, missing distribution imports and providers |
| Third-party licenses | Fourteen full license copies; no missing files or hash mismatches |

## Feature evidence

| Plan scope | Standalone evidence |
| --- | --- |
| L1–L2 orientation and siblings | Live inherited fold, own/inherited footer, crumbs, nested sidebar and 390-pixel sibling chooser; installed history/lineage tests |
| L3–L5 generation and running work | Installed regenerate/edit/steer/variant tests, deduplication, lazy writable queue and cancelled admission; two live worktree branches |
| L6–L7 compare and decisions | Real passing Python tests, differing file diffs, costs, Apply/Adopt/Discard; persisted records, applied source bytes and final Git worktree list checked |
| L8–L10 tree and shell | Live APG tree/reader, Multiverse, nested fork families and distinct fork titles |
| L11–L13 routes, isolation and editing | Installed route inheritance/override/edit tests; actual tracked/untracked snapshot, dirty/conflict refusal and worktree tests |
| L14 counterfactual result | Live content override rendered in Chat; persisted continuation marker; no new human message or repeated tool call; source result unchanged |
| L15 private marks | Live keyboard Keep; actual cold JSONL mark/reload tests |
| L16–L17 probabilities and prefix | Live captured answer probabilities, alternative-token and recorded-path continuations; stock SDK serialization and capability-refusal tests |
| L18–L19 curation and export | Two live choices yield two bits; browser HTML download; installed route tests cover path/siblings/kept output and persisted curation |
| L20–L21 keyboard and mobile | Live tree Keep key and 390-pixel bottom sheet; Compare/Weave body and document widths stay 390 pixels |
| L22 scoped search | Live own scope highlights only the source match; inherited scope highlights the four descendant matches; compiled SQLite/controller tests |
| L23 prompt variants | Installed V×K grouping and route/deduplication tests |
| L24 autonomous Loom | Live expand/wait/read/keep/cull and custom cards; persisted noninteractive child preset precedes the `loom` prompt; admission-budget refusal tests |
| L25–L26 prices and requests | Live configured list-price rows; installed estimates and exact reconstructed request tests |
| L27 reasoning cards | Presentation source retained from the verified reference; strict browser compilation and probability tests preserve reasoning separation; this extraction's live walk uses thinking off |
| Weave | Six live continuations across three retained requests, one bounded probe, choices, prefix attribution and reload tests; installed tests assert logging before auxiliary dispatch |

The source coverage map in `test-support/FEATURE-COVERAGE.md` identifies integration fixture collaborators and exclusions. The extraction tests do not claim exhaustive statement coverage or a rerun of the reference repository's complete SDK snapshot/replay corpus. The reference implementation's existing tests and original feature scope remain preserved in the reference fork. The standalone compatibility changes have their own checks above.

The exclusive live browser run used isolated port 3107 and a disposable Git repository. Decoded logs confirmed seven Sessions, the original tool result, five autonomous tool calls, the child permission order, a message-free counterfactual continuation, two curation bits, captured probabilities, and completed worktree removal. Live spending was USD 0.010281852; cumulative Loom spending is USD 0.077045970 of USD 5. Port 3080 and the reference fork were not changed.
