import { useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { getMyRole } from "../documents/api";
import { connectSocket } from "../realtime/socket";
import { attachReconnectBehavior } from "../realtime/reconnect";
import {
  createPresenceClient,
  type PresenceBatchPayload,
  type PresenceRosterPayload,
} from "../realtime/presenceClient";
import { createCursorClient, type CursorBatchPayload } from "../realtime/cursorClient";
import { getCollaborationColor } from "../presence/colorPalette";

import { EditorStateManager } from "./EditorStateManager";
import {
  canEdit,
  type CommentChangedEvent,
  type DocumentRole,
  type PresenceUser,
} from "./editorUtils";

type Args = {
  documentId: string;
  me: { id: string; name: string };
  editorRef: React.MutableRefObject<TiptapEditor | null>;
  selectionRef: React.MutableRefObject<{ start: number; end: number }>;
  isConnectedRef: React.MutableRefObject<boolean>;
  loadingRef: React.MutableRefObject<boolean>;
  setDocRole: React.Dispatch<React.SetStateAction<DocumentRole | null>>;
  setBanner: React.Dispatch<React.SetStateAction<string | null>>;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  scheduleRefreshCommentSummary: (opts?: { maybeAutoOpen?: boolean }) => void;
};

export function useCollabEditorSession({
  documentId,
  me,
  editorRef,
  selectionRef,
  isConnectedRef,
  loadingRef,
  setDocRole,
  setBanner,
  setIsConnected,
  scheduleRefreshCommentSummary,
}: Args) {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [, setCursorUpdates] = useState<CursorBatchPayload | null>(null);
  const [collabExtensions, setCollabExtensions] = useState<any[] | null>(null);

  const managerRef = useRef<EditorStateManager | null>(null);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const presenceRef = useRef<ReturnType<typeof createPresenceClient> | null>(null);
  const cursorRef = useRef<ReturnType<typeof createCursorClient> | null>(null);
  const detachReconnectRef = useRef<null | (() => void)>(null);
  const selectionTimerRef = useRef<number | null>(null);

  const canSeedRef = useRef(false);
  const initialSyncDoneRef = useRef(false);

  const roleRefreshInFlightRef = useRef(false);
  const roleRefreshQueuedRef = useRef(false);

  const refreshRoleNow = async (docId: string) => {
    if (roleRefreshInFlightRef.current) {
      roleRefreshQueuedRef.current = true;
      return;
    }

    roleRefreshInFlightRef.current = true;

    try {
      const freshRole = (await getMyRole(docId)) as DocumentRole | null;
      setDocRole(freshRole ?? null);

      const editable = canEdit(freshRole ?? null) && isConnectedRef.current && !loadingRef.current;

      managerRef.current?.setReadOnlyState(!canEdit(freshRole ?? null));
      editorRef.current?.setEditable(editable);
    } catch {
      setDocRole(null);
      managerRef.current?.setReadOnlyState(true);
      editorRef.current?.setEditable(false);
    } finally {
      roleRefreshInFlightRef.current = false;

      if (roleRefreshQueuedRef.current) {
        roleRefreshQueuedRef.current = false;
        void refreshRoleNow(docId);
      }
    }
  };

  useEffect(() => {
    setPresenceUsers([]);
    setCollabExtensions(null);

    canSeedRef.current = false;
    initialSyncDoneRef.current = false;

    if (!socketRef.current) socketRef.current = connectSocket();
    const s = socketRef.current;

    const onSeedLeader = (payload: { documentId: string }) => {
      if (payload?.documentId !== documentId) return;
      canSeedRef.current = true;
    };

    const onSyncStep2 = (payload: { documentId: string; update: number[] }) => {
      if (payload?.documentId !== documentId) return;
      initialSyncDoneRef.current = true;
    };

    const onRoleUpdated = async (payload: { documentId: string; userId: string }) => {
      if (payload?.documentId !== documentId) return;
      if (payload?.userId !== me.id) return;
      await refreshRoleNow(payload.documentId);
    };

    const onCommentChanged = (payload: CommentChangedEvent) => {
      if (payload?.documentId !== documentId) return;
      scheduleRefreshCommentSummary();
    };

    const onSocketConnect = () => {
      if (documentId) void refreshRoleNow(documentId);
      scheduleRefreshCommentSummary();
    };

    s.on("yjs:seed_leader", onSeedLeader);
    s.on("yjs:sync_step2", onSyncStep2);
    s.on("document:role_updated", onRoleUpdated);
    s.on("document:comment_changed", onCommentChanged);
    s.on("connect", onSocketConnect);

    detachReconnectRef.current = attachReconnectBehavior(s, {
      onDisconnected: () => {
        setIsConnected(false);
        setBanner("Disconnected: editor is read-only until reconnect");
        managerRef.current?.setReadOnlyState(true);
      },
      onReconnected: () => {
        initialSyncDoneRef.current = false;
        setIsConnected(true);
        setBanner(null);
        if (documentId) void refreshRoleNow(documentId);
        scheduleRefreshCommentSummary();
      },
    });

    presenceRef.current = createPresenceClient(s, {
      onRoster: (payload: PresenceRosterPayload) => {
        if (payload.documentId !== documentId) return;

        const roster = Array.isArray(payload.users) ? payload.users : [];
        const liveRoster = roster.filter((u) => u.userId && u.userId !== "");

        const myStableColor = getCollaborationColor(me.id, me.name);
        managerRef.current?.setUserColor(myStableColor);

        setPresenceUsers(
          liveRoster.map((u) => ({
            userId: u.userId,
            name: u.name ?? undefined,
            color: getCollaborationColor(u.userId, u.name ?? undefined),
            status: "active",
          }))
        );
      },

      onBatch: (payload: PresenceBatchPayload) => {
        if (payload.documentId !== documentId) return;

        setPresenceUsers((prev) => {
          const map = new Map(prev.map((u) => [u.userId, u]));

          for (const upd of payload.updates ?? []) {
            const existing = map.get(upd.userId) ?? {
              userId: upd.userId,
            };

            const next: PresenceUser = {
              ...existing,
              color: getCollaborationColor(upd.userId, existing.name),
              status: upd.state.status ?? existing.status ?? "active",
            };

            if (next.status === "offline") map.delete(upd.userId);
            else map.set(upd.userId, next);
          }

          return Array.from(map.values());
        });
      },
    });

    cursorRef.current = createCursorClient(s, {
      onBatch: (payload: CursorBatchPayload) => {
        if (payload.documentId !== documentId) return;
        setCursorUpdates(payload);
      },
    });

    if (!managerRef.current) {
      managerRef.current = new EditorStateManager(s, { id: me.id, name: me.name });
    }

    const mgr = managerRef.current;
    setCollabExtensions(mgr.getExtensions());

    presenceRef.current.join(documentId);
    mgr.start(documentId);

    selectionTimerRef.current = window.setInterval(() => {
      const cur = selectionRef.current;
      cursorRef.current?.send(documentId, { start: cur.start, end: cur.end });
    }, 140);

    return () => {
      s.off("yjs:seed_leader", onSeedLeader);
      s.off("yjs:sync_step2", onSyncStep2);
      s.off("document:role_updated", onRoleUpdated);
      s.off("document:comment_changed", onCommentChanged);
      s.off("connect", onSocketConnect);

      if (selectionTimerRef.current) {
        window.clearInterval(selectionTimerRef.current);
      }
      selectionTimerRef.current = null;

      managerRef.current?.stop();

      presenceRef.current?.leave(documentId);
      presenceRef.current?.dispose();
      presenceRef.current = null;

      cursorRef.current?.dispose();
      cursorRef.current = null;

      detachReconnectRef.current?.();
      detachReconnectRef.current = null;
    };
  }, [
    documentId,
    me.id,
    me.name,
    selectionRef,
    setBanner,
    setDocRole,
    setIsConnected,
    scheduleRefreshCommentSummary,
  ]);

  return {
    presenceUsers,
    collabExtensions,
    managerRef,
    canSeedRef,
    initialSyncDoneRef,
    refreshRoleNow,
  };
}