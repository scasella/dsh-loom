/** Installed-package regressions for export selection, logged requests and applied worktree evidence. */
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { featureHost, signal, ownEvents } from '../test-support/features-host.mjs'

const records = (h, agent) => ownEvents(agent).map(h.session.pluginRecordOf).filter(Boolean)

// The ordinary prose entry has no node until a continuation has been selected.
test('empty prose exports refuse every format and scope instead of disclosing the agent transcript', async () => {
  const h = await featureHost()
  try {
    const agent = await h.create('empty-export')
    await h.prompt(agent, 'PRIVATE_AGENT_TRANSCRIPT_DO_NOT_EXPORT')
    for (const format of ['json', 'html', 'text']) {
      for (const mode of ['path', 'siblings', 'kept']) {
        for (const source of [undefined, 'weave']) {
          await assert.rejects(h.ctx.loom.export({ sessionId: agent.id, mode, format, ...source === undefined ? {} : { source } }, signal()), error => {
            assert.equal(error.code, 'loom/export-unavailable')
            assert.match(error.message, /Select a recorded prose path/)
            assert.doesNotMatch(error.message, /PRIVATE_AGENT_TRANSCRIPT/)
            return true
          })
        }
      }
    }
    assert.equal((await h.download({ url: '/api/loom.export' })).status, 404)
    const exportMethod = h.ctx.typert.local.get('loom/export')
    const requestCodec = exportMethod.parameters[0].codec.create()
    const explicitRequest = requestCodec.parse({ sessionId: agent.id, source: 'sessions', mode: 'path', format: 'json' })
    assert.equal(explicitRequest.source, 'sessions')
    assert.equal(requestCodec.safeParse({ ...explicitRequest, source: 'unrecognized' }).success, false)
    const file = await h.ctx.loom.export(explicitRequest, signal())
    const explicit = await (await h.download(file)).json()
    assert.equal(explicit.sessions.length, 1)
    assert.match(JSON.stringify(explicit.sessions), /PRIVATE_AGENT_TRANSCRIPT_DO_NOT_EXPORT/)
  } finally { await h.close() }
})

test('selected prose exports contain only the recorded prose and curation, and HTML escapes source text', async () => {
  const h = await featureHost()
  try {
    const agent = await h.create('selected-export')
    await h.prompt(agent, 'PRIVATE_CHAT_EXCLUDED_FROM_PROSE')
    const prefix = '<script>alert("sample")</script> & <b>story</b>\n'
    const woven = await h.ctx.loom.weave({ sessionId: agent.id, parent: null, prefix: [{ author: 'user', text: prefix }], n: 2 }, signal())
    const chosen = woven.nodes[0]
    await h.ctx.loom.choose({ sessionId: agent.id, nodeId: chosen.id }, signal())
    for (const format of ['json', 'text', 'html']) {
      const file = await h.ctx.loom.export({ sessionId: agent.id, source: 'weave', nodeId: chosen.id, mode: 'path', format }, signal())
      const response = await h.download(file)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.match(response.headers.get('content-disposition'), /^attachment;/)
      const body = await response.text()
      assert.doesNotMatch(body, /PRIVATE_CHAT_EXCLUDED_FROM_PROSE/)
      if (format === 'json') {
        const value = JSON.parse(body)
        assert.equal(value.nodes.length, 1)
        assert.equal(value.nodes[0].prefix[0].text, prefix)
        assert.equal(value.choices[0].nodeId, chosen.id)
        assert.equal(value.curationBits, 1)
        assert.equal(value.sessions, undefined)
      } else if (format === 'html') {
        assert.doesNotMatch(body, /<script>|<b>story<\/b>/)
        assert.match(body, /&lt;script&gt;alert\(&quot;sample&quot;\)&lt;\/script&gt; &amp; &lt;b&gt;story&lt;\/b&gt;/)
      } else {
        assert.ok(body.includes(prefix + chosen.text))
        assert.match(body, /Curation: 1 bits/)
      }
    }
    await assert.rejects(h.ctx.loom.export({ sessionId: agent.id, source: 'weave', nodeId: 'not-a-recorded-node', mode: 'path' }, signal()), error => error.code === 'loom/node-not-found')
    await assert.rejects(h.ctx.loom.export({ sessionId: agent.id, source: 'weave', mode: 'path' }, signal()), error => error.code === 'loom/export-unavailable')
    await assert.rejects(h.ctx.loom.export({ sessionId: agent.id, source: 'sessions', nodeId: chosen.id, mode: 'path' }, signal()), error => error.code === 'loom/export-unavailable')
  } finally { await h.close() }
})

test('export retention and expiry invalidate old download tokens', async t => {
  const h = await featureHost({ loom: { export: { maxDownloads: 1, ttlMs: 300000 } } })
  try {
    const agent = await h.create('bounded-export')
    const woven = await h.ctx.loom.weave({ sessionId: agent.id, parent: null, prefix: [], n: 1 }, signal())
    const request = { sessionId: agent.id, nodeId: woven.nodes[0].id, mode: 'path' }
    const first = await h.ctx.loom.export(request, signal())
    const second = await h.ctx.loom.export(request, signal())
    assert.equal((await h.download(first)).status, 404)
    assert.equal((await h.download(second)).status, 200)
    // Date is changed only while reading the completed immutable download; no model or filesystem task is in flight.
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 300001 })
    try { assert.equal((await h.download(second)).status, 404) }
    finally { t.mock.timers.reset() }
  } finally { await h.close() }
})

test('request inspector returns full logged message text and tool schemas beyond its collapsed preview', async () => {
  const h = await featureHost()
  try {
    const agent = await h.create('full-request')
    const text = 'Full request\n  ' + 'word '.repeat(100) + '\nEND_OF_LOGGED_MESSAGE'
    await h.prompt(agent, text)
    const settlement = ownEvents(agent).findLast(event => event.type === 'assistant/message')
    const view = await h.ctx.loom.requestAt({ sessionId: agent.id, seq: settlement.seq }, signal())
    const requestMethod = h.ctx.typert.local.get('loom/requestAt')
    const resultCodec = requestMethod.result.create()
    assert.deepEqual(resultCodec.parse(view), view)
    assert.equal(resultCodec.safeParse({ ...view, messages: view.messages.map(message => ({ ...message, text: undefined })) }).success, false)
    const user = view.messages.find(message => message.role === 'user')
    assert.equal(user.text, text)
    assert.equal(user.preview.length, 240)
    assert.ok(user.preview.endsWith('…'))
    assert.ok(user.text.includes('\nEND_OF_LOGGED_MESSAGE'))
    const header = agent.session.snapshotEvents().findLast(event => event.type === 'request/header')
    const definitions = view.tools.definitions.map(value => JSON.parse(value))
    assert.deepEqual(definitions, header.data.header.tools)
    assert.ok(definitions.some(tool => tool.name === 'write' && typeof tool.parameters === 'object'))
  } finally { await h.close() }
})

test('Apply retains Compare stats and full or per-file diff after removing the worktree and reloading the Host', async () => {
  let h = await featureHost()
  const directory = h.root
  try {
    const source = await h.create('applied-source')
    await h.prompt(source, 'seed')
    const value = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'retained-diff', kind: 'steer', afterTurn: 1, lines: ['write notes.txt: retained evidence'], isolation: 'worktree' })
    const [child] = await h.settle(value)
    const isolation = records(h, child).find(record => record.type === 'plugin:loom/isolation').data
    const before = await h.ctx.loom.diff({ sessionId: child.id }, signal())
    const summary = (await h.ctx.loom.compare({ sessionId: child.id }, signal())).rows[0].diff
    assert.match(before.unified, /retained evidence/)
    await h.ctx.loom.apply({ sessionId: child.id })
    assert.equal(await readFile(path.join(h.repo, 'notes.txt'), 'utf8'), 'retained evidence\n')
    await assert.rejects(access(isolation.worktreePath), error => error.code === 'ENOENT')
    const saved = records(h, child).find(record => record.type === 'plugin:loom/applied-diff')
    assert.equal(saved.data.version, 1)
    assert.deepEqual(saved.data.summary, summary)
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: child.id }, signal()), before)
    const id = child.id
    await h.close(false)
    h = await featureHost({ directory })
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: id }, signal()), before)
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: id, path: 'notes.txt' }, signal()), before)
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: id, path: 'not-changed.txt' }, signal()), { unified: '', truncated: false })
    const row = (await h.ctx.loom.compare({ sessionId: id }, signal())).rows[0]
    assert.equal(row.worktreeEnded, true)
    assert.deepEqual(row.diff, summary)
  } finally { await h.close(true) }
})

test('retained diff respects its configured display limit without hiding changed-file counts', async () => {
  const h = await featureHost({ loom: { diff: { maxBytes: 1 } } })
  try {
    const source = await h.create('bounded-diff-source')
    await h.prompt(source, 'seed')
    const value = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'bounded-diff', kind: 'steer', afterTurn: 1, lines: ['write notes.txt: bounded evidence'], isolation: 'worktree' })
    const [child] = await h.settle(value)
    await h.ctx.loom.apply({ sessionId: child.id })
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: child.id }, signal()), { unified: '', truncated: true })
    assert.deepEqual(await h.ctx.loom.diff({ sessionId: child.id, path: 'notes.txt' }, signal()), { unified: '', truncated: true })
    assert.deepEqual((await h.ctx.loom.compare({ sessionId: child.id }, signal())).rows[0].diff.files.map(file => file.path), ['notes.txt'])
  } finally { await h.close() }
})


test('an evidence persistence failure reports the applied paths and keeps the worktree available for cleanup', async t => {
  const h = await featureHost()
  try {
    const source = await h.create('failed-evidence-source')
    await h.prompt(source, 'seed')
    const value = await h.ctx.loom.branch({ sessionId: source.id, requestId: 'failed-evidence', kind: 'steer', afterTurn: 1, lines: ['write notes.txt: source changed'], isolation: 'worktree' })
    const [child] = await h.settle(value)
    const isolation = records(h, child).find(record => record.type === 'plugin:loom/isolation').data
    const flush = h.ctx.sessions.flush.bind(h.ctx.sessions)
    const mock = t.mock.method(h.ctx.sessions, 'flush', session => {
      if (session.id === child.id && records(h, child).some(record => record.type === 'plugin:loom/applied-diff')) throw new Error('fixture disk failure')
      return flush(session)
    })
    try {
      await assert.rejects(h.ctx.loom.apply({ sessionId: child.id }), error => {
        assert.equal(error.code, 'loom/worktree-cleanup-failed')
        assert.match(error.message, /change was applied.*evidence could not be saved/)
        assert.deepEqual(error.details.applied, ['notes.txt'])
        return true
      })
    } finally { mock.mock.restore() }
    assert.equal(await readFile(path.join(h.repo, 'notes.txt'), 'utf8'), 'source changed\n')
    assert.equal(await readFile(path.join(isolation.worktreePath, 'notes.txt'), 'utf8'), 'source changed\n')
    assert.equal(records(h, child).some(record => record.type === 'plugin:loom/isolation-end'), false)
    await h.ctx.loom.discard({ sessionId: child.id })
    await assert.rejects(access(isolation.worktreePath), error => error.code === 'ENOENT')
  } finally { await h.close() }
})
