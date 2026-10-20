/** Type-only view of DeepSeek Harness 0.2.1-rc.2 runtime identities, using this package's compatible copied definitions. */
import { HarnessError } from './llm.js'
import type { SessionQueryErrorCode } from '../../vendor/harness/packages/session-query/session-query/src/config.ts'
/** Installed query failure using the unchanged failure taxonomy. */
export declare class SessionQueryError extends HarnessError {
  readonly code: SessionQueryErrorCode
  constructor(message: string, code: SessionQueryErrorCode, options?: ErrorOptions)
}
