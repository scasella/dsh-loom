# Configure Loom

English | [中文](configuration.zh.md)

Use this reference after [installing the standalone Web bundle](../README.md#install). Keep the same `DSH_HOME` when installing, configuring, and launching it. Supported runtime versions and existing-profile migration are documented in [Compatibility](../COMPATIBILITY.md).

## Apply a profile overlay

Save the following as `loom-config.overlay.yml`. It limits manual branch admission and autonomous exploration, and makes worktree isolation the default. Worktrees require a committed Git repository and workspace-write permission; use `shared` when branches should use the source folder.

```yaml
- id: loom
  config:
    defaultIsolation: worktree
    maxBranchesPerRequest: 4
    maxConcurrentBranches: 2
- id: tool-loom
  config:
    autoloom:
      maxBranches: 4
      maxDepth: 2
      maxOwnTokens: 100000
      childPermissionPreset: loom-child
```

Launch through the original Harness command:

```sh
dsh web --patch /absolute/path/loom-config.overlay.yml --no-open --port 3097
```

A patch replaces the selected entry's complete `config`; omitted fields take schema defaults. Copy any existing custom fields into your replacement. Keep `childPermissionPreset: loom-child` in a custom `tool-loom` configuration: the plugin schema defaults to `auto`, while this bundle explicitly supplies `loom-child`. Configure model credentials through Settings; keep secrets out of overlays and shared examples.

## Branching and workspace changes

These fields belong to the `loom` entry. The [user guide](guide.md#compare) explains Apply, Adopt, and Discard.

| Key | Default | Effect |
|---|---|---|
| `maxBranchesPerRequest` | `8` | Maximum children per manual branch request; excess is refused before forking. |
| `maxConcurrentBranches` | `4` | Maximum children being admitted or running their first prompt across all sets. |
| `retainedBranchSets` | `256` | Finished sets held in Host memory; finished sets are evicted in creation order. |
| `defaultIsolation` | `shared` | `shared` uses the source folder; `worktree` gives each child its own checkout. |
| `concurrentWritableBranches` | `false` | Writable shared-folder children are admitted serially per folder; isolated and read-only children are exempt. |
| `worktreeBranchPrefix` | `loom/` | Prefix of owned worktree branches and directory names. |
| `diff.maxBytes` | `262144` | Maximum returned unified diff size in UTF-8 bytes. |
| `apply.maxPatchBytes` | `33554432` | Maximum binary patch size before Apply refuses a write. |
| `outcomes.commandTools` | `[{ name: bash, commandArgument: command }]` | Tool results whose own visible text Compare treats as command output. |
| `outcomes.testSummary` | unittest, pytest, Vitest, Jest patterns | Summary and count regexes parsed from command text; absent matches do not imply success. |

The bundled worktree service is isolated from other worktree providers. Its entry ID is `loom-worktree`; its default pool is `.agents/worktrees` inside the source repository. Worktrees carry tracked changes but exclude untracked and ignored files, and do not install dependencies. Apply requires a clean source checkout; Adopt retains histories and does not remove checkouts.

## List prices

No prices ship by default. Add rows to `loom.config.pricing` only for routes you intend to price, using current figures from your provider. Rows must match the exact provider and model IDs recorded in requests. Without a configured price or complete usage, cost displays cannot supply a dollar amount.

| Price-row key | Required value |
|---|---|
| `provider` | Registered provider route ID. |
| `model` | Model ID used by that route. |
| `inputMissPerMTok` | USD per million uncached input and cache-write tokens. |
| `inputHitPerMTok` | USD per million cache-read tokens. |
| `outputPerMTok` | USD per million output tokens, including reasoning. |

All three prices must be finite and nonnegative. Empty route IDs and duplicate provider/model rows refuse plugin load. Dollar figures are list-price estimates; they are not an account balance or invoice. Shared-prefix scheduling does not guarantee cache hits.

## Autonomous exploration

These fields belong to `tool-loom`. The bundled `loom-child` preset uses `sandbox: read-only` and `approval: never`. If another overlay replaces `permission.config.presets`, retain every preset your profile uses, including `loom-child`.

| Key | Default in this bundle | Effect |
|---|---|---|
| `autoloom.maxBranches` | `8` | Maximum children started by one weaver Session. |
| `autoloom.maxDepth` | `2` | Maximum child generation; the first expansion is generation one. |
| `autoloom.maxOwnTokens` | `2000000` | Sum of children's own input, cache, and output tokens. |
| `autoloom.maxUsd` | Omitted | Optional positive, finite list-price dollar budget; all selected routes need configured prices and priced estimates. |
| `autoloom.childPermissionPreset` | `loom-child` | Applied before each child's first prompt; its approval policy must be `never`. |
| `defaultWaitMs` / `maxWaitMs` | `120000` / `1800000` | Default and maximum wait for `loom_wait`, in milliseconds. |
| `defaultReadChars` / `maxReadChars` | `4000` / `20000` | Default and maximum output length for `loom_read`, in characters. |

Expansion checks budgets before creating forks. The usage watcher stops children when settled own usage crosses a token or dollar budget; the last response can overshoot it. Autonomous budgets and queued branch admission live in Host memory and reset on restart. See the [autoloom workflow](guide.md#autoloom).

## Weave, token probes, and exports

These fields belong to `loom`. Provider capabilities still determine whether prose prefixes and token probabilities are available; changing a limit cannot add unsupported model features.

| Key | Default | Effect |
|---|---|---|
| `weave.maxSiblings` | `4` | Maximum alternatives per prose request; configurable up to `16`. |
| `weave.maxTokens` | `200` | Default and upper output-token limit per prose sibling. |
| `weave.temperature` / `weave.topLogprobs` | `1` / `10` | Default temperature and captured token alternatives; alternatives range from `0` to `20`. |
| `weave.leadDelayMs` / `weave.timeoutMs` | `1500` / `120000` | Lead scheduling delay and whole-operation timeout, in milliseconds. |
| `weave.warmWindowMs` / `weave.maxPrefixCodePoints` | `3600000` / `262144` | Warm-prefix window in milliseconds and maximum prefix length in Unicode code points. |
| `probe.maxDepth` / `probe.maxRequests` | `4` / `32` | Maximum token depth and provider calls in a probe. |
| `probe.cutoff` / `probe.topLogprobs` | `0.02` / `20` | Minimum cumulative path probability and captured alternatives per probe call. |
| `export.maxBytes` / `export.maxDownloads` | `16777216` / `64` | Maximum encoded snapshot bytes and retained download count. |
| `export.ttlMs` | `300000` | Download URL lifetime in milliseconds. |

This reference covers common settings, not every Remote method or advanced field. The source declarations define [Loom settings](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/loom/src/index.ts), [autoloom settings](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/tool-loom/src/index.ts), and [worktree settings](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/worktree/src/index.ts). Return to the [user guide](guide.md) for workflows and saved-data limits.
