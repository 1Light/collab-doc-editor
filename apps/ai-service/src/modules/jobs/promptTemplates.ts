// apps/ai-service/src/modules/jobs/promptTemplates.ts

import type { LLMOperation } from "../../providers/llmProvider";

/**
 * Centralized prompt templates.
 * Keeps prompt wording decoupled from provider implementation.
 */

type PromptParams = {
  selectedText: string;
  style?: string;
  summaryStyle?: string;
  language?: string;
  formatStyle?: string;
};

function sanitizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function buildPrompt(
  operation: LLMOperation,
  params: PromptParams
): string {
  const text = sanitizeText(params.selectedText);
  const style = params.style?.trim();
  const summaryStyle = params.summaryStyle?.trim();
  const language = params.language?.trim();
  const formatStyle = params.formatStyle?.trim();

  switch (operation) {
    case "summarize":
      if (summaryStyle === "bullet_points") {
        return `
You are an assistant helping improve a document.

Task:
Summarize the text into EXACTLY 3 bullet points.

STRICT REQUIREMENTS:
- Each bullet MUST be on its own line
- DO NOT put multiple bullets on one line
- DO NOT merge bullets together
- Each bullet must start with "- "
- Keep each bullet concise
- Do not repeat information

CORRECT FORMAT:
- First point
- Second point
- Third point

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();
      }

      return `
You are an assistant helping improve a document.

Task:
Summarize the text below.

Requirements:
- Preserve the original meaning.
- Do not add new facts.
- Be concise.
- Output a short paragraph only.

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();

    case "enhance":
      return `
You are an assistant helping improve a document.

Task:
Improve the writing quality of the text below.

Requirements:
- Preserve meaning and facts.
- Do not add new information.
- Improve clarity and readability.

Style:
${style ?? "clear and professional"}

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();

    case "translate":
      return `
You are an assistant helping improve a document.

Task:
Translate the text below to ${language ?? "English"}.

Requirements:
- Preserve meaning.
- Preserve formatting where possible.
- Do not add commentary.

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();

    case "reformat":
      if (formatStyle === "bullet_list") {
        return `
You are an assistant helping improve a document.

Task:
Convert the text into a clean bullet list.

STRICT REQUIREMENTS:
- Each bullet MUST be on its own line
- DO NOT combine multiple bullets on one line
- Each bullet must start with "- "
- Keep bullets concise
- Do not repeat content
- Do not add new information

CORRECT FORMAT:
- First point
- Second point
- Third point

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();
      }

      if (formatStyle === "structured_notes") {
        return `
You are an assistant helping improve a document.

Task:
Reformat the text into clean structured notes.

STRICT REQUIREMENTS:
- Output plain text only
- Do NOT use Markdown
- Do NOT use **bold**, headings with #, or code blocks
- Use short labels and bullets where helpful
- Preserve the original meaning
- Do not add new facts

CORRECT FORMAT EXAMPLE:
Topic
- Key point
- Key point
Details:
- Item
- Item

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();
      }

      return `
You are an assistant helping improve a document.

Task:
Reformat the text below.

Target format:
${formatStyle ?? "a clean structured format"}

Requirements:
- Preserve the original meaning.
- Do not add new facts.
- Only change structure or presentation.

--- BEGIN TEXT ---
${text}
--- END TEXT ---
`.trim();

    default:
      return text;
  }
}
