# Acceptance review resolutions

English | [中文](review-resolutions.zh.md)

This record covers the acceptance review of published `0.1.0-alpha.4`. The fixes below are first included in `0.1.0-alpha.5` on npm and GitHub. The alpha.4 package, tag, and release remain unchanged; upgrade using the [installation instructions](../README.md#install).

## Findings

| Review | Resolution | Behavior |
|---|---|---|
| F1 | Fixed | Autoloom child questions and approvals fail immediately with logged results, including after child reload. Queue admission can proceed. |
| F2 | Fixed | Empty or unknown prose selections cannot export Chat. Transcript export requires explicit `source: sessions`; mixed transcript/node selections are refused. |
| F3 | Documented and guarded | Models warns about compatibility settings before removal. The transfer procedure preserves credentials and existing stock providers; no automatic overwrite occurs. |
| F4 | Fixed | Multiverse adds fork identities; tree rows show persisted variant and sample labels. |
| F5 | Fixed | Running and reloaded strips use the same positional Branch N labels. |
| F6 | Fixed and clarified | Root branching and tree marks keep focus and handle keys once. Branching from a settled failed turn remains supported recovery behavior. |
| F7 | Fixed | Compare shows tokens and list-price cost together. New Apply operations retain bounded diff evidence after checkout removal and restart. |
| F8 | Fixed | `loom_*` cards omit the counterfactual result action. |
| F9 | Fixed | The inspector expands full logged message text, system prompt, and JSON tool definitions as inert text. Attachment bodies and provider wire serialization are not reconstructed by this text view. |
| D1 | Already resolved | The audited source README already targeted alpha.4; current badges and installation links target alpha.5. Immutable earlier published documentation is unchanged. |
| D2 | Fixed | Catalog-model guidance and missing-protocol errors point to Custom model API; the setup reference explains explicit declarations. |
| D3 | Documented | The pinned Cordis peer warning is explained separately from installation failure. |
| D4 / L1 | Setup documented | Exact DeepSeek beta and previously tested OpenRouter declarations are listed; a catalog entry alone does not advertise Loom capabilities. |

## Compatibility and data

The export API defaults to prose and requires a recorded `nodeId`. Callers that intentionally export agent histories must pass `source: 'sessions'` with no `nodeId`. Update custom callers together; an omitted selection now returns `loom/export-unavailable` instead of a transcript.

Apply adds the ignorable `plugin:loom/applied-diff` version-1 record. It contains bounded display evidence and does not add model input. Existing strict `plugin:loom/isolation-end` payloads are unchanged. Readers select only their Session's own recognized version-1 record after a valid isolation record; unknown or malformed evidence is ignored. Older readers can ignore the new discriminator, and older already-applied branches have no recoverable deleted-checkout diff. If evidence cannot be flushed after files were applied, the operation reports `loom/worktree-cleanup-failed` with the applied paths and keeps the checkout.

## Validation and remaining limits

Focused regressions exercise the real official Harness services and independently installed bundle, plus React DOM keyboard and rendering behavior. The model-settings transfer fixture loads through the unmodified stock adapter. The configuration example resolves through the pinned Pi adapter. Packaging scans selected files for private material. Full results are recorded in [verification](../VERIFICATION.md).

The audit's provider access restriction and unfunded official key are environment limits. No new funded official-API call is claimed here. The prior successful OpenRouter acceptance run remains route-specific evidence; provider routing and support can change. Desktop, other Harness/SDK versions, and human translation review remain outside this validation scope.
