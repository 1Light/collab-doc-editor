import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import puppeteer from "puppeteer";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

import { ERROR_CODES } from "@repo/contracts";
import { documentRepo } from "./documentRepo";

const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), "exports");
const BASE_URL = process.env.EXPORT_BASE_URL || "http://localhost:4000";

type ExportFormat = "pdf" | "docx";

async function ensureExportDir() {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeTitle(title: string | null | undefined) {
  const clean = typeof title === "string" ? title.trim() : "";
  return clean.length > 0 ? clean : "document";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtmlDocument(params: { title: string; bodyHtml: string }) {
  const title = normalizeTitle(params.title);
  const bodyHtml = typeof params.bodyHtml === "string" ? params.bodyHtml : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 20mm 16mm;
      }

      * { box-sizing: border-box; }

      html, body {
        padding: 0;
        margin: 0;
        background: #ffffff;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.6;
        font-size: 12pt;
      }

      .document-content h1,
      .document-content h2,
      .document-content h3,
      .document-content h4,
      .document-content h5,
      .document-content h6 {
        line-height: 1.3;
        margin-top: 1.2em;
        margin-bottom: 0.5em;
      }

      .document-content h1 { font-size: 20pt; }
      .document-content h2 { font-size: 17pt; }
      .document-content h3 { font-size: 15pt; }

      .document-content p { margin: 0 0 0.9em 0; }

      .document-content ul,
      .document-content ol {
        margin: 0 0 1em 1.4em;
      }

      .document-content blockquote {
        margin: 1em 0;
        padding: 0.75em 1em;
        border-left: 4px solid #d1d5db;
        background: #f9fafb;
      }

      .document-content pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
      }

      .document-content img {
        max-width: 100%;
        height: auto;
      }

      .document-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 1em 0;
      }

      .document-content th,
      .document-content td {
        border: 1px solid #d1d5db;
        padding: 8px;
      }

      .document-content hr {
        border: 0;
        border-top: 1px solid #e5e7eb;
        margin: 1.25em 0;
      }
    </style>
  </head>
  <body>
    <div class="document-content">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function buildBodyHtml(content: string | null | undefined) {
  const raw = typeof content === "string" ? content.trim() : "";
  if (!raw) return "<p></p>";

  if (looksLikeHtml(raw)) {
    return raw;
  }

  const paragraphs = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`);

  return paragraphs.length > 0 ? paragraphs.join("") : "<p></p>";
}

async function buildPdfBuffer(htmlDocument: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(htmlDocument, {
      waitUntil: "networkidle0",
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function buildDocxBuffer(title: string, bodyHtml: string) {
  const plainText = stripHtmlToText(bodyHtml);
  const lines = plainText.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);

  const paragraphs: Paragraph[] = [];

  if (lines.length === 0) {
    paragraphs.push(new Paragraph(""));
  } else {
    for (const line of lines) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line)],
        })
      );
    }
  }

  const doc = new Document({
    creator: "Collab Editor",
    title, // keep metadata, not content
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export const exportService = {
  async exportDocument(params: {
    documentId: string;
    format: ExportFormat;
  }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    if (params.format !== "pdf" && params.format !== "docx") {
      throw {
        code: ERROR_CODES.INVALID_REQUEST,
        message: "Only pdf and docx export are supported",
        details: { supported: ["pdf", "docx"], requested: params.format },
      };
    }

    await ensureExportDir();

    const safeTitle = sanitizeFilenamePart(doc.title || "document") || "document";
    const token = randomToken();
    const filename = `${safeTitle}_${doc.id}_${token}.${params.format}`;
    const filepath = path.join(EXPORT_DIR, filename);

    const bodyHtml = buildBodyHtml(doc.content);
    const htmlDocument = wrapHtmlDocument({
      title: normalizeTitle(doc.title),
      bodyHtml,
    });

    const buffer =
      params.format === "pdf"
        ? await buildPdfBuffer(htmlDocument)
        : await buildDocxBuffer(normalizeTitle(doc.title), bodyHtml);

    await fs.writeFile(filepath, buffer);

    return {
      downloadUrl: `${BASE_URL}/exports/${filename}`,
      format: params.format,
      filename,
    };
  },
};
