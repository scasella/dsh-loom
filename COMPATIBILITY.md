# Compatibility

## Supported installation

`@scasella/dsh-loom@0.1.0-alpha.5` targets the official Node/Web runtime `@deepseek-ai/dsh@0.2.1-rc.2`, whose upstream source is `687f282e8625c6b8d11ff58211a90524be2e4317`. The installation must resolve `@earendil-works/pi-ai@1.3.0`; readiness refuses a missing or different SDK. Harness declares a broader SDK dependency range, so the same Harness version can resolve another SDK version in a future installation. Other releases, modified runtimes, Desktop distributions, and non-Web profiles have no compatibility claim. The package declares the exact DSH engine requirement; an exemption does not supply missing APIs and is unsupported.

The reference implementation is preserved at `scasella/deepseek-harness`, commit `77ccab27d200241ddf49d0ec9f5de1524343374f`. This extraction carries the full Loom service, tools, browser views, and private compatibility providers. It uses the installed Harness launcher and shared runtime identities. It does not overwrite files in the official installation.

Version `0.1.0-alpha.5` includes the [acceptance review fixes](docs/review-resolutions.md) on npm and GitHub. Supported runtime/SDK versions are unchanged. The package includes the English and Chinese user guides, configuration reference, documentation index, release guide, and review resolutions. Earlier release archives remain unchanged and do not contain these fixes.

## Validation status

Verification passed on 2026-10-19 using the official npm installation, an independently packed tarball, and a fresh isolated Web profile. The original launcher installed the bundle, all eight installed-tarball feature integration tests passed, Web readiness and its authentication exchange passed on an allocated port, and CLI removal restored the original bundle list. Checksums confirmed that all 68,789 official installation entries remained unchanged. No version exemption was used.

The independent source build and both strict TypeScript faces pass; compiler input audits found no files outside this project. The original release suite passed 48 tests; the acceptance correction run passes 108. See [acceptance review corrections](VERIFICATION.md#acceptance-review-corrections) for the dated results and evidence limits. The npm distribution audit checks the selected files, including full third-party license texts, for credential matches, private files, machine paths, and unresolved source imports. The source project includes `scripts/verify-stock.mjs` to repeat clean-profile acceptance against an explicit official installation and tarball.

A separate real-browser run on the original launcher verified worktree branches with real tests, Compare/list prices, Apply/Adopt/Discard, retained Weave choices, captured probabilities, alternative-token and probe-path continuation, export, all five autoloom cards, counterfactual continuation, own/inherited search, tree keyboard marks, and a 390-pixel sibling sheet. Compare and Weave had no document overflow at 390 pixels. Decoded logs and source files confirmed the effects. This run cost USD 0.010281852; total Loom implementation spending is USD 0.077045970 of the approved USD 5 cap.

[VERIFICATION.md](VERIFICATION.md) records the commands and evidence limits. The reference demo remains a recording of the reference fork; this extraction has separate acceptance evidence.

## Configuration migration

For branch isolation, prices, test summaries, and autonomous budgets, use the [configuration reference](docs/configuration.md). The [user guide](docs/guide.md) covers the corresponding Web workflows.

Start with a separate `DSH_HOME`, as shown in [README.md](README.md#install). Existing model/profile overrides are not automatically moved to replacement entries. Reusing an existing home requires a stopped profile and a backup of its configuration and saved data. Keep credentials out of Git and shared configuration examples.

The bundle disables selected stock rows and inserts unique compatibility rows in the same profile. Settings namespaces, when a provider has settings, follow those replacement entry IDs. The Models page targets the replacement Pi adapter. Use the following IDs for explicit profile overlays and saved settings:

| Original profile entry | Loom compatibility entry |
|---|---|
| `agent-loop` | `loom-compat-agent-loop` |
| `session-controller` | `loom-compat-session-controller` |
| `token-meter` | `loom-compat-token-meter` |
| `session-stats` | `loom-compat-session-stats` |
| `session-title` | `loom-compat-session-title` |
| `session-query-sqlite` | `loom-compat-session-query-sqlite` |
| `llm` | `loom-compat-llm` |
| `llm-pi-ai` | `loom-compat-llm-pi-ai` |
| `api-remotes` | `loom-compat-api-remotes` |
| `ui-conversation` | `loom-compat-ui-conversation` |
| `ui-chat` | `loom-compat-ui-chat` |
| `ui-tool` | `loom-compat-ui-tool` |
| `ui-workspace` | `loom-compat-ui-workspace` |
| `ui-shortcuts` | `loom-compat-ui-shortcuts` |
| `ui-subagent` | `loom-compat-ui-subagent` |
| `ui-settings-models` | `loom-compat-ui-settings-models` |

1. Inspect the selected profile's `cordis.patch.yml` and any home or launch overlays. Retarget custom `config` overrides from the original IDs to the corresponding compatibility IDs. Copy the complete configuration object because patches replace `config` wholesale.
2. Remove an original `name` assertion from a retargeted override; it names the stock module, while the replacement is a package-owned file. Do not change the package's installed JavaScript or its generated paths.
3. Do not force-enable a replaced stock row while its compatibility provider is active. Two providers for the same service can prevent startup.
4. Configure models in the replacement Models settings page. Reuse saved credential references where appropriate; do not copy literal credentials into an overlay.
5. The bundle supplies a `loom-child` permission preset and its standard preset list. If a later overlay changes `permission.config.presets`, retain every preset your profile uses, including `loom-child` for autoloom.
6. Restart and check Models settings, a simple Chat turn, branching, and Compare before moving important work to this profile. If startup fails, stop the profile, remove the bundle through the original `dsh plugin` command, and restore the backed-up overlays.

The bundle's new rows disappear when it is removed, and its stock-row disable layer is withdrawn. Custom compatibility-ID overlays remain user configuration; retain or remove them deliberately. Restore the original-ID overrides when returning to the stock profile. Session histories remain in the Harness home; exports and worktree cleanup are separate operations.

<a id="return-to-stock-model-settings"></a>
## Return to stock model settings

Removing Loom keeps its saved model configuration under `loom-compat-llm-pi-ai` and credentials in the same Harness home. The stock adapter reads `llm-pi-ai`, so the model selector can show **No models available** even though no data was deleted. Reinstalling Loom restores its configuration immediately.

To keep using those models without Loom, stop the Web profile and privately back up its `cordis.patch.yml` and credential store. In the selected profile's patch document, copy the complete `config` from the `loom-compat-llm-pi-ai` entry into the existing `llm-pi-ai` entry, or add an original-ID entry if absent. Remove the copied `name` assertion: it names Loom's installed file. Keep the original compatibility entry as your rollback copy. If a stock configuration already exists, reconcile providers deliberately instead of overwriting it. Never duplicate an entry ID.

Before loading the stock adapter, remove Loom-only per-model `assistantPrefill` and `tokenLogprobs` declarations from both `models` and `modelOverrides` and route `openRouterProvider` fields from the stock copy. Retain `apiKeyEnv` references; credentials in this home remain available. Remove Loom through `dsh plugin --profile web remove @scasella/dsh-loom`, restart, and check the Models page and a simple turn. A model or protocol absent from the pinned stock SDK still needs a supported Custom model API configuration. Alternatively, create the providers again from the stock Models page using the same credential references. Keep backups and settings out of Git and shared screenshots.

## Runtime limits

Worktree isolation requires a committed Git repository and workspace-write permission. It carries tracked changes, excludes untracked and ignored files, and does not install dependencies. Apply requires a clean source checkout. Adopt archives sibling histories and does not apply a patch or remove worktrees.

Weave requires tool-free assistant-prefix capability. Probability annotations and token exploration require captured answer probabilities; reasoning and uncaptured text have no probability annotation. Provider support depends on the configured route and explicit model declarations; follow [Weave provider setup](docs/configuration.md#weave-provider-setup). Shared-prefix scheduling can improve cache reuse but does not guarantee cache hits.

No prices ship by default. Dollar figures require configured provider/model prices and are list-price estimates. Autonomous limits are checked before expansion; a final settled response can overshoot token or dollar limits. Branch queues, retained set status, autonomous budgets, warm-prefix hints, and download URLs live in Host memory and do not survive restart. Histories, prose nodes, and choices persist. Experimental record compatibility remains best effort.

## Development checks

Run `npm ci`, `npm run build`, `node --test tests/package.test.mjs`, and `npm run pack:check` in a source checkout. The pack checker inspects npm's actual file selection and packaged text, and refuses missing distribution artifacts, private files, credentials, local machine paths, and unresolved source imports. It does not replace runtime or live tests.

The focused LLM compatibility suite also requires a separate official installation. Set `LOOM_STOCK_NODE_MODULES` to that installation's package resolution directory before running it. Keep this test installation independent of the reference fork. Standalone completion requires the original launcher, the packed tarball, and a fresh isolated home in the acceptance run.
