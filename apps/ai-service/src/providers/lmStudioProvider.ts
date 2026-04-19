// apps/ai-service/src/providers/lmStudioProvider.ts

import type {
  LLMProvider,
  LLMRunParams,
  LLMRunResult,
  LLMStreamParams,
} from "./llmProvider";
import { config } from "../config/env";

function fallbackPrompt(params: LLMRunParams): string {
  const { operation, selectedText, parameters } = params;

  switch (operation) {
    case "summarize": {
      const summaryStyle =
        parameters?.summaryStyle === "bullet_points"
          ? "in 3 bullet points"
          : "as a short paragraph";

      return `Summarize the following text ${summaryStyle}. Do not add new information:\n\n${selectedText}`;
    }

    case "enhance": {
      const style = parameters?.style ? ` in a ${parameters.style} style` : "";
      return `Improve the writing quality of the following text${style}. Preserve meaning and do not add new information:\n\n${selectedText}`;
    }

    case "translate": {
      const language = parameters?.language ?? "English";
      return `Translate the following text to ${language}. Preserve meaning and formatting where possible:\n\n${selectedText}`;
    }

    case "reformat": {
      const formatStyle = parameters?.formatStyle ?? "a clean structured format";
      return `Reformat the following text into ${formatStyle}. Preserve meaning and do not add new information:\n\n${selectedText}`;
    }

    default:
      return selectedText;
  }
}

type LMStudioChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LMStudioChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type LMStudioStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
  };
};

function getBaseUrl(): string {
  const raw = config.LLM_BASE_URL?.trim() || "http://127.0.0.1:1234";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function getModel(): string {
  return config.LLM_MODEL?.trim() || "qwen2.5-7b-instruct";
}

function buildMessages(params: LLMRunParams): LMStudioChatMessage[] {
  const prompt = (
    params.prompt && params.prompt.trim().length > 0
      ? params.prompt
      : fallbackPrompt(params)
  ).trim();

  return [
    {
      role: "system",
      content:
        "You are an AI writing assistant for a collaborative document editor. " +
        "Follow the user's instruction exactly. Preserve original meaning unless explicitly asked otherwise. " +
        "Do not add unsupported facts or commentary.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];
}

export class LMStudioProvider implements LLMProvider {
  async run(params: LLMRunParams): Promise<LLMRunResult> {
    const baseUrl = getBaseUrl();
    const model = getModel();
    const endpoint = `${baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.LLM_API_KEY && config.LLM_API_KEY.trim().length > 0) {
      headers.Authorization = `Bearer ${config.LLM_API_KEY}`;
    }

    const body = {
      model,
      messages: buildMessages(params),
      temperature: 0.2,
      stream: false,
    };

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : String(err);
      throw new Error(
        `LM Studio request failed. Ensure LM Studio is running at ${baseUrl}. Details: ${msg}`
      );
    }

    let data: LMStudioChatCompletionResponse | null = null;

    try {
      data = (await response.json()) as LMStudioChatCompletionResponse;
    } catch {
      throw new Error(
        `LM Studio returned non-JSON response (status=${response.status})`
      );
    }

    if (!response.ok) {
      const apiMessage =
        data?.error?.message ||
        `HTTP ${response.status} ${response.statusText}`;
      throw new Error(
        `LM Studio completion failed (model=${model}): ${apiMessage}`
      );
    }

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error(`LM Studio returned empty response (model=${model})`);
    }

    return { result: text, prompt: body.messages[1]?.content, model };
  }

  async stream(params: LLMStreamParams): Promise<LLMRunResult> {
    const baseUrl = getBaseUrl();
    const model = getModel();
    const endpoint = `${baseUrl}/v1/chat/completions`;
    const messages = buildMessages(params);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.LLM_API_KEY && config.LLM_API_KEY.trim().length > 0) {
      headers.Authorization = `Bearer ${config.LLM_API_KEY}`;
    }

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          stream: true,
        }),
        signal: params.signal,
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : String(err);
      throw new Error(
        `LM Studio request failed. Ensure LM Studio is running at ${baseUrl}. Details: ${msg}`
      );
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `LM Studio streaming failed (model=${model} status=${response.status}): ${text || response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) break;

        const rawLine = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!rawLine.startsWith("data:")) {
          continue;
        }

        const payload = rawLine.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }

        let parsed: LMStudioStreamChunk | null = null;
        try {
          parsed = JSON.parse(payload) as LMStudioStreamChunk;
        } catch {
          continue;
        }

        const chunk = parsed?.choices?.[0]?.delta?.content ?? "";
        if (!chunk) {
          continue;
        }

        result += chunk;
        await params.onChunk(chunk);
      }
    }

    const text = result.trim();
    if (!text) {
      throw new Error(`LM Studio returned empty streamed response (model=${model})`);
    }

    return {
      result: text,
      prompt: messages[1]?.content,
      model,
    };
  }
}
