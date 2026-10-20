/** Host identity and startup checks against an independent official Harness installation. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const project = path.resolve(import.meta.dirname, '..')
const stockModules = process.env.LOOM_STOCK_NODE_MODULES ?? path.resolve(project, '../upstream-install/node_modules')
const resolveStock = createRequire(path.join(stockModules, 'loom-host-proof.cjs')).resolve
let temporary
let proof
let wrongVersionProof
let stock

async function bundleProof(filename, runtimeVersion) {
  const host = JSON.parse(await readFile(path.join(project, 'host-plan.json'), 'utf8'))
  const llm = JSON.parse(await readFile(path.join(project, 'llm-plan.json'), 'utf8'))
  const aliases = {
    ...host.aliases,
    ...llm.aliases,
    '@deepseek-ai/dsh-experimental-loom': 'vendor/harness/packages/experimental/loom/src/index.ts',
    '@deepseek-ai/dsh-experimental-worktree': 'vendor/harness/packages/experimental/worktree/src/index.ts',
  }
  const output = path.join(temporary, filename)
  await build({
    stdin: {
      contents: `
        export * as agent from './src/host-compat/agent.ts';
        export * as cordis from './src/host-compat/cordis.ts';
        export * as readiness from './src/host-compat/readiness.ts';
        export * as statistics from './src/host-compat/session-stats.ts';
        export { ApiSessionNotFound } from './vendor/harness/packages/api/session-controller/src/agent.ts';
        export { SessionQueryError } from './vendor/harness/packages/session-query/session-query/src/config.ts';
        export { materializeSessionEventResultFilters } from './vendor/harness/packages/session-query/session-query/src/filters.ts';
        export { SessionTitleInvalidError } from './vendor/harness/packages/session/session-title/src/index.ts';
        export { default as AgentLoop } from './vendor/harness/packages/core/agent-loop/src/index.ts';
        export { default as SessionController } from './vendor/harness/packages/api/session-controller/src/index.ts';
        export { default as LlmRuntime } from './vendor/harness/packages/llm/llm/src/index.ts';
        export { default as TokenMeter } from './vendor/harness/packages/llm/token-meter/src/index.ts';
        export { default as SessionTitleService } from './vendor/harness/packages/session/session-title/src/index.ts';
        export { default as SqliteSessionQueryEngine } from './vendor/harness/packages/session-query/session-query-sqlite/src/index.ts';
        export { default as Loom } from './vendor/harness/packages/experimental/loom/src/index.ts';
        export { sessionStatsProjectionDefinition } from './vendor/harness/packages/session/session-stats/src/projection.ts';
      `,
      resolveDir: project,
      sourcefile: 'host-compat-proof.ts',
      loader: 'ts',
    },
    outfile: output,
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: false, useDefineForClassFields: true } },
    logLevel: 'silent',
    plugins: [{
      name: 'host-official-stock-proof',
      setup(builder) {
        builder.onResolve({ filter: /^@loom\/stock\// }, async (args) => {
          const original = args.path.slice('@loom/stock/'.length)
          if (runtimeVersion !== undefined && original === '@deepseek-ai/dsh-app-boot') {
            return { path: original, namespace: 'host-proof-version' }
          }
          return { path: resolveStock(original), external: true }
        })
        builder.onLoad({ filter: /.*/, namespace: 'host-proof-version' }, () => ({
          contents: `export function getDshRuntimeVersion() { return ${JSON.stringify(runtimeVersion)} }`,
          loader: 'js',
        }))
        builder.onResolve({ filter: /^(?:@deepseek-ai\/|@earendil-works\/|zod$)/ }, async (args) => {
          if (args.pluginData?.stock) return
          const alias = aliases[args.path]
          if (alias !== undefined) return { path: path.join(project, alias) }
          return { path: resolveStock(args.path), external: true }
        })
      },
    }],
  })
  return import(pathToFileURL(output).href)
}

before(async () => {
  temporary = await mkdtemp(path.join(project, '.host-proof-'))
  proof = await bundleProof('proof.mjs')
  wrongVersionProof = await bundleProof('wrong-version.mjs', '9.9.9')
  const load = name => import(pathToFileURL(path.join(stockModules, '@deepseek-ai', name, 'lib/index.js')).href)
  stock = {
    agent: await load('dsh-agent'),
    cordis: await load('cordis'),
    session: await load('dsh-api-session-controller'),
    query: await load('dsh-session-query'),
    title: await load('dsh-session-title'),
    sessionLog: await load('dsh-session'),
    projections: await load('dsh-session-projection'),
  }
})

after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true })
})

function readyContext(module = proof) {
  const values = new Map([
    ['pluginPackages', { packageOf: () => ({ version: '1.3.0' }) }],
    ['loomMetadata', Object.freeze({ version: 'proof' })],
    ['loomSessionStatsCompatibility', { projectionVersion: module.sessionStatsProjectionDefinition.stateVersion }],
    ['agentLoop', Object.create(module.AgentLoop.prototype)],
    ['sessionController', Object.create(module.SessionController.prototype)],
    ['llm', Object.create(module.LlmRuntime.prototype)],
    ['tokenMeter', Object.create(module.TokenMeter.prototype)],
    ['sessionTitle', Object.create(module.SessionTitleService.prototype)],
    ['sessionQuery', Object.create(module.SqliteSessionQueryEngine.prototype)],
    ['loom', Object.create(module.Loom.prototype)],
  ])
  const ctx = {
    get: key => values.get(key),
    provide: (key, value) => { values.set(key, value); return () => { values.delete(key) } },
  }
  for (const [key, value] of values) ctx[key] = value
  return { ctx, values }
}

test('shares the installed registry, dispatch and framework identities', () => {
  assert.equal(proof.agent.default, stock.agent.default)
  for (const key of ['AgentRegistry', 'agentEvents', 'agentCarrier', 'assembleContextFor', 'emitAgentEvent']) {
    assert.equal(proof.agent[key], stock.agent[key], key)
  }
  for (const key of ['Context', 'Service', 'Fiber', 'symbols']) {
    assert.equal(proof.cordis[key], stock.cordis[key], key)
  }
})

test('materializes exactly the published Cordis const-enum protocol', async () => {
  const declarations = await readFile(path.join(stockModules, '@deepseek-ai/cordis/lib/types/fiber.d.ts'), 'utf8')
  const enumBody = declarations.match(/export declare const enum FiberState \{([^}]+)\}/u)?.[1]
  assert.ok(enumBody)
  const published = Object.fromEntries([...enumBody.matchAll(/([A-Z_]+)\s*=\s*(\d+)/gu)].map(([, key, value]) => [key, Number(value)]))
  assert.deepEqual(proof.cordis.FiberState, published)
  assert.equal(Object.isFrozen(proof.cordis.FiberState), true)
})

test('retains error identities across private and installed service consumers', () => {
  assert.equal(proof.ApiSessionNotFound, stock.session.ApiSessionNotFound)
  assert.equal(proof.SessionQueryError, stock.query.SessionQueryError)
  assert.equal(proof.SessionTitleInvalidError, stock.title.SessionTitleInvalidError)
  const failure = new proof.SessionQueryError('invalid ownership', 'SESSION_QUERY_INVALID_FILTER')
  assert.ok(failure instanceof stock.query.SessionQueryError)
})

test('accepts own/inherited filters and reports invalid ownership through the stock error class', () => {
  assert.deepEqual(proof.materializeSessionEventResultFilters([{ kind: 'ownership', values: ['own', 'inherited'] }]), [{ kind: 'ownership', values: ['own', 'inherited'] }])
  assert.throws(() => proof.materializeSessionEventResultFilters([{ kind: 'ownership', values: ['other'] }]), error => error instanceof stock.query.SessionQueryError && error.code === 'SESSION_QUERY_INVALID_FILTER')
})

test('publishes readiness only after the matching providers and statistics pass', async () => {
  const { ctx, values } = readyContext()
  proof.readiness.apply(ctx)
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
  assert.deepEqual(values.get('loomCompatibility'), {
    format: 1,
    runtimeVersion: manifest.engines.dsh,
    sdkVersion: '1.3.0',
    packageVersion: manifest.version,
    sessionStatsProjectionVersion: proof.sessionStatsProjectionDefinition.stateVersion,
  })
  assert.equal(Object.isFrozen(values.get('loomCompatibility')), true)
  assert.ok(proof.readiness.inject.includes('loomMetadata'))
  assert.ok(proof.readiness.inject.includes('loomSessionStatsCompatibility'))
})

test('refuses the stock controller in place of the continuation-capable provider', () => {
  const { ctx, values } = readyContext()
  ctx.sessionController = Object.create(stock.session.default.prototype)
  assert.throws(() => proof.readiness.apply(ctx), /requires its own sessionController provider/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses absent Remote metadata without publishing readiness', () => {
  const { ctx, values } = readyContext()
  values.delete('loomMetadata')
  assert.throws(() => proof.readiness.apply(ctx), /requires its generated Remote metadata/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses an incomplete continuation API without publishing readiness', () => {
  const { ctx, values } = readyContext()
  ctx.sessionController.continue = undefined
  assert.throws(() => proof.readiness.apply(ctx), /requires sessionController.continue\(\)/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses an incompatible statistics projection version', () => {
  const { ctx, values } = readyContext()
  ctx.loomSessionStatsCompatibility = { projectionVersion: -1 }
  assert.throws(() => proof.readiness.apply(ctx), /matching own\/inherited Session statistics projection/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses a different Harness runtime before publishing readiness', () => {
  const { ctx, values } = readyContext(wrongVersionProof)
  assert.throws(() => wrongVersionProof.readiness.apply(ctx), /this process runs 9\.9\.9/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses an untested installed SDK before publishing readiness', () => {
  const { ctx, values } = readyContext()
  ctx.pluginPackages = { packageOf: () => ({ version: '1.4.0' }) }
  assert.throws(() => proof.readiness.apply(ctx), /requires the tested Harness pi-ai SDK 1\.3\.0/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('refuses an absent installed SDK before publishing readiness', () => {
  const { ctx, values } = readyContext()
  ctx.pluginPackages = { packageOf: () => undefined }
  assert.throws(() => proof.readiness.apply(ctx), /this installation resolves no SDK/u)
  assert.equal(values.has('loomCompatibility'), false)
})

test('registers and disposes the statistics capability through installed Cordis', async () => {
  const ctx = new stock.cordis.Context()
  try {
    await ctx.plugin(stock.sessionLog.default)
    await ctx.plugin(stock.projections.default)
    const fiber = await ctx.plugin(proof.statistics)
    assert.equal(ctx.loomSessionStatsCompatibility.projectionVersion, proof.sessionStatsProjectionDefinition.stateVersion)
    const session = stock.sessionLog.Session.create(stock.sessionLog.SessionId('statistics-lifecycle'))
    assert.equal(ctx.sessionProjections.snapshot(session).values.sessionStats.turns, 0)
    await fiber.dispose()
    assert.equal(ctx.get('loomSessionStatsCompatibility'), undefined)
    assert.equal(ctx.sessionProjections.snapshot(session).values.sessionStats, undefined)
  } finally {
    await ctx.fiber.dispose()
  }
})
