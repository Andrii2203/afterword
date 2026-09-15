import { createDeepgramAsr } from "./asr";
import { createAnthropicExtractor } from "./extract";
import type { PipelineDeps } from "./pipeline";

let override: PipelineDeps | null = null;

/** Integration tests replace both providers here; nothing else may call this. */
export function setProviders(deps: PipelineDeps | null): void {
  override = deps;
}

export function getProviders(): PipelineDeps {
  return override ?? { asr: createDeepgramAsr(), extractor: createAnthropicExtractor() };
}
