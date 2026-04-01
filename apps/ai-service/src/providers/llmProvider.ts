// apps/ai-service/src/providers/llmProvider.ts

/**
 * Generic LLM provider contract.
 * All providers (Gemini, Mock, etc.) must implement this interface.
 */

export type LLMOperation = "enhance" | "summarize" | "translate" | "reformat";

export type LLMParameters = {
  style?: string;
  summaryStyle?: string;
  language?: string;
  formatStyle?: string;
};

export interface LLMRunParams {
  operation: LLMOperation;

  /**
   * The raw user-selected text (the thing we are transforming).
   */
  selectedText: string;

  /**
   * Optional instruction prompt constructed by the service (templates, policies, etc.).
   * Providers can ignore this and build their own prompts if they want.
   */
  prompt?: string;

  parameters?: LLMParameters;
}

export interface LLMRunResult {
  result: string;
}

export interface LLMProvider {
  run(params: LLMRunParams): Promise<LLMRunResult>;
}