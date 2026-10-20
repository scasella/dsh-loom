/** Refuse profile overrides that would silently configure a disabled stock provider. */
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const replaced = new Set([
  'agent-loop', 'session-controller', 'token-meter', 'session-stats', 'session-title',
  'session-query-sqlite', 'llm', 'llm-pi-ai', 'api-remotes', 'ui-conversation',
  'ui-chat', 'ui-tool', 'ui-workspace', 'ui-shortcuts', 'ui-subagent', 'ui-settings-models',
])

/**
 * Require explicit migration when a user layer configures a replaced provider.
 * @param patches User profile, home, and launch overlays; exclude bundle defaults.
 * @throws When an old provider is enabled or lacks a corresponding migrated override.
 */
export function assertCompatibleOverrides(patches: readonly PatchOptions[]): void {
  const entries = patches.flatMap<PatchOptions>(patch => patch.insert ?? [patch])
  const wrongNames = entries.filter(row => row.id?.startsWith('loom-compat-')
    && replaced.has(row.id.slice('loom-compat-'.length)) && row.name?.startsWith('@deepseek-ai/'))
  if (wrongNames.length > 0) {
    throw new Error(`Loom configuration targets retain stock name assertions: ${wrongNames.map(row => row.id).join(', ')}. Remove the name fields so the overrides reach the compatibility providers.`)
  }
  const migrated = new Set(entries.filter(row => Object.hasOwn(row, 'config')).map(row => row.id))
  const enabled = entries.filter(row => row.id !== undefined && replaced.has(row.id) && row.disabled === false)
  if (enabled.length > 0) {
    throw new Error(`Loom cannot enable replaced stock entries: ${enabled.map(row => row.id).join(', ')}. Remove those enable overrides or remove Loom.`)
  }
  const missing = entries.filter(row => row.id !== undefined && replaced.has(row.id)
    && Object.hasOwn(row, 'config') && !migrated.has(`loom-compat-${row.id}`))
  if (missing.length > 0) {
    throw new Error(`Loom requires configuration migration for: ${[...new Set(missing.map(row => row.id))].join(', ')}. Copy each complete config to loom-compat-<original-id>, remove its stock name assertion, and restart. See COMPATIBILITY.md. Existing configuration was not changed.`)
  }
}
