/** Test composition using only official installed services and the standalone package's compiled entries. */
import { readFile, mkdtemp, realpath, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const project = path.resolve(import.meta.dirname, '..')
export const stockModules = process.env.LOOM_STOCK_NODE_MODULES ?? path.resolve(project, '../upstream-install/node_modules')
export const installedPackage = process.env.LOOM_INSTALLED_PACKAGE ?? path.resolve(project, '../test-home/profiles/web/node_modules/@scasella/dsh-loom')

/** Import one actual official installed package, without workspace aliases. */
export async function stock(name) {
  const dir = path.join(stockModules, name)
  const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))
  const target = manifest.exports?.['.']
  const entry = typeof target === 'string' ? target : target?.default ?? target?.import ?? manifest.main
  if (!entry) throw new Error(`No runtime entry for ${name}`)
  return import(pathToFileURL(path.join(dir, entry)).href)
}

/** Import a shipping compiled standalone entry after stock runtime interception is installed. */
export function compiled(name) { return import(pathToFileURL(path.join(installedPackage, 'dist', name, 'index.js')).href) }

/** Real Git operation in a test-owned repository. */
export async function git(cwd, ...args) { return (await exec('git', args, { cwd })).stdout.trim() }

/** Produce a complete deterministic model text response, including measured-looking fixture usage. */
export function textResponse(text, probabilities = false) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text }, ...probabilities ? { logprobs: {
      tokens: [text], logprobs: [Math.log(0.6)], top: [[{ token: text, logprob: Math.log(0.6) }, { token: 'B', logprob: Math.log(0.4) }]],
    } } : {} },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** Produce a real tool-call protocol for the production agent loop. */
export function toolResponse(id, name, args) {
  const argumentsText = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsText },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsText } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

export const signal = () => new AbortController().signal
export const textOf = content => content.filter(block => block.type === 'text').map(block => block.text).join('\n')
export const ownEvents = agent => agent.session.snapshotEvents().slice(agent.session.inheritedEventCount)

/** Build a persisted Host with a disposable Git workspace; every resource is owned by close(). */
export async function featureHost({ directory, loom = {}, persist = true, autoloom } = {}) {
  const owned = directory === undefined
  const root = directory ?? await realpath(await mkdtemp(path.join(tmpdir(), 'loom-feature-')))
  const repo = path.join(root, 'repo')
  await mkdir(repo, { recursive: true })
  if (owned) {
    await git(repo, 'init', '-b', 'main')
    await git(repo, 'config', 'user.name', 'Loom fixture')
    await git(repo, 'config', 'user.email', 'loom@example.invalid')
    await git(repo, 'config', 'commit.gpgSign', 'false')
    await writeFile(path.join(repo, 'notes.txt'), 'base\n')
    await writeFile(path.join(repo, 'context.txt'), 'tracked base\n')
    await writeFile(path.join(repo, 'check.test.cjs'), "require('node:test')('fixture passes', () => {})\n")
    await git(repo, 'add', '.')
    await git(repo, 'commit', '-m', 'Initial fixture')
  }
  const { Context } = await stock('@deepseek-ai/cordis')
  const boot = await stock('@deepseek-ai/dsh-app-boot')
  const ctx = new Context()
  const close = async (remove = owned) => {
    await ctx.fiber.dispose()
    if (remove) await rm(root, { recursive: true, force: true })
  }
  try {
    const installAnchor = path.join(stockModules, '@deepseek-ai/dsh/package.json')
    const profileDir = path.resolve(installedPackage, '../../..')
    const profile = boot.loadProfileDirectory('dsh', profileDir, installAnchor)
    const resolution = await boot.createRuntimeResolution({ installAnchor, profile, home: path.resolve(profileDir, '../..') })
    await ctx.plugin(boot.PluginPackages, { resolution })
    const mount = async (name, config) => ctx.plugin(await stock(name).then(module => module.default ?? module), config)
    const privateMount = async (name, config) => ctx.plugin(await compiled(name).then(module => module.default ?? module), config)
    await mount('@deepseek-ai/dsh-typert-registry')
    await privateMount('')
    await privateMount('compat/llm')
    await mount('@deepseek-ai/dsh-session')
    await mount('@deepseek-ai/dsh-session-projection')
    await mount('@deepseek-ai/dsh-system-prompt', {})
    await mount('@deepseek-ai/dsh-fs-local')
    await mount('@deepseek-ai/dsh-working-directory')
    await mount('@deepseek-ai/dsh-tools', {})
    await mount('@deepseek-ai/dsh-agent')
    if (persist) await mount('@deepseek-ai/dsh-session-persistence-jsonl', { root: path.join(root, 'sessions'), compression: 'none' })
    await privateMount('compat/session-query-sqlite', { path: ':memory:', openAt: 'first-search' })
    await privateMount('compat/agent-loop', { agents: [] })
    const workspaces = []
    const archived = []
    ctx.provide('workspaceRegistry', { list: () => workspaces, get archivedSessionIds() { return archived }, archiveSession: async id => { if (!archived.includes(id)) archived.push(id) } })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'mock', model: 'mock' }), saveSelection: async () => {} })
    ctx.provide('attachments', { imageLimits: { maxImageBytes: 5242880, maxImagesPerMessage: 20, maxMessageImageBytes: 104857600, maxImagePixels: 40000000, maxImageDimension: 2000, mediaTypes: ['image/png'] }, admitPromptContent: async content => content })
    ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => undefined, bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }) })
    await mount('@deepseek-ai/dsh-api-remote-access')
    await privateMount('compat/session-controller', { nativeOpen: false })
    await privateMount('compat/session-stats')
    await privateMount('compat/token-meter')
    await mount('@deepseek-ai/dsh-subprocess-local')
    await mount('@deepseek-ai/dsh-sandbox-local')
    await mount('@deepseek-ai/dsh-sandbox-policy', { mode: 'danger-full-access', workspaceRoot: repo })
    await privateMount('worktree', {})
    await mount('@deepseek-ai/dsh-tool-fs')
    const routes = []
    ctx.provide('connection', { fetch: { register: route => { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } } } })
    await privateMount('loom', { weave: { leadDelayMs: 0 }, pricing: [{ provider: 'mock', model: 'mock', inputMissPerMTok: 2, inputHitPerMTok: 0.5, outputPerMTok: 4 }], ...loom })
    const llm = await stock('@deepseek-ai/dsh-llm')
    class Adapter extends llm.LlmAdapter {
      requests = []
      auxiliary = 0
      respond
      onRequest
      async listModels(provider) { return ['mock', 'other'].map(id => ({ provider, id, name: id })) }
      async resolveModel(provider, model) { return { provider, id: model, name: model, tokenLogprobs: { maxTopLogprobs: 20 }, assistantPrefill: 'tool-free' } }
      async *stream(options) {
        this.onRequest?.(options)
        this.requests.push(options)
        if (this.respond) { yield* this.respond(options); return }
        if (options.assistantPrefix !== undefined || options.topLogprobs !== undefined) {
          this.auxiliary += 1
          yield* textResponse(this.auxiliary % 2 ? 'A' : 'B', true)
          return
        }
        const last = options.messages.at(-1)
        if (last?.role === 'tool') { yield* textResponse(`Observed: ${textOf(last.content)}`); return }
        const prompt = textOf(options.messages.findLast(message => message.role === 'user' && ['user', 'loom'].includes(message.source?.kind))?.content ?? [])
        const write = /^write (\S+): (.*)$/s.exec(prompt)
        if (write) { yield* toolResponse(`write-${this.requests.length}`, 'write', { file_path: write[1], content: `${write[2]}\n` }); return }
        if (prompt.startsWith('bash ')) { yield* toolResponse(`bash-${this.requests.length}`, 'bash', { command: prompt.slice(5) }); return }
        if (prompt === 'lookup') { yield* toolResponse(`lookup-${this.requests.length}`, 'lookup', {}); return }
        yield* textResponse(`Reply: ${prompt}`)
      }
    }
    const toolModule = await stock('@deepseek-ai/dsh-tools')
    ctx.effect(() => ctx.tools.register(toolModule.defineContentToolFixture({ name: 'lookup', description: 'Return a fixture value.', parameters: {}, execute: async () => [{ type: 'text', text: 'original result' }] })))
    ctx.effect(() => ctx.tools.register(toolModule.defineTool({
      name: 'bash', description: 'Run the test-owned Node check.',
      parameters: { command: { type: 'string', required: true, description: 'The fixture command.' } },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }], presentationMeta: () => ({ exitCode: 0, stdout: { text: '99 passed', truncated: false } }) },
      execute: async (args, run) => {
        if (args.command !== 'node --test check.test.cjs') throw new Error('Unexpected fixture command')
        const environment = { ...process.env }
        delete environment.NODE_TEST_CONTEXT
        const result = await exec(process.execPath, ['--test', '--test-reporter=tap', 'check.test.cjs'], { cwd: ctx.workingDirectory.get(run.agent.session), signal: run.signal, env: environment })
        return result.stdout + result.stderr
      },
    })))
    if (autoloom) {
      ctx.provide('permissionPresets', { names: ['loom-child'], resolve: () => ({ sandbox: 'read-only', approval: 'never' }), set: (session, name) => session.append('permission/preset', { preset: name }) })
      await privateMount('tool-loom', { ...autoloom, autoloom: { childPermissionPreset: 'loom-child', ...autoloom.autoloom } })
    }
    const adapter = new Adapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const session = await stock('@deepseek-ai/dsh-session')
    const sandbox = await stock('@deepseek-ai/dsh-sandbox-policy')
    let serial = 0
    const create = async id => {
      const agent = await ctx.agentLoop.create(session.SessionId(id ?? `feature-${++serial}`), { provider: 'mock', model: 'mock' }, { cwd: repo })
      sandbox.setSandboxMode(agent.session, 'danger-full-access')
      return agent
    }
    const prompt = async (agent, text) => {
      agent.followup(llm.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await agent.whenIdle()
    }
    const settle = async value => {
      const result = []
      for (const child of value.children) {
        let status
        for (let i = 0; i < 200; i++) {
          status = ctx.loom.setStatus({ setId: value.setId }).children[child.index]
          if (status.state !== 'queued') break
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        if (status.state !== 'started') throw new Error(`Branch ${child.index}: ${JSON.stringify(status)}`)
        const agent = ctx.agents.get(status.sessionId)
        await agent.whenIdle()
        result.push(agent)
      }
      return result
    }
    const download = async value => {
      const route = routes.find(route => route.path === '/api/loom.export')
      if (!route) throw new Error('Missing compiled export route')
      return route.fetch(new Request(`http://localhost${value.url}`))
    }
    return { ctx, root, repo, archived, adapter, create, prompt, settle, download, close, llm, session, async tool(agent, name, args) { return ctx.tools.execute({ callId: llm.ToolCallId(`feature-call-${++serial}`), name, arguments: args, signal: signal(), agent }) } }
  } catch (error) { await close(); throw error }
}
