// apps/web/src/editor/LinkEditorPopover.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Popover } from "../../components/ui/Popover";
import { Button } from "../../components/ui/Button";

type Props = {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
};

function normalizeUrl(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v) && !/^mailto:/i.test(v)) return `https://${v}`;
  return v;
}

export function LinkEditorPopover({ editor, open, onOpenChange, anchorRef }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currentHref = useMemo(() => {
    if (!editor) return "";
    try {
      const attrs = editor.getAttributes("link") as { href?: string };
      return attrs?.href ?? "";
    } catch {
      return "";
    }
  }, [editor, open]);

  const [value, setValue] = useState("");

  // Centralized close: ensures consistent focus return
  const close = (opts?: { focusAnchor?: boolean }) => {
    onOpenChange(false);
    if (opts?.focusAnchor !== false) {
      window.requestAnimationFrame(() => anchorRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!open) return;
    setValue(currentHref);
  }, [open, currentHref]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const hasSelection = useMemo(() => {
    if (!editor) return false;
    try {
      const { from, to } = editor.state.selection;
      return to > from;
    } catch {
      return false;
    }
  }, [editor, open]);

  const canSubmit = value.trim().length > 0 && hasSelection;

  return (
    <Popover
      anchorRef={anchorRef as unknown as React.RefObject<HTMLElement>}
      open={open}
      onClose={() => close()}
      placement="bottom-end"
    >
      <div className="w-[320px] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900">Link</div>
            <div className="mt-0.5 text-[11px] text-gray-500">Select text, then add a URL.</div>
          </div>

          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
            {currentHref ? "Editing" : "New"}
          </span>
        </div>

        <div className="mt-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://example.com"
            className={[
              "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900",
              "placeholder:text-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              "transition-colors",
            ].join(" ")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!editor || !canSubmit) return;

                const href = normalizeUrl(value);
                editor.chain().focus().setLink({ href }).run();
                close();
              }

              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />

          {!hasSelection && (
            <div className="mt-2 text-xs text-gray-600">
              No selection: highlight text to apply a link.
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!editor || !canSubmit}
              onClick={() => {
                if (!editor || !canSubmit) return;
                const href = normalizeUrl(value);
                editor.chain().focus().setLink({ href }).run();
                close();
              }}
            >
              Save
            </Button>

            <Button type="button" variant="secondary" size="sm" onClick={() => close()}>
              Cancel
            </Button>
          </div>

          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!editor || !currentHref}
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().unsetLink().run();
              close();
            }}
          >
            Remove
          </Button>
        </div>

        {currentHref && (
          <div className="mt-2 truncate text-[11px] text-gray-500">Current: {currentHref}</div>
        )}
      </div>
    </Popover>
  );
}