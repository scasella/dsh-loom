/** Publication refuses inconsistent package versions, unrelated refs, and foreign artifacts. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { metadataVersion, resolveRelease, validatePackedManifest } from '../scripts/release-plan.mjs'

function input(version = '0.1.0-alpha.5') {
  return {
    repository: 'scasella/dsh-loom', eventName: 'push', ref: `refs/tags/v${version}`,
    manifest: { name: '@scasella/dsh-loom', version, repository: { url: 'git+https://github.com/scasella/dsh-loom.git' } },
    lockfile: { name: '@scasella/dsh-loom', version, packages: { '': { name: '@scasella/dsh-loom', version } } },
    hostVersion: version, clientVersion: version,
  }
}

for (const [version, distTag] of [
  ['0.1.0-alpha.5', 'alpha'], ['0.2.0-beta.1', 'beta'], ['1.0.0-rc.1', 'rc'], ['1.1.0-next.2', 'next'], ['1.0.0', 'latest'],
]) test(`matching ${version} tag selects ${distTag}`, () => {
  assert.deepEqual(resolveRelease(input(version)), {
    version, tag: `v${version}`, distTag, filename: `scasella-dsh-loom-${version}.tgz`, publish: true,
  })
})

test('manual execution on main resolves a dry run only', () => {
  assert.equal(resolveRelease({ ...input(), eventName: 'workflow_dispatch', ref: 'refs/heads/main' }).publish, false)
})

for (const [label, modify] of [
  ['different tag', value => { value.ref = 'refs/tags/v0.1.0-alpha.6' }],
  ['branch push', value => { value.ref = 'refs/heads/main' }],
  ['pull request', value => { value.eventName = 'pull_request' }],
  ['manual branch', value => { value.eventName = 'workflow_dispatch'; value.ref = 'refs/heads/feature' }],
  ['foreign repository', value => { value.repository = 'someone/dsh-loom' }],
  ['foreign package', value => { value.manifest.name = '@someone/dsh-loom' }],
  ['private package', value => { value.manifest.private = true }],
  ['repository mismatch', value => { value.manifest.repository.url = 'git+https://github.com/scasella/other.git' }],
  ['lockfile package version', value => { value.lockfile.version = '0.1.0-alpha.4' }],
  ['lockfile root version', value => { value.lockfile.packages[''].version = '0.1.0-alpha.4' }],
  ['lockfile name', value => { value.lockfile.name = '@someone/dsh-loom' }],
  ['lockfile root name', value => { value.lockfile.packages[''].name = '@someone/dsh-loom' }],
  ['Host version', value => { value.hostVersion = '0.1.0-alpha.4' }],
  ['Client version', value => { value.clientVersion = '0.1.0-alpha.4' }],
]) test(`release refuses ${label}`, () => {
  const value = input()
  modify(value)
  assert.throws(() => resolveRelease(value))
})

for (const version of ['01.0.0', '1.0', '1.0.0-alpha.01', '1.0.0+build', '1.0.0-preview.1', '1.0.0-latest.1', '1.0.0-latest', '1.0.0\nalpha']) {
  test(`release refuses unsupported version ${JSON.stringify(version)}`, () => assert.throws(() => resolveRelease(input(version))))
}

test('compiled face metadata requires one explicit version', () => {
  assert.equal(metadataVersion("{ name: 'loom', version: '0.1.0-alpha.5' }"), '0.1.0-alpha.5')
  assert.throws(() => metadataVersion('{}'))
  assert.throws(() => metadataVersion("{version:'1.0.0', other: {version:'2.0.0'}}"))
})

test('packed manifest must match the checked source', () => {
  const expected = input().manifest
  validatePackedManifest(expected, structuredClone(expected))
  assert.throws(() => validatePackedManifest(expected, { ...expected, version: '0.1.0-alpha.4' }))
  assert.throws(() => validatePackedManifest(expected, { ...expected, scripts: { postinstall: 'unexpected' } }))
})
