# Check and release Loom

English | [中文](releasing.zh.md)

Use this guide to check changes and publish a new `@scasella/dsh-loom` version from `scasella/dsh-loom`. End users should follow [installation](../README.md#install). Published versions and Git tags are immutable.

## Continuous checks

[Checks](https://github.com/scasella/dsh-loom/blob/main/.github/workflows/checks.yml) runs for pull requests, pushes to `main`, manual dispatch, and calls from the release workflow. Its Ubuntu matrix uses Node `22.19.0` and `24`, with pnpm `10.11.1` available for the official Harness plugin CLI.

Each job installs the locked development dependencies with `npm ci`, builds Host and browser output, runs strict typechecking and package checks, and packs one archive. It independently installs official `@deepseek-ai/dsh@0.2.1-rc.2` and `@earendil-works/pi-ai@1.3.0`, then runs the [stock verifier](https://github.com/scasella/dsh-loom/blob/main/scripts/verify-stock.mjs) with `--all-tests --web-smoke` against that archive. The verifier uses an isolated home and allocated port, checks installation and removal, and confirms that the official runtime stays unchanged.

Jobs upload `loom-package-22.19.0` and `loom-package-24`, each containing the tested `.tgz` and `SHA256SUMS`. Release builds do not restore dependency caches. Model keys are empty; these checks require no repository secrets or paid model calls. They cover installed integration and Web startup, without claiming a browser interaction walkthrough or live provider coverage.

## Trusted publisher settings

Create the GitHub environment `npm` and restrict its deployment policy to tags matching `v*`. In the npm package's trusted publisher settings, keep this GitHub Actions configuration:

| Field | Value |
| --- | --- |
| Organization or user | `scasella` |
| Repository | `dsh-loom` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed action | Direct publishing with `npm publish` enabled |

The publisher uses GitHub-hosted Ubuntu, Node `24`, npm `11.21.0`, and job permissions `contents: read` plus `id-token: write`. npm exchanges the GitHub identity for a short-lived publishing credential and attaches provenance. Do not add an `NPM_TOKEN` secret. Keep the npm maintainer account's two-factor authentication enabled.

[npm's current trusted publishing policy](https://docs.npmjs.com/trusted-publishers/) requires the first successful publication within two days after creating a trusted publisher. Saving the configuration or running a dry run does not validate it. If it expires before the next release, recreate it when ready to publish; check the linked policy for changes. Stage publishing is always permitted by npm, so explicitly enable direct publishing for this workflow.

## Prepare a version

Choose an unpublished version and update these values together:

| File | Version location |
| --- | --- |
| [package.json](../package.json) | `version` |
| [package-lock.json](https://github.com/scasella/dsh-loom/blob/main/package-lock.json) | Top-level `version` and `packages[""].version` |
| [src/index.ts](https://github.com/scasella/dsh-loom/blob/main/src/index.ts) | `loomMetadata` version |
| [scripts/build-client.mjs](https://github.com/scasella/dsh-loom/blob/main/scripts/build-client.mjs) | Browser package metadata version |

Update pinned installation commands, npm badges, and versioned documentation links for the new release. Keep old release assets and demo links usable. Run `npm ci`, `npm run build`, `npm run typecheck`, and `npm run pack:check`; then pack and verify the fresh archive against an independent official installation as described in [Verification](../VERIFICATION.md). Include `--all-tests --web-smoke` in that verifier run.

Commit the reviewed changes to `main`, push them, and wait for Checks to pass. For example, after preparing version `0.1.0-alpha.5` on `main`:

```sh
git push origin main
git tag -a v0.1.0-alpha.5 -m 'Loom v0.1.0-alpha.5'
git push origin v0.1.0-alpha.5
```

## Tagged publication

[Publish](https://github.com/scasella/dsh-loom/blob/main/.github/workflows/publish.yml) accepts `v*` tag pushes. It requires the tag to match every version location above and the tagged commit to belong to `main`. Supported prerelease channels map directly to npm distribution tags:

| Version example | npm tag |
| --- | --- |
| `1.0.0-alpha.1` | `alpha` |
| `1.0.0-beta.1` | `beta` |
| `1.0.0-rc.1` | `rc` |
| `1.0.0-next.1` | `next` |
| `1.0.0` | `latest` |

A tag push reruns the complete Checks matrix. Publication is limited to actual tag-push events in `scasella/dsh-loom`. The publisher downloads the tested Node `24` artifact, verifies its checksum, and publishes that exact archive with public access, the selected npm tag, provenance, and lifecycle scripts disabled. It does not rebuild the package in the publishing job.

After the workflow succeeds, confirm the version, distribution tag, and provenance on npm and test the pinned `dsh plugin --profile web add` command in an isolated home. Create the matching GitHub release separately with release notes, the verified archive and checksum, installation instructions, and the existing demo link. If a tag or npm version already exists, prepare a new version instead of moving or overwriting it.

## Dry run and failures

Run the release workflow manually to exercise its checks and publication preview without publishing:

```sh
gh workflow run publish.yml --ref main
```

Manual dispatch runs the full checks and `npm publish --dry-run` only. It cannot publish, and a passing preview does not establish that npm accepted the OIDC identity. The first real tagged publication is the verification of trusted publishing.

For authentication failures, compare npm's owner, repository, workflow filename, environment, and direct-publish permission with the table above, then check configuration expiry. For version or ancestry failures, fix the source on `main` and issue a new matching tag. For failed checks, inspect the failing job and fix the change before releasing; do not bypass the tested-artifact path.
