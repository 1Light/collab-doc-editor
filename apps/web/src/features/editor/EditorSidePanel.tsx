import { AISuggestionPanel } from "../ai/AISuggestionPanel";
import { CommentsPanel } from "../comments/CommentsPanel";
import type { Comment } from "../comments/api";
import { VersionHistoryPanel } from "../../components/layout/VersionHistoryPanel";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

import type { DocumentRole, SidePanel } from "./editorUtils";
import type { AIOperation } from "../ai/api";

type Props = {
  sidePanel: SidePanel;
  documentId: string;
  selection: { start: number; end: number; text: string; pmFrom: number; pmTo: number };
  pendingCommentAnchor: {
    start: number;
    end: number;
    text: string;
    pmFrom?: number;
    pmTo?: number;
  } | null;
  role: DocumentRole | null;
  meId: string;
  onClose: () => void;
  onJumpToAnchor: (anchor: { start: number; end: number }) => void;
  isAnchorValid: (comment: Comment) => boolean;
  onCommentsChanged: () => Promise<void> | void;
  onVersionReverted: () => Promise<void> | void;
  onVersionDeleted: () => Promise<void> | void;
  onAIApplied: (result: {
    versionHeadId: string;
    updatedAt: string;
    finalText: string;
    applyMode: "replace" | "insert_below";
    operation: AIOperation;
    targetSelection: {
      start: number;
      end: number;
      text: string;
      pmFrom: number;
      pmTo: number;
    };
  }) => Promise<void> | void;
};

export function EditorSidePanel(props: Props) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">
          {props.sidePanel === "ai"
            ? "AI"
            : props.sidePanel === "comments"
              ? "Comments"
              : "Version History"}
        </div>

        <Button variant="secondary" size="sm" onClick={props.onClose}>
          Close
        </Button>
      </div>

      {props.sidePanel === "ai" ? (
        <AISuggestionPanel
          documentId={props.documentId}
          selection={props.selection}
          onApplied={props.onAIApplied}
        />
      ) : props.sidePanel === "comments" ? (
        <CommentsPanel
          documentId={props.documentId}
          selection={props.pendingCommentAnchor ?? props.selection}
          role={props.role}
          meId={props.meId}
          onJumpToAnchor={props.onJumpToAnchor}
          isAnchorValid={props.isAnchorValid}
          autoFocus={Boolean(props.pendingCommentAnchor)}
          onChanged={props.onCommentsChanged}
        />
      ) : (
        <VersionHistoryPanel
          documentId={props.documentId}
          role={props.role}
          onReverted={props.onVersionReverted}
          onDeleted={props.onVersionDeleted}
        />
      )}
    </Card>
  );
}