# Standalone Loom extraction

The reference implementation remains at `scasella/deepseek-harness`, commit `77ccab27d200241ddf49d0ec9f5de1524343374f`. This project targets the official `@deepseek-ai/dsh@0.2.1-rc.2` installation, based on upstream commit `687f282e8625c6b8d11ff58211a90524be2e4317`.

1. Extract the complete Loom service, tools, browser surfaces, and required compatibility providers into one independently built package. Reuse installed Session, Cordis, Agent registry, error, and LLM marker identities.
2. Build the Host modules in one ESM graph and the browser modules against the official browser module table. Register the generated Remote schemas explicitly. Compose providers through the supported bundle patch mechanism.
3. Pack the distribution, scan its contents, and install that tarball through the original launcher into an isolated profile. Verify configuration, activation, removal, and unchanged upstream files.
4. Exercise the full L1–L27 and Weave feature matrix on that installation, including continuation, counterfactual results, worktree apply, token probabilities, prose generation, export, and model-driven tools. Measure any live spend against the original $5 limit.
5. Document installation, configuration migration, version limits, and verification evidence. Deliver a separate repository and tarball while preserving the reference fork.

No feature is intentionally removed. A failed compatibility check blocks completion rather than reducing the supported feature set.

All five stages are complete. See VERIFICATION.md for the clean official installation, installed-tarball integration tests, live browser evidence, spending, and validation limits.

The standalone bundle confines the reference fork's generic enhancements to its compatibility providers. Disabling or removing it restores stock behavior, including the original fold, title, usage, search and provider implementations. This keeps the upstream installation unchanged while retaining the full Loom experience when enabled.
