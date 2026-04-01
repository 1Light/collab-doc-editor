// apps/api/src/modules/ai/aiJobService.ts

import { ERROR_CODES } from "@repo/contracts";
import type { AIOperation } from "@repo/contracts";
import type { DocumentRole } from "@repo/contracts";

import { config } from "../../config/env";
import { documentRepo } from "../documents/documentRepo";
import { aiJobRepo } from "../ai/aiJobRepo";
import { aiJobApplicationRepo } from "../ai/aiJobApplicationRepo";
import { versionRepo } from "../versions/versionRepo";
import { permissionService } from "../permissions/permissionService";
import { aiPolicyService } from "./aiPolicyService";
import { auditLogService } from "../audit/auditLogService";

import { AIJobStatus, AIOperation as PrismaAIOperation } from "@prisma/client";

type ApplyMode = "replace" | "insert_below";

type CreateJobParams = {
  documentId: string;
  requesterId: string;
  operation: AIOperation;
  selection: { start: number; end: number; text: string };
  parameters?: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
    applyMode?: ApplyMode;
  };
};

type ApplyJobParams = {
  jobId: string;
  requesterId: string;
  finalText: string;
};

type NormalizedAIParameters = {
  style?: string;
  summaryStyle?: string;
  language?: string;
  formatStyle?: string;
  applyMode: ApplyMode;
};

function apiError(
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  details?: unknown
) {
  return { code, message, ...(details !== undefined ? { details } : {}) };
}

async function callAIServiceRunJob(payload: {
  jobId: string;
  operation: AIOperation;
  selectedText: string;
  parameters?: Record<string, unknown>;
}): Promise<{ result: string }> {
  const url = `${config.AI_SERVICE_URL}/jobs/run`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw apiError(ERROR_CODES.AI_PROVIDER_UNAVAILABLE, "AI service unavailable", {
      reason: "network",
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiError(ERROR_CODES.AI_PROVIDER_UNAVAILABLE, "AI service error", {
      reason: res.status === 502 || res.status === 503 ? "unreachable" : "upstream_error",
      status: res.status,
      body: text,
    });
  }

  const data = (await res.json().catch(() => null)) as { result?: string } | null;
  if (!data?.result || typeof data.result !== "string") {
    throw apiError(
      ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      "AI service returned invalid response",
      {
        reason: "upstream_error",
      }
    );
  }

  return { result: data.result };
}

function normalizeRequestedSelection(selection: {
  start: number;
  end: number;
  text: string;
}) {
  const start = Number(selection?.start);
  const end = Number(selection?.end);
  const text = typeof selection?.text === "string" ? selection.text : "";

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range");
  }

  if (start < 0 || end < 0 || end <= start) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range");
  }

  const MAX_LEN = 20_000;
  if (text.length > MAX_LEN) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, `Selection too large (max ${MAX_LEN} chars)`);
  }

  if (!text.trim()) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "selection.text is required");
  }

  return { start, end, text };
}

function normalizePersistedSelection(
  selection: { start: number; end: number; text: string },
  contentLength: number
) {
  const start = Number(selection?.start);
  const end = Number(selection?.end);
  const text = typeof selection?.text === "string" ? selection.text : "";

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range");
  }

  if (start < 0 || end < 0 || end <= start) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range");
  }

  const safeStart = Math.min(start, contentLength);
  const safeEnd = Math.min(end, contentLength);

  if (safeEnd <= safeStart) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Selection is out of bounds");
  }

  const MAX_LEN = 20_000;
  const len = safeEnd - safeStart;
  if (len > MAX_LEN) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, `Selection too large (max ${MAX_LEN} chars)`);
  }

  if (!text.trim()) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "selection.text is required");
  }

  return { start: safeStart, end: safeEnd, text };
}

function normalizeParameters(
  operation: AIOperation,
  parameters?: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
    applyMode?: ApplyMode;
  }
): NormalizedAIParameters {
  const out: NormalizedAIParameters = {
    applyMode: operation === "summarize" ? "insert_below" : "replace",
  };

  if (parameters?.style?.trim()) {
    out.style = parameters.style.trim();
  }

  if (parameters?.summaryStyle?.trim()) {
    out.summaryStyle = parameters.summaryStyle.trim();
  }

  if (parameters?.language?.trim()) {
    out.language = parameters.language.trim();
  }

  if (parameters?.formatStyle?.trim()) {
    out.formatStyle = parameters.formatStyle.trim();
  }

  if (parameters?.applyMode === "replace" || parameters?.applyMode === "insert_below") {
    out.applyMode = parameters.applyMode;
  }

  if (operation === "translate" && !out.language) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "language is required for translate");
  }

  if (operation === "reformat" && !out.formatStyle) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "formatStyle is required for reformat");
  }

  return out;
}

function replaceRange(base: string, start: number, end: number, insert: string): string {
  const s = Math.max(0, Math.min(start, base.length));
  const e = Math.max(s, Math.min(end, base.length));
  return base.slice(0, s) + insert + base.slice(e);
}

function insertBelowRange(base: string, end: number, insert: string): string {
  const safeEnd = Math.max(0, Math.min(end, base.length));
  const prefix = base.slice(0, safeEnd);
  const suffix = base.slice(safeEnd);

  const separator = prefix.endsWith("\n") ? "\n" : "\n\n";
  return `${prefix}${separator}${insert}${suffix}`;
}

function mapOperationToPrisma(operation: AIOperation): PrismaAIOperation {
  switch (operation) {
    case "enhance":
      return PrismaAIOperation.rewrite;
    case "summarize":
      return PrismaAIOperation.summarize;
    case "translate":
      return PrismaAIOperation.translate;
    case "reformat":
      return PrismaAIOperation.reformat;
    default:
      throw apiError(ERROR_CODES.INVALID_REQUEST, "Unsupported AI operation");
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
}

function dedupeBrokenTail(text: string): string {
  const t = text.trim();
  if (t.length < 20) return t;

  const words = t.split(/\s+/);
  if (words.length < 4) return t;

  const last = words[words.length - 1];
  const prev = words[words.length - 2];

  if (
    last.length > 6 &&
    prev.length > 3 &&
    last.toLowerCase().includes(prev.toLowerCase())
  ) {
    return words.slice(0, -1).join(" ");
  }

  return t;
}

function splitInlineBullets(text: string): string {
  const normalized = normalizeWhitespace(text);

  if (!normalized.includes("- ")) {
    return dedupeBrokenTail(normalized);
  }

  const collapsed = normalized.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

  const rawParts = collapsed
    .split(/\s(?=-\s)/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rawParts.length <= 1) {
    return dedupeBrokenTail(normalized);
  }

  const bulletParts = rawParts.map((part) =>
    part.startsWith("- ") ? part : `- ${part.replace(/^-\s*/, "")}`
  );

  return dedupeBrokenTail(bulletParts.join("\n"));
}

function cleanBulletOutput(text: string): string {
  const split = splitInlineBullets(text);

  const lines = split
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const cleanedLines = lines.map((line) => {
    if (!line.startsWith("- ")) return line;
    return `- ${line.replace(/^-\s*/, "").replace(/\s+/g, " ").trim()}`;
  });

  return dedupeBrokenTail(cleanedLines.join("\n")).trim();
}

function shouldNormalizeAsBullets(
  operation: AIOperation,
  parameters: {
    summaryStyle?: string;
    formatStyle?: string;
  }
): boolean {
  return (
    (operation === "summarize" && parameters.summaryStyle === "bullet_points") ||
    (operation === "reformat" && parameters.formatStyle === "bullet_list")
  );
}

function normalizeAppliedFinalText(
  operation: AIOperation,
  finalText: string,
  parameters: {
    summaryStyle?: string;
    formatStyle?: string;
  }
): string {
  const text = normalizeWhitespace(finalText);

  if (!text) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "finalText is required");
  }

  if (shouldNormalizeAsBullets(operation, parameters)) {
    return cleanBulletOutput(text);
  }

  return dedupeBrokenTail(text);
}

async function processAIJob(params: {
  jobId: string;
  operation: AIOperation;
  selectedText: string;
  parameters: NormalizedAIParameters;
}) {
  await aiJobRepo.updateStatus(params.jobId, AIJobStatus.running);

  try {
    const { result } = await callAIServiceRunJob({
      jobId: params.jobId,
      operation: params.operation,
      selectedText: params.selectedText,
      parameters: params.parameters,
    });

    await aiJobRepo.updateStatus(params.jobId, AIJobStatus.succeeded, { result });
  } catch (err: any) {
    await aiJobRepo.updateStatus(params.jobId, AIJobStatus.failed, {
      errorMessage: err?.message ?? "AI job failed",
    });
  }
}

export const aiJobService = {
  async createJob(params: CreateJobParams) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw apiError(ERROR_CODES.NOT_FOUND, "Document not found");

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.requesterId,
    });
    if (!role) throw apiError(ERROR_CODES.FORBIDDEN, "No access to this document");

    const allowedToInvoke: DocumentRole[] = ["Editor", "Owner"];
    if (!allowedToInvoke.includes(role)) {
      throw apiError(ERROR_CODES.FORBIDDEN, "Insufficient role to invoke AI");
    }

    await aiPolicyService.enforceAtJobCreation({
      documentRole: role,
      userId: params.requesterId,
    });

    const normalizedSelection = normalizeRequestedSelection(params.selection);
    const normalizedParameters = normalizeParameters(params.operation, params.parameters);
    const selectedText = normalizedSelection.text;

    const job = await aiJobRepo.create({
      documentId: doc.id,
      userId: params.requesterId,
      operation: mapOperationToPrisma(params.operation),
      selectionStart: normalizedSelection.start,
      selectionEnd: normalizedSelection.end,
      parameters: normalizedParameters,
      basedOnVersionId: doc.headVersionId ?? null,
    });

    void processAIJob({
      jobId: job.id,
      operation: params.operation,
      selectedText,
      parameters: normalizedParameters,
    });

    const created = await aiJobRepo.findById(job.id);
    if (!created) {
      throw apiError(ERROR_CODES.INTERNAL_ERROR, "AI job missing after creation");
    }

    return created;
  },

  async getJob(jobId: string) {
    const job = await aiJobRepo.findById(jobId);
    if (!job) throw apiError(ERROR_CODES.NOT_FOUND, "AI job not found");
    return job;
  },

  async applyJob(params: ApplyJobParams) {
    const job = await aiJobRepo.findById(params.jobId);
    if (!job) throw apiError(ERROR_CODES.NOT_FOUND, "AI job not found");

    if (job.status !== AIJobStatus.succeeded) {
      throw apiError(ERROR_CODES.INVALID_REQUEST, "AI job is not in a succeeded state");
    }

    const doc = await documentRepo.findById(job.documentId);
    if (!doc) throw apiError(ERROR_CODES.NOT_FOUND, "Document not found");

    const role = await permissionService.resolveEffectiveRole({
      documentId: doc.id,
      userId: params.requesterId,
    });
    if (!role) throw apiError(ERROR_CODES.FORBIDDEN, "No access to this document");
    if (!["Editor", "Owner"].includes(role)) {
      throw apiError(ERROR_CODES.FORBIDDEN, "Insufficient role to apply AI suggestion");
    }

    const normalizedSelection = normalizePersistedSelection(
      {
        start: job.selectionStart,
        end: job.selectionEnd,
        text: doc.content.slice(job.selectionStart, job.selectionEnd),
      },
      doc.content.length
    );

    if (job.basedOnVersionId && doc.headVersionId && job.basedOnVersionId !== doc.headVersionId) {
      throw apiError(
        ERROR_CODES.CONFLICT,
        "Document changed since this AI suggestion was generated"
      );
    }

    const jobParameters =
      job.parameters && typeof job.parameters === "object"
        ? (job.parameters as {
            applyMode?: ApplyMode;
            summaryStyle?: string;
            formatStyle?: string;
          })
        : {};

    const applyMode: ApplyMode =
      jobParameters.applyMode === "insert_below" ? "insert_below" : "replace";

    const normalizedFinalText = normalizeAppliedFinalText(
      job.operation === PrismaAIOperation.rewrite
        ? "enhance"
        : job.operation === PrismaAIOperation.summarize
          ? "summarize"
          : job.operation === PrismaAIOperation.translate
            ? "translate"
            : "reformat",
      params.finalText,
      {
        summaryStyle: jobParameters.summaryStyle,
        formatStyle: jobParameters.formatStyle,
      }
    );

    const newContent =
      applyMode === "insert_below"
        ? insertBelowRange(doc.content, normalizedSelection.end, normalizedFinalText)
        : replaceRange(
            doc.content,
            normalizedSelection.start,
            normalizedSelection.end,
            normalizedFinalText
          );

    const newVersion = await versionRepo.create({
      documentId: doc.id,
      parentVersionId: doc.headVersionId ?? null,
      content: newContent,
      authorId: params.requesterId,
      reason: "ai_application",
    });

    const updatedDoc = await documentRepo.updateContent(doc.id, newContent, newVersion.id);

    await aiJobApplicationRepo.create({
      aiJobId: job.id,
      appliedById: params.requesterId,
      finalText: normalizedFinalText,
      newVersionId: newVersion.id,
    });

    await auditLogService.logAction({
      userId: params.requesterId,
      actionType: "AI_SUGGESTION_APPLIED",
      documentId: doc.id,
      metadata: {
        aiJobId: job.id,
        basedOnVersionId: job.basedOnVersionId,
        newHeadVersionId: newVersion.id,
        applyMode,
      },
    });

    return {
      versionHeadId: updatedDoc.headVersionId,
      updatedAt: updatedDoc.updatedAt.toISOString(),
    };
  },
};