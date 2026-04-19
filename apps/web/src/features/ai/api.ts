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
  parameters?: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
    applyMode?: ApplyMode;
  };
};

export type AIStreamDone = {
  jobId: string;
  result: string;
  prompt?: string | null;
  model?: string | null;
};

export type AIHistoryItem = {
  jobId: string;
  operation: string;
  status: AIJobStatus;
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  selection: {
    start: number;
    end: number;
    text: string;
  };
  prompt: string | null;
  model: string | null;
  parameters: Record<string, unknown>;
  decisionStatus: string;
  result: string | null;
  errorMessage: string | null;
  acceptedAt: string | null;
  acceptedById: string | null;
  finalText: string | null;
  applicationCount: number;
};

type StreamEventPayload = {
  chunk?: string;
  jobId?: string;
  result?: string;
  prompt?: string | null;
  model?: string | null;
  message?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

function getOrgId(): string | null {
  const raw = localStorage.getItem("orgId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function isStreamEventPayload(value: unknown): value is StreamEventPayload {
  return typeof value === "object" && value !== null;
}

export async function createAIJob(params: CreateAIJobParams) {
  return http<AIJob>("/ai/jobs", {
    method: "POST",
    body: params,
  });
}

export async function getAIJob(jobId: string) {
  return http<AIJob>(`/ai/jobs/${encodeURIComponent(jobId)}`);
}

export async function applyAIJob(jobId: string, finalText: string) {
  return http<{ versionHeadId: string; updatedAt: string }>(
    `/ai/jobs/${encodeURIComponent(jobId)}/apply`,
    {
      method: "POST",
      body: { finalText },
    }
  );
}

export async function rejectAIJob(jobId: string) {
  return http<{ ok: boolean }>(`/ai/jobs/${encodeURIComponent(jobId)}/reject`, {
    method: "POST",
  });
}

export async function listAIHistory(documentId: string) {
  return http<AIHistoryItem[]>(`/ai/history/${encodeURIComponent(documentId)}`);
}

export async function streamAIJob(
  params: CreateAIJobParams,
  opts: {
    signal?: AbortSignal;
    onChunk: (chunk: string) => void;
  }
) {
  const token = getToken();
  const orgId = getOrgId();

  const res = await fetch(`${API_BASE_URL}${normalizePath("/ai/jobs/stream")}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { "x-org-id": orgId } : {}),
    },
    credentials: "include",
    body: JSON.stringify(params),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let donePayload: AIStreamDone | null = null;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary < 0) break;

      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) continue;

      let event = "message";
      let dataLine = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          dataLine += line.slice("data:".length).trim();
        }
      }

      if (!dataLine) continue;

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (!isStreamEventPayload(parsed)) {
        continue;
      }

      if (event === "chunk") {
        const chunk = typeof parsed.chunk === "string" ? parsed.chunk : "";
        if (!chunk) continue;
        result += chunk;
        opts.onChunk(chunk);
        continue;
      }

      if (event === "done") {
        donePayload = {
          jobId: String(parsed.jobId ?? ""),
          result: typeof parsed.result === "string" ? parsed.result : result,
          prompt: typeof parsed.prompt === "string" ? parsed.prompt : null,
          model: typeof parsed.model === "string" ? parsed.model : null,
        };
        continue;
      }

      if (event === "error") {
        throw new Error(typeof parsed.message === "string" ? parsed.message : "AI request failed");
      }
    }
  }

  if (!donePayload?.jobId) {
    throw new Error("AI stream ended before completion");
  }

  return donePayload;
}
