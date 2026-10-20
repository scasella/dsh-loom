/** Startup gate for the providers required by the standalone Loom bundle. */
import type { Context } from '@deepseek-ai/cordis'
import { getDshRuntimeVersion } from '@loom/stock/@deepseek-ai/dsh-app-boot'
import manifest from '../../package.json' with { type: 'json' }
import AgentLoop from '../../vendor/harness/packages/core/agent-loop/src/index.ts'
import SessionController from '../../vendor/harness/packages/api/session-controller/src/index.ts'
import LlmRuntime from '../../vendor/harness/packages/llm/llm/src/index.ts'
import TokenMeter from '../../vendor/harness/packages/llm/token-meter/src/index.ts'
import SessionTitleService from '../../vendor/harness/packages/session/session-title/src/index.ts'
import SqliteSessionQueryEngine from '../../vendor/harness/packages/session-query/session-query-sqlite/src/index.ts'
import Loom from '../../vendor/harness/packages/experimental/loom/src/index.ts'
import { sessionStatsProjectionDefinition } from '../../vendor/harness/packages/session/session-stats/src/projection.ts'
import type {} from './session-stats.ts'

/** Provider versions that passed the standalone bundle's startup checks. */
export interface LoomCompatibility {
  readonly format: 1
  readonly runtimeVersion: string
  readonly sdkVersion: string
  readonly packageVersion: string
  readonly sessionStatsProjectionVersion: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    loomCompatibility: LoomCompatibility
  }
}

/** Cordis plugin name. */
export const name = 'loom-compatibility'
/** Required provider and metadata registrations precede the readiness service. */
export const inject = [
  'pluginPackages', 'loomMetadata', 'agentLoop', 'sessionController', 'llm', 'tokenMeter',
  'sessionTitle', 'sessionQuery', 'sessionProjections',
  'loomSessionStatsCompatibility', 'loom',
]

/**
 * Validate the coordinated runtime before permitting the Web application to start.
 * @param ctx - Context with the compatibility providers and generated metadata.
 * @throws When the installed runtime or any required provider differs from this bundle.
 */
export function apply(ctx: Context): void {
  const runtimeVersion = getDshRuntimeVersion()
  if (runtimeVersion !== manifest.engines.dsh) {
    throw new Error(`Loom requires DeepSeek Harness ${manifest.engines.dsh}; this process runs ${runtimeVersion}`)
  }
  const sdkVersion = ctx.pluginPackages.packageOf('@earendil-works/pi-ai', import.meta.url)?.version
  if (sdkVersion !== '1.3.0') {
    throw new Error(`Loom requires the tested Harness pi-ai SDK 1.3.0; this installation resolves ${sdkVersion ?? 'no SDK'}. Restore the supported Harness installation before enabling Loom.`)
  }
  if (ctx.get('loomMetadata') === undefined) {
    throw new Error('Loom compatibility requires its generated Remote metadata')
  }
  const providers = [
    ['agentLoop', ctx.agentLoop, AgentLoop, ['createAgent', 'resume']],
    ['sessionController', ctx.sessionController, SessionController, ['continue', 'fork', 'inspect', 'search']],
    ['llm', ctx.llm, LlmRuntime, ['prepareCall', 'resolveModelInfo', 'stream']],
    ['tokenMeter', ctx.tokenMeter, TokenMeter, ['measure']],
    ['sessionTitle', ctx.sessionTitle, SessionTitleService, ['rename', 'register']],
    ['sessionQuery', ctx.sessionQuery, SqliteSessionQueryEngine, ['observeSession', 'searchSessions', 'searchEvents']],
    ['loom', ctx.loom, Loom, [
      'branch', 'branchFor', 'counterfactual', 'compare', 'diff', 'adopt', 'apply',
      'discard', 'weave', 'weaveState', 'choose', 'probe', 'export',
    ]],
  ] as const
  for (const [service, provider, implementation, methods] of providers) {
    if (!(provider instanceof implementation)) {
      throw new Error(`Loom compatibility requires its own ${service} provider; check the bundle's profile entries`)
    }
    for (const method of methods) {
      if (typeof Reflect.get(provider, method) !== 'function') {
        throw new Error(`Loom compatibility requires ${service}.${method}()`)
      }
    }
  }
  const statistics = ctx.loomSessionStatsCompatibility
  if (statistics === undefined || statistics.projectionVersion !== sessionStatsProjectionDefinition.stateVersion) {
    throw new Error('Loom compatibility requires the matching own/inherited Session statistics projection')
  }
  ctx.provide('loomCompatibility', Object.freeze({
    format: 1,
    runtimeVersion,
    sdkVersion,
    packageVersion: manifest.version,
    sessionStatsProjectionVersion: statistics.projectionVersion,
  }) satisfies LoomCompatibility)
}
