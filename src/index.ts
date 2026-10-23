/** Register Loom's generated Remote descriptions before compatibility providers activate. */
import type { Context } from '@deepseek-ai/cordis'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'
import { join } from 'node:path'
import { assertCompatibleOverrides } from './profile-preflight.ts'
import { TYPERT as llm } from '../generated/llm/typert.host.js'
import { TYPERT as sessionController } from '../generated/session-controller/typert.host.js'
import { TYPERT as loom } from '../generated/loom/typert.host.js'

/** Loader name for Loom's schema registration. */
export const name = 'loom-metadata'
/** The original registry owns all Remote descriptions. */
export const inject = ['typert']

/** Register descriptions with the plugin's lifetime.
 * @param ctx Plugin context whose effects remove the contributions on unload.
 */
export function apply(ctx: Context): void {
  const profile = ctx.get('profileContext')
  if (profile !== undefined) assertCompatibleOverrides([
    ...loadOptionalPatches('loom', profile.patchPath) ?? [],
    ...loadOptionalPatches('loom', join(profile.home, 'cordis.patch.yml')) ?? [],
    ...profile.overlays,
  ])
  for (const [owner, contribution] of [
    ['@deepseek-ai/dsh-llm', llm],
    ['@deepseek-ai/dsh-api-session-controller', sessionController],
    ['@deepseek-ai/dsh-experimental-loom', loom],
  ] as const) ctx.typert.register(validateTypertManifest(owner, contribution))
  ctx.provide('loomMetadata', Object.freeze({ version: '0.1.0-alpha.5' }))
}
