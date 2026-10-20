/** Type-only view of DeepSeek Harness 0.2.1-rc.2 runtime identities, using this package's compatible copied definitions. */
import type { GenerateOptions, StreamChunk, LlmFailure, LlmProviderInfo, LlmImageRequestPricing, LlmModelInfo, LlmResolvedModelInfo } from '../../vendor/harness/packages/llm/llm/src/types.ts'
import type { LlmErrorOptions, PreparedAdapterCall } from '../../vendor/harness/packages/llm/llm/src/index.ts'
import type { ResolvedRetryPolicy } from '../../vendor/harness/packages/llm/llm/src/retry-policy.ts'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
export { APP_IDENTITY, attributionHeaders, userAgent } from '@deepseek-ai/dsh-llm/attribution'
export type { AppIdentity } from '@deepseek-ai/dsh-llm/attribution'
/** Installed stable error base. */
export declare class HarnessError extends Error {
 readonly code: string
 constructor(message: string, code: string, options?: ErrorOptions)
}
/** Installed LLM error with the copied source's compatible failure fields. */
export declare class LlmError extends HarnessError {
 readonly failure: LlmFailure
 constructor(message: string, code: string, options?: LlmErrorOptions)
}
/** Copied from @deepseek-ai/dsh-llm@0.2.1-rc.2 lib/types/index.d.ts; requests and returned metadata use the compatible private vocabulary. */
export declare abstract class LlmAdapter {
    /**
     * Describe one provider route owned by this adapter.
     * @param provider - a route passed to `registerAdapter()` for this instance.
     * @returns detached display metadata whose id must equal `provider`.
     */
    providerInfo(provider: string): LlmProviderInfo;
    /**
     * Return the provider-owned retry policy captured with this route.
     * @param _provider - a route passed to `registerAdapter()` for this instance.
     * @returns a resolved policy, or `undefined` to use the normal defaults.
     */
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
    /**
     * Resolve provider-side request-image pricing for one exact model route.
     * The default declares none, so consumers fall back to their own neutral
     * estimate. Implementations must answer synchronously without I/O; the
     * token meter resolves this per measurement.
     * @param _provider - a route passed to `registerAdapter()` for this instance.
     * @param _model - exact model id passed to {@link GenerateOptions.model}.
     * @returns route-owned image pricing, or `undefined` when the route declares none.
     */
    imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
    /**
     * Resolve the image dimensions and byte target this adapter sends to the model.
     * The default preserves normalized images; adapters that resize must override it.
     * @param _provider - registered provider route.
     * @param _model - exact model id.
     * @param image - normalized image whose request projection is being resolved.
     * @returns the same target used by request serialization, before provider-internal processing.
     */
    imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget;
    /**
     * List models this adapter can currently advertise for one owned provider.
     * Core routing accepts unlisted model ids; catalog-driven entry points such
     * as the GUI may require membership. Adapters used there must advertise
     * their available models; the base empty catalog offers no GUI selection.
     * @param _provider - one provider route owned by this adapter.
     * @returns discoverable models in adapter-preferred order.
     */
    listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Resolve all metadata available for one exact model. This query is
     * independent of the advisory catalog and does not validate request routing.
     * @param provider - one provider route owned by this adapter.
     * @param model - exact model id passed to {@link GenerateOptions.model}.
     * @param _signal - cancellation for this exact-model lookup; asynchronous
     *   implementations must settle promptly after it aborts.
     * @returns provider/model identity plus any context, call-default, and reasoning metadata.
     */
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Bind exact model metadata and the eventual request dispatch to one adapter generation.
     * Dynamic adapters override this so settings changes between preparation and
     * dispatch cannot combine one generation's capabilities with another's endpoint.
     * @param provider - registered provider route.
     * @param model - exact model id.
     * @param signal - cancellation for model resolution.
     * @returns model metadata and a one-generation stream entry point.
     */
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    /**
     * Stream one model call as raw chunks. The only required method.
     * @param options - the fully-assembled request; implementations must honor `options.signal`.
     * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
     */
    abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Preserve the installed process-local request marker's generic identity. */
export declare function markAgentLoopRequest<T extends GenerateOptions>(request: T): T
/** Test the installed request marker. */
export declare function isAgentLoopRequest(request: GenerateOptions): boolean
