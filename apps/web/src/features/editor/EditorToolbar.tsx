import { useEffect, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { exportDocument, type DocumentExportFormat } from "../documents/api";
import { IconButton } from "../../components/ui/IconButton";
import { Tooltip } from "../../components/ui/Tooltip";
import { DropdownMenu, type DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { InviteModal } from "../../components/layout/InviteModal";
import { ManageAccessModal } from "../../components/layout/ManageAccessModal";

type DocRole = "Viewer" | "Commenter" | "Editor" | "Owner" | null | undefined;

type Props = {
  editor: TiptapEditor | null;
  documentId: string;
  disabled?: boolean;
  role?: DocRole;
  meId?: string;
};

type BlockType = "p" | "h1" | "h2" | "h3" | "bullets" | "numbers";

function getBlockType(editor: TiptapEditor | null): BlockType {
  if (!editor) return "p";
  try {
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("bulletList")) return "bullets";
    if (editor.isActive("orderedList")) return "numbers";
    return "p";
  } catch {
    return "p";
  }
}

const BLOCK_ITEMS: DropdownMenuItem[] = [
  { id: "p", label: "Paragraph", description: "Plain text" },
  { id: "h1", label: "Heading 1", description: "Large section heading" },
  { id: "h2", label: "Heading 2", description: "Medium section heading" },
  { id: "h3", label: "Heading 3", description: "Small section heading" },
  { id: "bullets", label: "Bulleted list", description: "List with bullets" },
  { id: "numbers", label: "Numbered list", description: "List with numbers" },
];

const EXPORT_ITEMS: DropdownMenuItem[] = [
  { id: "docx", label: "Download Word", description: "Export this document as .docx" },
  { id: "pdf", label: "Download PDF", description: "Export this document as .pdf" },
];

function Divider() {
  return <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" aria-hidden="true" />;
}

function getFilenameFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    return last && last.trim().length > 0 ? last : fallback;
  } catch {
    return fallback;
  }
}

async function triggerBrowserDownload(url: string, fallbackFilename: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fallbackFilename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}

function applyBlockType(editor: TiptapEditor, value: BlockType) {
  const chain = editor.chain().focus();

  switch (value) {
    case "p":
      chain.clearNodes().setParagraph().run();
      return;

    case "h1":
      chain.clearNodes().setHeading({ level: 1 }).run();
      return;

    case "h2":
      chain.clearNodes().setHeading({ level: 2 }).run();
      return;

    case "h3":
      chain.clearNodes().setHeading({ level: 3 }).run();
      return;

    case "bullets":
      chain.toggleBulletList().run();
      return;

    case "numbers":
      chain.toggleOrderedList().run();
      return;

    default:
      chain.clearNodes().setParagraph().run();
  }
}

export function EditorToolbar({ editor, documentId, disabled, role, meId }: Props) {
  const [blockType, setBlockType] = useState<BlockType>(() => getBlockType(editor));

  const canShare = role === "Owner";
  const canExport = role === "Owner" || role === "Editor";
  const allowEdit = role === "Owner" || role === "Editor";

  const editableNow = Boolean(editor?.isEditable) && allowEdit && !disabled;
  const isDisabled = !editableNow;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const [exportBusy, setExportBusy] = useState<DocumentExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    const sync = () => setBlockType(getBlockType(editor));
    sync();

    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);

    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

  const canOpenShare = Boolean(documentId) && canShare;
  const canOpenExport = Boolean(documentId) && canExport && !exportBusy;

  async function handleExport(format: DocumentExportFormat) {
    if (!documentId || !canExport) return;

    setExportError(null);
    setExportBusy(format);

    try {
      const out = await exportDocument(documentId, format);
      const filename =
        out.filename ||
        getFilenameFromUrl(out.downloadUrl, format === "pdf" ? "document.pdf" : "document.docx");

      await triggerBrowserDownload(out.downloadUrl, filename);
    } catch (e: any) {
      setExportError(e?.message ?? `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-2">
        <DropdownMenu
          label="Block type"
          value={blockType}
          items={BLOCK_ITEMS}
          disabled={isDisabled}
          onChange={(id) => {
            if (!editor || !editableNow) return;

            const next = id as BlockType;
            applyBlockType(editor, next);
            window.requestAnimationFrame(() => {
              setBlockType(getBlockType(editor));
            });
          }}
        />
      </div>

      <Divider />

      <div className="flex items-center gap-1">
        <Tooltip content={allowEdit ? "Bold" : "Read-only"}>
          <IconButton
            label="Bold"
            active={Boolean(editor?.isActive("bold"))}
            disabled={!editableNow}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </IconButton>
        </Tooltip>

        <Tooltip content={allowEdit ? "Italic" : "Read-only"}>
          <IconButton
            label="Italic"
            active={Boolean(editor?.isActive("italic"))}
            disabled={!editableNow}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            I
          </IconButton>
        </Tooltip>

        <Tooltip content={allowEdit ? "Underline" : "Read-only"}>
          <IconButton
            label="Underline"
            active={Boolean(editor?.isActive("underline"))}
            disabled={!editableNow}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            U
          </IconButton>
        </Tooltip>

        <Tooltip content={allowEdit ? "Strikethrough" : "Read-only"}>
          <IconButton
            label="Strike"
            active={Boolean(editor?.isActive("strike"))}
            disabled={!editableNow}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            S
          </IconButton>
        </Tooltip>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        <div className="hidden md:flex items-center rounded-full bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
          Shortcuts: ⌘B, ⌘I · Type / for commands
        </div>

        {canExport && (
          <DropdownMenu
            label={exportBusy ? `Exporting ${exportBusy.toUpperCase()}...` : "Download"}
            value=""
            items={EXPORT_ITEMS}
            disabled={!canOpenExport}
            onChange={(id) => {
              const format = id as DocumentExportFormat;
              void handleExport(format);
            }}
          />
        )}

        {canShare && (
          <>
            <Tooltip content="Invite people to this document">
              <span className="inline-flex">
                <IconButton
                  label="Invite"
                  disabled={!canOpenShare}
                  onClick={() => setInviteOpen(true)}
                >
                  Invite
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip content="Manage access">
              <span className="inline-flex">
                <IconButton
                  label="Manage access"
                  disabled={!canOpenShare}
                  onClick={() => setManageOpen(true)}
                >
                  Access
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      </div>

      {exportError && (
        <div className="basis-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {exportError}
        </div>
      )}

      <InviteModal open={inviteOpen} documentId={documentId} onClose={() => setInviteOpen(false)} />

      <ManageAccessModal
        open={manageOpen}
        documentId={documentId}
        meId={meId}
        onClose={() => setManageOpen(false)}
      />
    </div>
  );
}