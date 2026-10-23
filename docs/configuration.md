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

The pinned `@deepseek-ai/cordis@4.0.5` peer dependency can produce a pnpm peer warning during profile installation. A warning alone is not a failed installation; confirm that `dsh plugin --profile web list` includes Loom and that Web reaches readiness. Do not bypass a runtime/SDK version refusal.

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

Child requests for human answers or approvals return logged errors immediately; the child can report missing decisions in its final answer. Expansion checks budgets before creating forks. The usage watcher stops children when settled own usage crosses a token or dollar budget; the last response can overshoot it. Autonomous budgets and queued branch admission live in Host memory and reset on restart. See the [autoloom workflow](guide.md#autoloom).

<a id="weave-provider-setup"></a>
## Weave provider setup

The pinned Pi catalog does not declare Loom's optional generation capabilities. Selecting a catalog model or changing the model picker cannot enable them. Declare `assistantPrefill` and, for probability controls, `tokenLogprobs` on the exact model in a `loom-compat-llm-pi-ai` overlay. These declarations require the `openai-completions` protocol; Anthropic Messages and OpenAI Responses routes do not support these Loom controls in this bundle.

| Route | Prefix declaration | Evidence and limits |
|---|---|---|
| DeepSeek official beta, `deepseek-flash` | `deepseek-prefix` | The [official prefix guide](https://api-docs.deepseek.com/guides/chat_prefix_completion/) requires the beta endpoint and prefix flag. Its [Chat API](https://api-docs.deepseek.com/api/create-chat-completion) documents answer logprobs. Wire serialization has keyless tests; this audit did not make a funded official-API call. |
| OpenRouter, `deepseek/deepseek-v4.1-flash-1017`, pinned to provider `deepseek` | `trailing-message` | The standalone acceptance run recorded continuations and probabilities on this route. This is route-specific evidence, not a guarantee for other OpenRouter models, providers, or later routes. |

For the official route, merge the following provider into your overlay, retaining every existing provider because a patch replaces the complete `config`. Store the key in Harness credentials under the named reference or in your private launch environment; the example contains no key. Select **DeepSeek Weave → deepseek-flash** in Weave's model picker after restart.

```yaml
- id: loom-compat-llm-pi-ai
  config:
    providers:
      loom-deepseek-beta:
        displayName: DeepSeek Weave
        apiKeyEnv: DEEPSEEK_API_KEY
        api: openai-completions
        baseURL: https://api.deepseek.com/beta
        compat:
          thinkingFormat: deepseek
        models:
          - id: deepseek-flash
            assistantPrefill: deepseek-prefix
            tokenLogprobs:
              maxTopLogprobs: 20
            reasoningEfforts:
              off:
              high: high
```

For the previously tested OpenRouter route, use `api: openai-completions`, `baseURL: https://openrouter.ai/api/v1`, your `OPENROUTER_DEEPSEEK_API_KEY` credential reference, `compat: { thinkingFormat: openrouter }`, and `openRouterProvider: { order: [deepseek], allowFallbacks: false }`. Declare `assistantPrefill: trailing-message`, the same `tokenLogprobs` block, and `reasoningEfforts: { off: null, high: high }` on model `deepseek/deepseek-v4.1-flash-1017`. Never copy an account-specific preset model ID into shared configuration.

Start with one short continuation. A capability declaration records what the endpoint promises; it does not add provider support. If the provider rejects the prefix or returns no aligned probabilities, remove the unsupported declaration or choose another documented route. Weave sends tool-free calls, disables reasoning where the model declares an Off setting, and annotates answer text only when probabilities were captured.

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
