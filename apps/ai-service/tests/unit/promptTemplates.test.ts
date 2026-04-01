import { describe, it, expect } from "vitest";
import { buildPrompt } from "../../src/modules/jobs/promptTemplates";

describe("buildPrompt", () => {
  it("builds summarize prompt with default paragraph style", () => {
    const prompt = buildPrompt("summarize", {
      selectedText: "  Hello world.  ",
    });

    expect(prompt).toContain("Summarize the text below.");
    expect(prompt).toContain("Hello world.");
    expect(prompt).not.toContain("  Hello world.  ");
  });

  it("builds summarize prompt for bullet points", () => {
    const prompt = buildPrompt("summarize", {
      selectedText: "Item one. Item two. Item three.",
      summaryStyle: "bullet_points",
    });

    expect(prompt).toContain("EXACTLY 3 bullet points");
    expect(prompt).toContain('Each bullet must start with "- "');
  });

  it("builds enhance prompt with custom style", () => {
    const prompt = buildPrompt("enhance", {
      selectedText: "Some rough draft text.",
      style: "formal",
    });

    expect(prompt).toContain("Improve the writing quality");
    expect(prompt).toContain("formal");
    expect(prompt).toContain("Some rough draft text.");
  });

  it("builds translate prompt with target language", () => {
    const prompt = buildPrompt("translate", {
      selectedText: "Hello",
      language: "Arabic",
    });

    expect(prompt).toContain("Translate the text below to Arabic.");
    expect(prompt).toContain("Hello");
  });

  it("defaults translate target language to English", () => {
    const prompt = buildPrompt("translate", {
      selectedText: "Bonjour",
    });

    expect(prompt).toContain("Translate the text below to English.");
  });

  it("builds reformat prompt for bullet list", () => {
    const prompt = buildPrompt("reformat", {
      selectedText: "One. Two. Three.",
      formatStyle: "bullet_list",
    });

    expect(prompt).toContain("Convert the text into a clean bullet list.");
    expect(prompt).toContain('Each bullet must start with "- "');
  });

  it("builds generic reformat prompt when no special formatStyle is given", () => {
    const prompt = buildPrompt("reformat", {
      selectedText: "Messy text",
      formatStyle: "table",
    });

    expect(prompt).toContain("Target format:");
    expect(prompt).toContain("table");
    expect(prompt).toContain("Messy text");
  });

  it("falls back to clean structured format when reformat style is missing", () => {
    const prompt = buildPrompt("reformat", {
      selectedText: "Messy text",
    });

    expect(prompt).toContain("a clean structured format");
  });
});