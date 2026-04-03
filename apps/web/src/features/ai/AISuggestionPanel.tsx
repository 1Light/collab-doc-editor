import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyAIJob,
  createAIJob,
  getAIJob,
  type AIOperation,
  type AIJob,
} from "../../features/ai/api";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";

type ApplyMode = "replace" | "insert_below";

type FrozenSelection = {
  start: number;
  end: number;
  text: string;
  pmFrom: number;
  pmTo: number;
};

type Props = {
  documentId: string;
  selection: FrozenSelection;
  onApplied?: (result: {
    versionHeadId: string;
    updatedAt: string;
    finalText: string;
    applyMode: ApplyMode;
    operation: AIOperation;
    targetSelection: FrozenSelection;
  }) => void;
};

type Mode = "idle" | "running" | "ready" | "error";
type NoticeKind = "info" | "error" | "conflict";

type EnhanceStyle = "clearer" | "concise" | "professional" | "formal";
type SummaryStyle = "short_paragraph" | "bullet_points";
type ReformatStyle =
  | "bullet_list"
  | "paragraph"
  | "professional_email"
  | "structured_notes";

type OperationConfig = {
  op: AIOperation;
  label: string;
  hint: string;
  applyMode: ApplyMode;
};

const DEFAULT_OPS: OperationConfig[] = [
  {
    op: "enhance",
    label: "Enhance writing",
    hint: "Improve clarity and tone while preserving meaning.",
    applyMode: "replace",
  },
  {
    op: "summarize",
    label: "Summarize",
    hint: "Generate a concise summary of the selected text.",
    applyMode: "insert_below",
  },
  {
    op: "translate",
    label: "Translate",
    hint: "Translate the selected text into another language.",
    applyMode: "replace",
  },
  {
    op: "reformat",
    label: "Change format",
    hint: "Restructure the selected text without changing its meaning.",
    applyMode: "replace",
  },
];

const ENHANCE_OPTIONS: Array<{ value: EnhanceStyle; label: string }> = [
  { value: "clearer", label: "Clearer" },
  { value: "concise", label: "More concise" },
  { value: "professional", label: "More professional" },
  { value: "formal", label: "More formal" },
];

const SUMMARY_OPTIONS: Array<{ value: SummaryStyle; label: string }> = [
  { value: "short_paragraph", label: "Short paragraph" },
  { value: "bullet_points", label: "3 bullet points" },
];

const LANGUAGE_OPTIONS = ["Arabic", "English", "French", "Spanish", "German"];

const REFORMAT_OPTIONS: Array<{ value: ReformatStyle; label: string }> = [
  { value: "bullet_list", label: "Bullet list" },
  { value: "paragraph", label: "Paragraph" },
  { value: "professional_email", label: "Professional email" },
  { value: "structured_notes", label: "Structured notes" },
];

function clampPreview(text: string, max = 220) {
  const t = text ?? "";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
}

function dedupeBrokenTail(text: string) {
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

function splitInlineBullets(text: string) {
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

function cleanBulletOutput(text: string) {
  const withSplitBullets = splitInlineBullets(text);

  const lines = withSplitBullets
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
  summaryStyle: SummaryStyle,
  reformatStyle: ReformatStyle
) {
  return (
    (operation === "summarize" && summaryStyle === "bullet_points") ||
    (operation === "reformat" && reformatStyle === "bullet_list")
  );
}

function isConflictError(err: any) {
  return err?.status === 409 || err?.code === "CONFLICT";
}

export function AISuggestionPanel({ documentId, selection, onApplied }: Props) {
  const [operation, setOperation] = useState<AIOperation>("enhance");
  const [enhanceStyle, setEnhanceStyle] = useState<EnhanceStyle>("clearer");
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>("short_paragraph");
  const [language, setLanguage] = useState("Arabic");
  const [customLanguage, setCustomLanguage] = useState("");
  const [reformatStyle, setReformatStyle] = useState<ReformatStyle>("bullet_list");

  const [job, setJob] = useState<AIJob | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("info");
  const [finalText, setFinalText] = useState("");

  const pollTimerRef = useRef<number | null>(null);
  const frozenSelectionRef = useRef<FrozenSelection | null>(null);

  const selectionLen = useMemo(
    () => Math.max(0, (selection?.end ?? 0) - (selection?.start ?? 0)),
    [selection?.start, selection?.end]
  );

  const canRun = useMemo(
    () => (selection?.end ?? 0) > (selection?.start ?? 0),
    [selection?.start, selection?.end]
  );

  const selectionPreview = useMemo(() => {
    const t = selection?.text ?? "";
    return clampPreview(t.trim(), 240);
  }, [selection?.text]);

  const activeOp = useMemo(
    () => DEFAULT_OPS.find((o) => o.op === operation) ?? DEFAULT_OPS[0],
    [operation]
  );

  const isRunning = mode === "running";
  const canApply =
    (mode === "ready" || (mode === "error" && noticeKind === "conflict")) &&
    Boolean(job) &&
    finalText.trim().length > 0;

  const effectiveLanguage = useMemo(() => {
    const custom = customLanguage.trim();
    return custom.length > 0 ? custom : language;
  }, [customLanguage, language]);

  const applyHint = useMemo(() => {
    if (activeOp.applyMode === "insert_below") {
      return "Apply will insert the generated result below the selected text.";
    }
    return "Apply will replace the selected text.";
  }, [activeOp.applyMode]);

  function clearPollTimer() {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function normalizeSuggestionText(raw: string) {
    const text = normalizeWhitespace(raw);

    if (shouldNormalizeAsBullets(operation, summaryStyle, reformatStyle)) {
      return cleanBulletOutput(text);
    }

    return dedupeBrokenTail(text);
  }

  useEffect(() => {
    if (mode === "idle") return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.start, selection.end, selection.text, selection.pmFrom, selection.pmTo]);

  useEffect(() => {
    if (!job) return;

    const shouldPoll = job.status === "queued" || job.status === "running";
    if (!shouldPoll) {
      clearPollTimer();
      return;
    }

    setMode("running");

    if (pollTimerRef.current != null) return;

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const latest = await getAIJob(job.jobId);
        setJob(latest);

        if (latest.status === "succeeded") {
          setFinalText(normalizeSuggestionText(latest.result ?? ""));
          setError(null);
          setNoticeKind("info");
          setMode("ready");
          clearPollTimer();
          return;
        }

        if (latest.status === "failed") {
          setError(latest.error?.message ?? "AI job failed");
          setNoticeKind("error");
          setMode("error");
          clearPollTimer();
          return;
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to poll AI job");
        setNoticeKind("error");
        setMode("error");
        clearPollTimer();
      }
    }, 900);

    return () => {
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId, job?.status]);

  async function run() {
    if (!canRun || isRunning) return;

    const targetSelection: FrozenSelection = {
      start: selection.start,
      end: selection.end,
      text: selection.text,
      pmFrom: selection.pmFrom,
      pmTo: selection.pmTo,
    };

    frozenSelectionRef.current = targetSelection;

    clearPollTimer();
    setError(null);
    setNoticeKind("info");
    setMode("running");
    setJob(null);
    setFinalText("");

    try {
      const created = await createAIJob({
        documentId,
        operation,
        selection: {
          start: targetSelection.start,
          end: targetSelection.end,
          text: targetSelection.text,
        },
        parameters: {
          ...(operation === "enhance" ? { style: enhanceStyle } : {}),
          ...(operation === "summarize" ? { summaryStyle } : {}),
          ...(operation === "translate" ? { language: effectiveLanguage } : {}),
          ...(operation === "reformat" ? { formatStyle: reformatStyle } : {}),
          applyMode: activeOp.applyMode,
        },
      });

      setJob(created);

      if (created.status === "succeeded") {
        setFinalText(normalizeSuggestionText(created.result ?? ""));
        setError(null);
        setNoticeKind("info");
        setMode("ready");
      } else if (created.status === "failed") {
        setError(created.error?.message ?? "AI job failed");
        setNoticeKind("error");
        setMode("error");
      } else {
        setMode("running");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create AI job");
      setNoticeKind("error");
      setMode("error");
    }
  }

  async function apply() {
    if (!job || !canApply) return;

    setError(null);

    try {
      const cleanedFinalText = normalizeSuggestionText(finalText);
      const out = await applyAIJob(job.jobId, cleanedFinalText);

      const targetSelection =
        frozenSelectionRef.current ?? {
          start: selection.start,
          end: selection.end,
          text: selection.text,
          pmFrom: selection.pmFrom,
          pmTo: selection.pmTo,
        };

      onApplied?.({
        ...out,
        finalText: cleanedFinalText,
        applyMode: activeOp.applyMode,
        operation,
        targetSelection,
      });

      clearPollTimer();
      setJob(null);
      setMode("idle");
      setError(null);
      setNoticeKind("info");
      setFinalText("");
      frozenSelectionRef.current = null;
    } catch (e: any) {
      if (isConflictError(e)) {
        setError(
          e?.message ??
            "This suggestion is outdated because the document changed. Review it, copy anything you want, or generate a new suggestion."
        );
        setNoticeKind("conflict");
      } else {
        setError(e?.message ?? "Failed to apply suggestion");
        setNoticeKind("error");
      }

      setMode("error");
    }
  }

  async function rerun() {
    if (isRunning || !canRun) return;
    await run();
  }

  function reset() {
    clearPollTimer();
    setError(null);
    setNoticeKind("info");
    setJob(null);
    setMode("idle");
    setFinalText("");
    frozenSelectionRef.current = null;
  }

  return (
    <Card className="w-full overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">AI suggestions</div>
            <div className="mt-1 text-xs text-slate-500">{activeOp.hint}</div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={canRun ? "success" : "neutral"}>
              {canRun ? `${selectionLen} chars` : "No selection"}
            </Badge>
            <Badge
              variant={
                mode === "running"
                  ? "warning"
                  : mode === "ready"
                    ? "success"
                    : mode === "error" && noticeKind === "conflict"
                      ? "warning"
                      : "neutral"
              }
            >
              {mode === "running"
                ? "Running"
                : mode === "ready"
                  ? "Ready"
                  : mode === "error" && noticeKind === "conflict"
                    ? "Outdated"
                    : mode === "error"
                      ? "Error"
                      : "Idle"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-900">Original selection</div>
            {canRun ? (
              <div className="text-xs text-gray-600">
                Range: {selection.start} to {selection.end}
              </div>
            ) : (
              <div className="text-xs text-gray-600">Select text in the editor to begin</div>
            )}
          </div>

          <div className="mt-2 max-h-28 overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
            <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800">
              {canRun ? (selectionPreview || "Selection is empty.") : "No selection."}
            </div>
          </div>

          {canRun && (selection.text?.length ?? 0) > selectionPreview.length ? (
            <div className="mt-2 text-xs text-slate-500">Preview is truncated for readability.</div>
          ) : (
            <div className="mt-2 text-xs text-slate-500">
              Tip: shorter selections usually produce better results.
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">Operation</label>
            <div className="mt-2">
              <select
                className={[
                  "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  "disabled:bg-gray-50 disabled:text-gray-500",
                ].join(" ")}
                value={operation}
                onChange={(e) => setOperation(e.target.value as AIOperation)}
                disabled={isRunning}
              >
                {DEFAULT_OPS.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-500">{activeOp.hint}</div>
          </div>

          {operation === "enhance" && (
            <div>
              <label className="block text-xs font-medium text-gray-700">Style</label>
              <div className="mt-2">
                <select
                  className={[
                    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                    "disabled:bg-gray-50 disabled:text-gray-500",
                  ].join(" ")}
                  value={enhanceStyle}
                  onChange={(e) => setEnhanceStyle(e.target.value as EnhanceStyle)}
                  disabled={isRunning}
                >
                  {ENHANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-slate-500">
                Preserves meaning while improving wording.
              </div>
            </div>
          )}

          {operation === "summarize" && (
            <div>
              <label className="block text-xs font-medium text-gray-700">Summary style</label>
              <div className="mt-2">
                <select
                  className={[
                    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                    "disabled:bg-gray-50 disabled:text-gray-500",
                  ].join(" ")}
                  value={summaryStyle}
                  onChange={(e) => setSummaryStyle(e.target.value as SummaryStyle)}
                  disabled={isRunning}
                >
                  {SUMMARY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-slate-500">
                Summaries are inserted below the selected text by default.
              </div>
            </div>
          )}

          {operation === "translate" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700">Language</label>
                <div className="mt-2">
                  <select
                    className={[
                      "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                      "disabled:bg-gray-50 disabled:text-gray-500",
                    ].join(" ")}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={isRunning}
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Custom language
                </label>
                <div className="mt-2">
                  <Input
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                    placeholder="Optional: Italian, Urdu, Turkish"
                    disabled={isRunning}
                  />
                </div>
                <div className="mt-2 text-xs leading-relaxed text-slate-500">
                  If filled, this overrides the selected language.
                </div>
              </div>
            </>
          )}

          {operation === "reformat" && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700">Target format</label>
              <div className="mt-2">
                <select
                  className={[
                    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                    "disabled:bg-gray-50 disabled:text-gray-500",
                  ].join(" ")}
                  value={reformatStyle}
                  onChange={(e) => setReformatStyle(e.target.value as ReformatStyle)}
                  disabled={isRunning}
                >
                  {REFORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-slate-500">
                Changes structure and presentation while preserving meaning.
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {applyHint}
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={run}
              disabled={!canRun || isRunning}
              className="w-full sm:w-auto"
            >
              {isRunning ? "Generating..." : "Generate"}
            </Button>

            <Button
              variant="secondary"
              onClick={apply}
              disabled={!canApply}
              className="w-full sm:w-auto"
            >
              Accept
            </Button>

            {(mode === "ready" || mode === "error") && (
              <Button
                variant="secondary"
                onClick={rerun}
                disabled={!canRun || isRunning}
                className="w-full sm:w-auto"
              >
                Try again
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-relaxed text-gray-600">
              {mode === "idle" && "Ready when you are."}
              {mode === "running" && "Working on it."}
              {mode === "ready" && "Review, edit, then accept or reject."}
              {mode === "error" &&
                noticeKind === "conflict" &&
                "This suggestion is outdated because the document changed. You can still review it, copy from it, edit it, or generate a new one."}
              {mode === "error" &&
                noticeKind !== "conflict" &&
                "Fix the issue and try again."}
            </div>

            {(mode === "ready" || mode === "error") && (
              <button
                type="button"
                onClick={reset}
                className="self-start text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 sm:self-auto"
              >
                {mode === "ready" ? "Reject" : "Dismiss"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-900">Suggestion</div>
            {mode === "ready" ? (
              <Badge variant="success">Editable</Badge>
            ) : mode === "running" ? (
              <Badge variant="warning">Generating</Badge>
            ) : mode === "error" && noticeKind === "conflict" ? (
              <Badge variant="warning">Outdated but editable</Badge>
            ) : (
              <Badge variant="neutral">Idle</Badge>
            )}
          </div>

          <div className="mt-2">
            <textarea
              className={[
                "w-full min-h-[160px] rounded-2xl border border-slate-200 bg-white p-3 text-sm text-gray-900 shadow-sm",
                "placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                "disabled:bg-gray-50 disabled:text-gray-500",
              ].join(" ")}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              placeholder={
                canRun
                  ? mode === "running"
                    ? "Generating suggestion..."
                    : "Your generated suggestion will appear here."
                  : "Select text in the editor to generate a suggestion."
              }
              disabled={mode === "running"}
            />
          </div>

          {mode === "error" && (
            <div
              className={[
                "mt-3 rounded-2xl p-3 text-sm",
                noticeKind === "conflict"
                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                  : "border border-red-200 bg-red-50 text-red-800",
              ].join(" ")}
            >
              <div
                className={[
                  "font-medium",
                  noticeKind === "conflict" ? "text-amber-950" : "text-red-900",
                ].join(" ")}
              >
                {noticeKind === "conflict" ? "Suggestion is outdated" : "Request failed"}
              </div>
              <div className="mt-1">{error ?? "Something went wrong"}</div>
            </div>
          )}

          {(mode === "ready" || (mode === "error" && noticeKind === "conflict")) && (
            <div className="mt-2 text-xs text-slate-500">
              You can edit the suggestion before accepting it.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}