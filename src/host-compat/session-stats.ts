/** Own/inherited Session statistics and its compatibility registration marker. */
import type { Context } from '@deepseek-ai/cordis'
import { apply as registerStatistics } from '../../vendor/harness/packages/session/session-stats/src/index.ts'
import { sessionStatsProjectionDefinition } from '../../vendor/harness/packages/session/session-stats/src/projection.ts'

/** Statistics implementation mounted by the standalone bundle. */
export interface LoomSessionStatsCompatibility {
  readonly projectionVersion: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    loomSessionStatsCompatibility: LoomSessionStatsCompatibility
  }
}

/** Cordis plugin name. */
export const name = 'loom-session-stats'
/** Statistics must register on the shared projection service. */
export const inject = ['sessionProjections']

/**
 * Register the statistics projection before publishing its version.
 * @param ctx - Context carrying the shared projection service.
 */
export function apply(ctx: Context): void {
  registerStatistics(ctx)
  ctx.provide('loomSessionStatsCompatibility', Object.freeze({
    projectionVersion: sessionStatsProjectionDefinition.stateVersion,
  }))
}
