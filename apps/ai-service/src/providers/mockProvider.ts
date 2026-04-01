// apps/ai-service/src/providers/mockProvider.ts

import type { LLMProvider, LLMRunParams, LLMRunResult } from "./llmProvider";

/**
 * Deterministic mock provider for local dev + tests.
 * Produces predictable outputs without external calls.
 *
 * Important:
 * - params.selectedText: the raw user selection
 * - params.prompt: optional composed instruction prompt (templates)
 */
export class MockProvider implements LLMProvider {
  async run(params: LLMRunParams): Promise<LLMRunResult> {
    const base = params.selectedText ?? "";
    const promptHint = params.prompt ? " [prompt:yes]" : " [prompt:no]";

    switch (params.operation) {
      case "summarize": {
        const summaryStyle = params.parameters?.summaryStyle ?? "short_paragraph";
        return {
          result:
            base.trim().length === 0
              ? "(empty selection)"
              : `Summarize${promptHint} style=${summaryStyle}: ${
                  base.length > 120 ? `${base.slice(0, 117)}...` : base
                }`,
        };
      }

      case "enhance": {
        const style = params.parameters?.style ? ` style=${params.parameters.style}` : "";
        return {
          result: `Enhance${promptHint}${style}: ${base}`.trim(),
        };
      }

      case "translate": {
        const lang = params.parameters?.language ?? "unknown";
        return {
          result: `Translate${promptHint} to=${lang}: ${base}`.trim(),
        };
      }

      case "reformat": {
        const formatStyle = params.parameters?.formatStyle ?? "default";
        return {
          result: `Reformat${promptHint} style=${formatStyle}: ${base}`.trim(),
        };
      }

      default:
        return { result: base };
    }
  }
}