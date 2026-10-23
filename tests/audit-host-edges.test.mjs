/** Acceptance gaps checked through the installed bundle and official Session services. */
import assert from 'node:assert/strict'
import { rename } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { featureHost, signal, stock, textOf, textResponse } from '../test-support/features-host.mjs'

test('Adopt requests running-sibling cancellation through archive admission and preserves both histories', async t => {
  const h = await featureHost({ loom: { concurrentWritableBranches: true, maxConcurrentBranches: 2 } })
  const entered = Promise.withResolvers()
  const stopped = Promise.withResolvers()
  const cleanup = new AbortController()
  const originalArchive = h.ctx.workspaceRegistry.archiveSession
  const archives = []
  const archive = t.mock.method(h.ctx.workspaceRegistry, 'archiveSession', async (sessionId, options) => {
    archives.push({ sessionId, options })
    await originalArchive(sessionId, options)
    // The general feature fixture omits the real registry's documented stop dispatch.
    if (options?.stopActivity === true) await h.ctx.parallel('workspace/session-stop', { sessionId })
  })
  try {
    const source = await h.create('running-adopt-source')
    await h.prompt(source, 'seed')
    h.adapter.respond = async function* (options) {
      const prompt = textOf(options.messages.findLast(message => message.role === 'user').content)
      if (prompt === 'wait for cancellation') {
        entered.resolve()
        try {
          const aborted = AbortSignal.any([options.signal, cleanup.signal])
          await new Promise(resolve => {
            if (aborted.aborted) resolve()
            else aborted.addEventListener('abort', resolve, { once: true })
          })
        } finally { stopped.resolve() }
        yield { type: 'finish', reason: { kind: 'aborted' } }
      } else yield* textResponse('finished')
    }
    const set = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'adopt', kind: 'steer', afterTurn: 1, lines: ['finish now', 'wait for cancellation'] })
    await entered.promise
    const winner = h.ctx.agents.get(set.children[0].sessionId)
    const sibling = h.ctx.agents.get(set.children[1].sessionId)
    await winner.whenIdle()
    assert.equal(sibling.status, 'running')
    const result = await h.ctx.loom.adopt({ sessionId: winner.id })
    await stopped.promise
    await sibling.whenIdle()
    assert.deepEqual(archives, [{ sessionId: sibling.id, options: { stopActivity: true } }])
    assert.deepEqual(result.archived, [sibling.id])
    assert.equal(sibling.status, 'idle')
    for (const agent of [winner, sibling]) assert.ok((await h.ctx.sessionController.inspect(agent.id, signal())).events.length > 0)
  } finally {
    cleanup.abort()
    archive.mock.restore()
    await h.close()
  }
})

test('isolation prerequisite refusals create no forks, and shared Apply is refused', async () => {
  const h = await featureHost()
  const metadata = path.join(h.repo, '.git')
  const backup = path.join(h.root, 'git-metadata')
  try {
    const source = await h.create('isolation-prerequisites')
    await h.prompt(source, 'seed')
    const count = async () => (await h.ctx.sessionController.list({}, signal())).items.length
    const before = await count()
    const request = { sessionId: source.id, kind: 'steer', afterTurn: 1, lines: ['never starts'], isolation: 'worktree' }
    await rename(metadata, backup)
    try {
      await assert.rejects(h.ctx.loom.branch({ ...request, requestId: 'not-git' }), error => error.code === 'loom/isolation-unavailable')
      assert.equal(await count(), before)
    } finally { await rename(backup, metadata) }
    const sandbox = await stock('@deepseek-ai/dsh-sandbox-policy')
    sandbox.setSandboxMode(source.session, 'read-only')
    await assert.rejects(h.ctx.loom.branch({ ...request, requestId: 'read-only' }), error => error.code === 'loom/isolation-unavailable')
    assert.equal(await count(), before)
    const [shared] = await h.settle(await h.ctx.loom.branch({ ...request, requestId: 'shared', isolation: 'shared' }))
    await assert.rejects(h.ctx.loom.apply({ sessionId: shared.id }), error => error.code === 'loom/apply-not-isolated')
  } finally { await h.close() }
})

test('Compare excludes inherited successful test output from a child with no own test command', async () => {
  const h = await featureHost({ loom: { outcomes: { testSummary: [{ name: 'node', summary: String.raw`^# tests \d+\n# suites \d+\n# pass \d+\n# fail \d+`, total: String.raw`# tests (\d+)`, passed: String.raw`# pass (\d+)`, failed: String.raw`# fail (\d+)` }] } } })
  try {
    const source = await h.create('inherited-test-source')
    await h.prompt(source, 'bash node --test check.test.cjs')
    const [child] = await h.settle(await h.ctx.loom.branch({ sessionId: source.id, requestId: 'no-own-tests', kind: 'steer', afterTurn: 1, lines: ['plain reply'] }))
    const value = await h.ctx.loom.compare({ sessionId: child.id }, signal())
    assert.equal(value.rows[0].tests, undefined)
  } finally { await h.close() }
})
