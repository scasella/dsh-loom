/** Publication guards exercise refused archives without scanning or printing real credentials. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectPackage } from '../scripts/check-package.mjs'

const migratedDocs = ['docs/README.md', 'docs/README.zh.md', 'docs/guide.md', 'docs/guide.zh.md', 'docs/configuration.md', 'docs/configuration.zh.md']

function archive() {
  const manifest = { name: '@scasella/dsh-loom', engines: { dsh: '0.2.1-rc.2' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }
  return [
    { path: 'package.json', content: JSON.stringify(manifest) },
    ...['README.md', 'README.zh.md', 'COMPATIBILITY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'cordis.patch.yml', ...migratedDocs].map(path => ({ path, content: 'Public documentation' })),
    { path: 'dist/index.js', content: 'export const name = "loom";' },
    { path: 'dist/compat/ui-chat/client.js', content: 'window.__ModuleLoader__.load({ id: "chat", factory: () => ({}) });' },
  ]
}

test('accepts a compiled bundle with public documentation and platform imports', () => {
  const files = archive()
  files.find(file => file.path === 'dist/index.js').content = 'import { Service } from "@deepseek-ai/cordis"; export { Service };'
  assert.deepEqual(inspectPackage(files), [])
})

test('refuses an archive when any migrated guide or documentation index is omitted', () => {
  for (const path of migratedDocs) {
    const files = archive().filter(file => file.path !== path)
    assert.deepEqual(inspectPackage(files), [`Missing required distribution file: ${path}`], path)
  }
})

test('refuses a source-only package even when npm selects its README', () => {
  const files = archive().filter(file => !file.path.startsWith('dist/'))
  assert.ok(inspectPackage(files).some(problem => problem.includes('dist/index.js')))
  assert.ok(inspectPackage(files).some(problem => problem.includes('browser faces')))
})

test('refuses private home files, fixtures, and development source directories', () => {
  for (const path of ['.env', '.env.local', '.npmrc', '.netrc', '.ssh/config', '.artifacts/session.json', 'auth.json', 'credentials/token.json', 'fixtures/session.json', 'vendor/harness/package.json', 'src/index.ts']) {
    assert.ok(inspectPackage([...archive(), { path, content: 'sample' }]).some(problem => problem.includes('Private or source file')), path)
  }
})

test('refuses archive traversal and machine-specific import locations', () => {
  for (const path of ['/absolute/dist.js', '../outside.js', 'C:\\Users\\example\\dist.js']) {
    assert.ok(inspectPackage([...archive(), { path, content: '' }]).some(problem => problem.includes('Invalid archive path')), path)
  }
  for (const specifier of ['/absolute/dependency.js', 'file:///private/dependency.js', '@loom/stock/runtime', '../vendor/runtime.js', '@deepseek-ai/dsh-session/src/index.ts']) {
    const files = archive()
    files.find(file => file.path === 'dist/index.js').content = `export * from ${JSON.stringify(specifier)};`
    assert.ok(inspectPackage(files).some(problem => problem.includes('source or absolute import')), specifier)
  }
})

test('checks relative distribution imports against the selected archive', () => {
  const files = archive()
  files.find(file => file.path === 'dist/index.js').content = 'export * from "./shared/runtime.js";'
  assert.ok(inspectPackage(files).some(problem => problem.includes('Missing imported distribution file')))
  files.push({ path: 'dist/shared/runtime.js', content: 'export const name = "runtime";' })
  assert.deepEqual(inspectPackage(files), [])
})

test('refuses a bundle whose configured provider was omitted from the archive', () => {
  const files = archive()
  files.find(file => file.path === 'cordis.patch.yml').content = '- insert:\n    - name: ./dist/worktree/index.js\n'
  assert.ok(inspectPackage(files).some(problem => problem.includes('Missing configured distribution file')))
  files.push({ path: 'dist/worktree/index.js', content: 'export const name = "worktree";' })
  assert.deepEqual(inspectPackage(files), [])
})

test('rejects credential-like contents without including their value in diagnostics', () => {
  const secret = ['gh', 'p_', 'a'.repeat(36)].join('')
  const files = archive()
  files.find(file => file.path === 'README.md').content = secret
  const problems = inspectPackage(files)
  assert.ok(problems.some(problem => problem.includes('Credential material')))
  assert.ok(problems.every(problem => !problem.includes(secret)))
})

test('rejects embedded developer paths while accepting the documented install placeholder', () => {
  const files = archive()
  files.find(file => file.path === 'README.md').content = 'dsh plugin --profile web add /absolute/path/scasella-dsh-loom.tgz'
  assert.deepEqual(inspectPackage(files), [])
  files.find(file => file.path === 'dist/index.js').content = JSON.stringify('/Users/example/checkout/source.ts')
  assert.ok(inspectPackage(files).some(problem => problem.includes('Local machine path')))
})

test('refuses unsupported runtime declarations and local production dependencies', () => {
  const files = archive()
  const file = files.find(file => file.path === 'package.json')
  const manifest = JSON.parse(file.content)
  manifest.engines.dsh = '*'
  manifest.dependencies = { internal: 'workspace:*' }
  file.content = JSON.stringify(manifest)
  const problems = inspectPackage(files)
  assert.ok(problems.some(problem => problem.includes('exact supported official DSH version')))
  assert.ok(problems.some(problem => problem.includes('Local dependency specifier')))
})
