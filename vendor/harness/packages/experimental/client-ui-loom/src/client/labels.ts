/** Durable fork identities and sampled-variant labels shared by Loom lists. */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LoomFamily } from '@deepseek-ai/dsh-experimental-loom/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { branchOf, forkCutOf, projectionValuesOf, sessionTitle } from './lineage.ts'
import type { LoomTranslate } from './format.ts'

/**
 * Distinguish a fork even when its generated title matches its siblings.
 * @param list - listed Sessions and durable lineage.
 * @param sessionId - Session to name.
 * @param t - localized copy.
 * @returns title with the fork's stable id suffix when it has a parent.
 */
export function loomSessionTitle(list: SessionListState, sessionId: SessionId, t: LoomTranslate): string {
  const title = sessionTitle(list, sessionId)
  const parent = projectionValuesOf(list, sessionId)?.forkLineage?.parentSession ?? list.byId[sessionId]?.parentId
  if (parent === undefined) return title
  const identity = sessionId.replace(/^session-/u, '')
  const short = identity.slice(0, 8)
  const collision = list.ids.some(id => id !== sessionId && id.replace(/^session-/u, '').slice(0, 8) === short)
  return t('tree.forkTitle', { title, id: collision ? identity : short })
}

/**
 * Name a sample's prompt variant from persisted membership, independently of browser state.
 * @param family - family containing the branch.
 * @param list - durable branch memberships and prompt previews.
 * @param sessionId - branch to label.
 * @param t - localized copy.
 * @returns variant and sample positions plus its prompt, or undefined outside a variant set.
 */
export function loomVariantLabel(family: LoomFamily, list: SessionListState, sessionId: SessionId, t: LoomTranslate): string | undefined {
  const branch = branchOf(projectionValuesOf(list, sessionId))
  if (branch?.kind !== 'variants' || branch.variantKey === undefined) return undefined
  const siblings = family.nodes.flatMap(node => {
    const value = branchOf(projectionValuesOf(list, node.sessionId))
    return value?.setId === branch.setId ? [{ sessionId: node.sessionId, branch: value }] : []
  }).sort((left, right) => left.branch.index - right.branch.index)
  const variants = [...new Set(siblings.map(sibling => sibling.branch.variantKey))]
  const samples = siblings.filter(sibling => sibling.branch.variantKey === branch.variantKey)
  const label = t('tree.variantSample', { variant: variants.indexOf(branch.variantKey) + 1,
    sample: samples.findIndex(sibling => sibling.sessionId === sessionId) + 1, samples: samples.length })
  const cut = forkCutOf(list, sessionId)
  const prompt = cut === undefined ? undefined : projectionValuesOf(list, sessionId)?.turnOutline?.find(turn => turn.seq > cut.cutSeq)?.prompt
  return prompt ? [label, prompt].join(t('sep')) : label
}
