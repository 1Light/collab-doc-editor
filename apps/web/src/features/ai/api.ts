// apps/web/src/features/ai/aiJobs.ts

import { http } from "../../lib/http";

export type AIOperation = "enhance" | "summarize" | "translate" | "reformat";

export type AIJobStatus = "queued" | "running" | "succeeded" | "failed";

export type AIJobError = {
  code: string;
  message: string;
};

export type AIJob = {
  jobId: string;
  status: AIJobStatus;
  result?: string;
  error?: AIJobError;
  createdAt: string;
};

export type ApplyMode = "replace" | "insert_below";

export type CreateAIJobParams = {
  documentId: string;
  operation: AIOperation;
  selection: {
    start: number;
    end: number;
    text: string;
  };
  /**
   * Optional operation parameters.
   * Note: the API may ignore fields that are irrelevant for the chosen operation.
   */
  parameters?: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
    applyMode?: ApplyMode;
  };
};

/**
 * POST /ai/jobs
 */
export async function createAIJob(params: CreateAIJobParams) {
  return http<AIJob>("/ai/jobs", {
    method: "POST",
    body: params,
  });
}

/**
 * GET /ai/jobs/:jobId
 */
export async function getAIJob(jobId: string) {
  return http<AIJob>(`/ai/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * POST /ai/jobs/:jobId/apply
 */
export async function applyAIJob(jobId: string, finalText: string) {
  return http<{ versionHeadId: string; updatedAt: string }>(
    `/ai/jobs/${encodeURIComponent(jobId)}/apply`,
    {
      method: "POST",
      body: { finalText },
    }
  );
}