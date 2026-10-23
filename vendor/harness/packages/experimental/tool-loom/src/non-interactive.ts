/** Autoloom child policy for tool dispatch and the two human-interaction services. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval/types'
import type {} from '@deepseek-ai/dsh-user-questions/types'

const REFUSAL = 'Autoloom children cannot ask for human input; include the unresolved question or decision in the final result.'

/** Expected refusal before a child opens a user-question request. */
class AutoloomInteractionError extends HarnessError {
  constructor() {
    super(REFUSAL, 'autoloom/non-interactive')
    this.name = 'AutoloomInteractionError'
  }
}

/**
 * Refuse human interaction without opening an answer UI; ordinary tool failures retain the refusal in the Session log.
 * @param ctx - plugin Context owning every guard and listener until its children have stopped.
 * @param isChild - whether the live caller's first own prompt was submitted by a weaver.
 */
export function registerNonInteractiveChildren(ctx: Context, isChild: (agent: Agent) => boolean): void {
  ctx.tools.guard(exec => exec.name === 'ask_user_question' && exec.agent !== undefined && isChild(exec.agent)
    ? REFUSAL
    : undefined)
  ctx.on('user-questions/request', (request, next) => {
    if (request.agent !== undefined && isChild(request.agent)) throw new AutoloomInteractionError()
    return next()
  }, { global: true, prepend: true })
  ctx.on('approval/request', (request, next) => isChild(request.agent) ? Promise.resolve('rejected') : next(), {
    global: true,
    prepend: true,
  })
}
