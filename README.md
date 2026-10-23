# Loom for DeepSeek Harness

English | [中文](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/README.zh.md)

[![npm alpha](https://img.shields.io/npm/v/@scasella/dsh-loom/alpha?label=npm%20alpha)](https://www.npmjs.com/package/@scasella/dsh-loom/v/0.1.0-alpha.4) [![GitHub release](https://img.shields.io/github/v/release/scasella/dsh-loom?include_prereleases&label=GitHub%20release)](https://github.com/scasella/dsh-loom/releases/tag/v0.1.0-alpha.4)

Generate several continuations, explore them as a tree, and keep every path. Loom adds conversation branching, code comparisons in Git worktrees, and the Weave prose editor to the official DeepSeek Harness Web application.

This community bundle targets **`@deepseek-ai/dsh@0.2.1-rc.2`**. It installs through the original `dsh plugin` command and carries its own compatibility providers. You do not need the reference Harness fork to run it. Install the pinned npm alpha below; the earlier GitHub tarball remains available. Clean-profile installation, startup, removal, and feature checks pass. See [compatibility and validation status](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/COMPATIBILITY.md) before installation.

## Demo

https://github.com/user-attachments/assets/3a35ceab-bd12-4e20-a4c9-b0bda106d687

The 3:54 captioned demo shows the same Loom features with real model calls on the [reference implementation](https://github.com/scasella/deepseek-harness/tree/77ccab27d200241ddf49d0ec9f5de1524343374f), with captured UI states and edited timing. [Full-quality MP4](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.3/Loom.mp4) · [Captions](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.3/Loom.srt).

## Features

- **Branch and read:** regenerate several answers, steer variants, edit prompts into branches, inspect requests and reasoning, and mark alternatives Keep or Set aside.
- **Compare code:** run competing edits in separate Git worktrees, compare tests, diffs, usage, and time, then apply a patch or adopt a branch.
- **Explore observations:** replace a recorded tool result in a fork and continue without rerunning that tool or adding a user message.
- **Write with Weave:** generate continuations at a cursor, retain siblings, inspect supported token probabilities, explore token alternatives, and export prose with curation records.
- **Navigate and delegate:** browse Multiverse families, search own or inherited messages, use keyboard and mobile controls, and let models explore under explicit budgets.

The [Loom user guide](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/docs/guide.md) covers every workflow. See the [documentation index](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/docs/README.md) for configuration, compatibility, and [verification](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/VERIFICATION.md). The npm package includes the English and Chinese user guides, configuration reference, and documentation index. Runtime features and supported Harness/SDK versions are unchanged.

The source checkout includes fixes from the acceptance review that are not yet published in the pinned alpha.4 package. See the [review resolutions](docs/review-resolutions.md), including the empty-Weave-export restriction, before sharing exports.

<a id="install"></a>
## Install

You need Node.js 24+ or Node.js 22.19+ within 22.x, Git 2.26+, pnpm on your PATH, and the official **`@deepseek-ai/dsh@0.2.1-rc.2`** runtime with its installed `@earendil-works/pi-ai@1.3.0` SDK. The bundle refuses an unsupported SDK version. Install that exact runtime if needed:

```sh
npm install --global @deepseek-ai/dsh@0.2.1-rc.2
```

In a POSIX shell, install the pinned npm alpha in a separate home:

```sh
export DSH_HOME="$HOME/.dsh-loom"
dsh plugin --profile web add @scasella/dsh-loom@0.1.0-alpha.4
dsh web --no-open --port 3097
```

The archived [GitHub v0.1.0-alpha.3 tarball](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.3/scasella-dsh-loom-0.1.0-alpha.3.tgz) is an alternative with the same Loom features. Download it, then use `dsh plugin --profile web add /absolute/path/scasella-dsh-loom-0.1.0-alpha.3.tgz` with the same home.

Open the URL printed by the launcher, including its local authentication token. This home and port leave a normal `~/.dsh` installation on port 3080 unchanged. Choose another unused port if 3097 is occupied. Set the same `DSH_HOME` each time you resume Loom. Restart the Web instance after installation or removal.

If you already have custom profiles or model settings, read [configuration migration](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/COMPATIBILITY.md#configuration-migration) before using an existing home. This bundle replaces selected providers only in the profile where you install it. Other runtime versions are unsupported; do not bypass a version refusal.

## First run

1. Open **Settings → Models**, enter your provider credentials, and select a model in the composer. Credentials belong in Harness settings, outside this package.
2. Choose a disposable workspace and start a conversation. After a settled turn, including a failed one, open **Loom** beside Chat.
3. Use **Regenerate ×2**, then switch between children in **Read** and mark a favorite **Keep**. Open **Multiverse** in the sidebar to browse families.
4. For code edits, select worktree isolation before branching and inspect **Compare**. Use a Git repository with at least one commit and allow workspace writes.
5. Open **Weave** for prose. Configure an explicitly capable route using the [Weave provider setup](docs/configuration.md#weave-provider-setup); a catalog model alone does not enable assistant prefixes or probabilities.

Each branch, prose continuation, and token probe can make paid model calls. Start with small counts. No prices ship by default; configured dollar figures are list-price estimates. Set autonomous branch, depth, token, and optional dollar budgets before model-driven exploration.

## Saved data and removal

Session histories, prose, and choices persist. Branch queues and autonomous budgets live in Host memory and do not resume after restart. Worktrees copy tracked changes, exclude untracked and ignored files, and do not install dependencies. Apply requires a clean source checkout. Adopt retains histories and does not apply files or remove worktrees; use Apply or Discard for cleanup.

Export material you intend to keep, stop active branches, and clean up owned worktrees before removing the bundle:

```sh
dsh plugin --profile web remove @scasella/dsh-loom
```

Use the same home and profile, then restart. Models created in Loom remain saved under its compatibility entry and are hidden from the stock Models page after removal; reinstall Loom to restore them, or [transfer model settings before removal](COMPATIBILITY.md#return-to-stock-model-settings). Credentials and Session histories remain in the home. Experimental Loom records may need Loom enabled to render fully.

## Build and license

The source project builds with `npm ci` and `npm run build`. `npm run pack:check` checks the actual npm pack list and scans packaged text for private files, machine paths, and unresolved source imports. Development sources are excluded from the installation tarball. See [COMPATIBILITY.md](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/COMPATIBILITY.md) for supported versions, settings IDs, and validation scope.

Maintainer instructions for continuous checks, trusted publishing, and tagged npm releases are in the [release guide](https://github.com/scasella/dsh-loom/blob/main/docs/releasing.md).

[MIT](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/LICENSE). Loom derives from the archived reference fork at commit `77ccab27d200241ddf49d0ec9f5de1524343374f` and from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), developed by DeepSeek AI. Third-party notices are in [THIRD_PARTY_NOTICES.md](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.4/THIRD_PARTY_NOTICES.md). This package is community maintained and is not an official DeepSeek release.
