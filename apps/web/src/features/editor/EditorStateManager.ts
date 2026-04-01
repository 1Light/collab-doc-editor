import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import type { Socket } from "socket.io-client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";

import { getCollaborationColor } from "../presence/colorPalette";
import { tiptapExtensions, renderCollaborationCursor } from "./tiptapExtensions";

const DEBUG_EDITOR = false;

function u8ToArr(u8: Uint8Array): number[] {
  return Array.from(u8);
}

function arrToU8(arr: number[]): Uint8Array {
  return Uint8Array.from(arr);
}

type UserCursorInfo = {
  id: string;
  name: string;
  color?: string;
};

type AwarenessUpdatePayload = {
  documentId: string;
  added: number[];
  updated: number[];
  removed: number[];
  states: number[];
};

type DocumentJoinedPayload = {
  documentId: string;
};

type AwarenessChange = {
  added: number[];
  updated: number[];
  removed: number[];
};

type AwarenessListener = (...args: any[]) => void;

class AwarenessProviderBridge {
  public awareness: Awareness;
  private listeners = new Map<string, Set<AwarenessListener>>();

  constructor(awareness: Awareness) {
    this.awareness = awareness;

    this.awareness.on("update", (event: AwarenessChange, origin: unknown) => {
      this.emit("awarenessUpdate", event, origin);
      this.emit("awarenessChange", event, origin);
      this.emit("update", event, origin);
    });
  }

  on(event: string, cb: AwarenessListener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
  }

  off(event: string, cb: AwarenessListener) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(...args);
    }
  }
}

export class EditorStateManager {
  private socket: Socket;
  private user: UserCursorInfo;

  private documentId: string | null = null;

  public ydoc: Y.Doc;
  public awareness: Awareness;

  private providerBridge: AwarenessProviderBridge;

  private isBound = false;
  private destroyed = false;

  private isDocJoined = false;
  private pendingJoinDocId: string | null = null;
  private hasCompletedInitialSync = false;

  private onSyncStep2?: (payload: { documentId: string; update: number[] }) => void;
  private onRemoteDocUpdate?: (payload: { documentId: string; update: number[] }) => void;

  private onDocUpdate?: (update: Uint8Array, origin: unknown) => void;

  private onAwarenessRemote?: (payload: AwarenessUpdatePayload) => void;
  private onAwarenessLocal?: (event: AwarenessChange, origin: unknown) => void;

  private onSocketConnect?: () => void;
  private onDocumentJoined?: (payload: DocumentJoinedPayload) => void;

  constructor(socket: Socket, user: UserCursorInfo) {
    this.socket = socket;

    const resolvedColor = user.color?.trim() || getCollaborationColor(user.id, user.name);
    this.user = { ...user, color: resolvedColor };

    this.ydoc = new Y.Doc();
    this.awareness = new Awareness(this.ydoc);
    this.providerBridge = new AwarenessProviderBridge(this.awareness);

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] constructor", {
        userId: this.user.id,
        name: this.user.name,
        ydocGuid: this.ydoc.guid,
      });

    this.setLocalAwarenessUser();
    this.bindDocHandlers();
  }

  private dumpAwarenessStates() {
    return Array.from(this.awareness.getStates().entries()).map(([clientId, state]) => ({
      clientId,
      keys: state ? Object.keys(state) : [],
      user: state?.user ?? null,
      cursor: state?.cursor ?? null,
      selection: state?.selection ?? null,
      readOnly: state?.readOnly ?? null,
    }));
  }

  private setLocalAwarenessUser() {
    const prev = this.awareness.getLocalState() ?? {};

    this.awareness.setLocalState({
      ...prev,
      user: {
        id: this.user.id,
        name: this.user.name,
        color: this.user.color,
      },
    });

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] setLocalAwarenessUser", {
        documentId: this.documentId,
        userId: this.user.id,
        color: this.user.color,
        ydocGuid: this.ydoc.guid,
        states: this.dumpAwarenessStates(),
      });
  }

  updateCursor(anchor: number, head: number) {
    const nextAnchor = Number.isFinite(anchor) ? anchor : 0;
    const nextHead = Number.isFinite(head) ? head : nextAnchor;

    const prev = this.awareness.getLocalState() ?? {};

    this.awareness.setLocalState({
      ...prev,
      user: prev.user ?? {
        id: this.user.id,
        name: this.user.name,
        color: this.user.color,
      },
      cursor: {
        anchor: nextAnchor,
        head: nextHead,
      },
    });

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] updateCursor", {
        documentId: this.documentId,
        anchor: nextAnchor,
        head: nextHead,
        ydocGuid: this.ydoc.guid,
      });

    if (DEBUG_EDITOR) {
      console.log(
        "[EditorStateManager] local awareness states after updateCursor",
        this.dumpAwarenessStates()
      );
    }
  }

  clearCursor() {
    const prev = this.awareness.getLocalState() ?? {};

    this.awareness.setLocalState({
      ...prev,
      cursor: null,
    });

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] clearCursor", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
        states: this.dumpAwarenessStates(),
      });
  }

  setUserColor(color?: string) {
    const nextColor = color?.trim() || getCollaborationColor(this.user.id, this.user.name);

    if (this.user.color === nextColor) return;

    this.user = {
      ...this.user,
      color: nextColor,
    };

    const prev = this.awareness.getLocalState() ?? {};

    this.awareness.setLocalState({
      ...prev,
      user: {
        id: this.user.id,
        name: this.user.name,
        color: this.user.color,
      },
    });

    const clients = Array.from(this.awareness.getStates().keys());
    const update = encodeAwarenessUpdate(this.awareness, clients);

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] setUserColor", {
        documentId: this.documentId,
        userId: this.user.id,
        nextColor,
        clients,
        socketConnected: this.socket.connected,
        isDocJoined: this.isDocJoined,
        hasCompletedInitialSync: this.hasCompletedInitialSync,
        ydocGuid: this.ydoc.guid,
        states: this.dumpAwarenessStates(),
      });

    if (this.documentId && this.socket.connected) {
      this.socket.emit("yjs:awareness_update", {
        documentId: this.documentId,
        added: [],
        updated: clients,
        removed: [],
        states: Array.from(update),
      } satisfies AwarenessUpdatePayload);
    }
  }

  private bindDocHandlers() {
    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] bindDocHandlers", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
      });

    this.onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] ydoc local update observed", {
          documentId: this.documentId,
          updateBytes: update.length,
          origin,
          socketConnected: this.socket.connected,
          isDocJoined: this.isDocJoined,
          hasCompletedInitialSync: this.hasCompletedInitialSync,
          ydocGuid: this.ydoc.guid,
        });

      if (origin === "remote") {
        if (DEBUG_EDITOR)
          console.log("[EditorStateManager] skipped local emit: remote origin", {
            documentId: this.documentId,
            ydocGuid: this.ydoc.guid,
          });
        return;
      }

      if (!this.documentId) {
        if (DEBUG_EDITOR)
          console.log("[EditorStateManager] skipped local emit: no documentId", {
            ydocGuid: this.ydoc.guid,
          });
        return;
      }

      if (!this.socket.connected) {
        if (DEBUG_EDITOR)
          console.log("[EditorStateManager] skipped local emit: socket disconnected", {
            documentId: this.documentId,
            ydocGuid: this.ydoc.guid,
          });
        return;
      }

      if (!this.isDocJoined) {
        if (DEBUG_EDITOR)
          console.log("[EditorStateManager] skipped local emit: doc not joined", {
            documentId: this.documentId,
            ydocGuid: this.ydoc.guid,
          });
        return;
      }

      if (!this.hasCompletedInitialSync) {
        if (DEBUG_EDITOR)
          console.log("[EditorStateManager] skipped local emit: initial sync not completed", {
            documentId: this.documentId,
            ydocGuid: this.ydoc.guid,
          });
        return;
      }

      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] emitting yjs:update", {
          documentId: this.documentId,
          updateBytes: update.length,
          ydocGuid: this.ydoc.guid,
        });

      this.socket.emit("yjs:update", {
        documentId: this.documentId,
        update: u8ToArr(update),
      });
    };
    this.ydoc.on("update", this.onDocUpdate);

    this.onAwarenessLocal = (event: AwarenessChange, origin: unknown) => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] awareness local update observed", {
          documentId: this.documentId,
          origin,
          added: event.added,
          updated: event.updated,
          removed: event.removed,
          socketConnected: this.socket.connected,
          isDocJoined: this.isDocJoined,
          ydocGuid: this.ydoc.guid,
          states: this.dumpAwarenessStates(),
        });

      if (origin === "remote") return;
      if (!this.documentId) return;
      if (!this.socket.connected) return;
      if (!this.isDocJoined) return;

      const { added, updated, removed } = event;
      const update = encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]);

      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] emitting yjs:awareness_update", {
          documentId: this.documentId,
          stateBytes: update.length,
          ydocGuid: this.ydoc.guid,
        });

      this.socket.emit("yjs:awareness_update", {
        documentId: this.documentId,
        added,
        updated,
        removed,
        states: u8ToArr(update),
      } satisfies AwarenessUpdatePayload);
    };
    this.awareness.on("update", this.onAwarenessLocal);
  }

  private unbindDocHandlers() {
    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] unbindDocHandlers", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
      });

    if (this.onDocUpdate) {
      this.ydoc.off("update", this.onDocUpdate);
    }
    if (this.onAwarenessLocal) {
      this.awareness.off("update", this.onAwarenessLocal);
    }
  }

  private resetYDoc() {
    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] resetYDoc start", {
        documentId: this.documentId,
        oldYdocGuid: this.ydoc.guid,
      });

    this.unbindDocHandlers();

    try {
      this.awareness.setLocalState(null);
    } catch {
      // ignore
    }

    try {
      this.ydoc.destroy();
    } catch {
      // ignore
    }

    this.ydoc = new Y.Doc();
    this.awareness = new Awareness(this.ydoc);
    this.providerBridge = new AwarenessProviderBridge(this.awareness);

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] resetYDoc created new doc", {
        documentId: this.documentId,
        newYdocGuid: this.ydoc.guid,
      });

    this.setLocalAwarenessUser();
    this.bindDocHandlers();
  }

  getExtensions() {
    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] getExtensions", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
      });

    return [
      ...tiptapExtensions,

      Collaboration.configure({
        document: this.ydoc,
        field: "default",
      }),

      CollaborationCaret.configure({
        provider: this.providerBridge as any,
        user: {
          name: this.user.name,
          color: this.user.color ?? "#111827",
        },
        render: (user: { id?: string; name?: string; color?: string }) =>
          renderCollaborationCursor({
            userId: user.id ?? "unknown",
            name: user.name,
            color: user.color,
          }),
      }),
    ];
  }

  private requestSync() {
    if (!this.documentId) return;
    if (!this.socket.connected) return;
    if (!this.isDocJoined) return;

    const stateVector = Y.encodeStateVector(this.ydoc);

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] requestSync", {
        documentId: this.documentId,
        stateVectorBytes: stateVector.length,
        ydocGuid: this.ydoc.guid,
      });

    this.socket.emit("yjs:sync_step1", {
      documentId: this.documentId,
      stateVector: u8ToArr(stateVector),
    });
  }

  private requestJoin() {
    if (!this.documentId) return;
    if (!this.socket.connected) return;

    this.isDocJoined = false;
    this.pendingJoinDocId = this.documentId;
    this.hasCompletedInitialSync = false;

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] requestJoin", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
      });

    this.socket.emit("join_document", { documentId: this.documentId });
  }

  private bindOnce() {
    if (this.isBound) return;
    this.isBound = true;

    if (DEBUG_EDITOR) console.log("[EditorStateManager] bindOnce");

    this.onSyncStep2 = (payload) => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] received yjs:sync_step2", {
          currentDocumentId: this.documentId,
          payloadDocumentId: payload?.documentId,
          updateBytes: Array.isArray(payload?.update) ? payload.update.length : null,
          ydocGuid: this.ydoc.guid,
        });

      if (!this.documentId || payload.documentId !== this.documentId) return;
      if (!Array.isArray(payload.update)) return;

      Y.applyUpdate(this.ydoc, arrToU8(payload.update), "remote");
      this.hasCompletedInitialSync = true;

      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] initial sync completed", {
          documentId: this.documentId,
          ydocGuid: this.ydoc.guid,
        });
    };
    this.socket.on("yjs:sync_step2", this.onSyncStep2);

    this.onRemoteDocUpdate = (payload) => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] received remote yjs:update", {
          currentDocumentId: this.documentId,
          payloadDocumentId: payload?.documentId,
          updateBytes: Array.isArray(payload?.update) ? payload.update.length : null,
          ydocGuid: this.ydoc.guid,
        });

      if (!this.documentId || payload.documentId !== this.documentId) return;
      if (!Array.isArray(payload.update)) return;

      Y.applyUpdate(this.ydoc, arrToU8(payload.update), "remote");
    };
    this.socket.on("yjs:update", this.onRemoteDocUpdate);

    this.onAwarenessRemote = (payload) => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] received remote yjs:awareness_update", {
          currentDocumentId: this.documentId,
          payloadDocumentId: payload?.documentId,
          stateBytes: Array.isArray(payload?.states) ? payload.states.length : null,
          ydocGuid: this.ydoc.guid,
        });

      if (!this.documentId || payload.documentId !== this.documentId) return;
      if (!Array.isArray(payload.states)) return;

      applyAwarenessUpdate(this.awareness, arrToU8(payload.states), "remote");
      if (DEBUG_EDITOR) {
        console.log(
          "[EditorStateManager] awareness states after remote apply",
          this.dumpAwarenessStates()
        );
      }
    };
    this.socket.on("yjs:awareness_update", this.onAwarenessRemote);

    this.onDocumentJoined = (payload) => {
      const ackDocId = payload?.documentId?.trim?.() ?? payload?.documentId;

      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] received document:joined", {
          currentDocumentId: this.documentId,
          ackDocId,
          pendingJoinDocId: this.pendingJoinDocId,
          ydocGuid: this.ydoc.guid,
        });

      if (!ackDocId) return;
      if (this.pendingJoinDocId !== ackDocId) return;
      if (this.documentId !== ackDocId) return;

      this.pendingJoinDocId = null;
      this.isDocJoined = true;
      this.hasCompletedInitialSync = false;

      this.setLocalAwarenessUser();
      this.requestSync();
    };
    this.socket.on("document:joined", this.onDocumentJoined);

    this.onSocketConnect = () => {
      if (DEBUG_EDITOR)
        console.log("[EditorStateManager] socket connect handler", {
          documentId: this.documentId,
          ydocGuid: this.ydoc.guid,
        });

      if (!this.documentId) return;
      this.requestJoin();
    };
    this.socket.on("connect", this.onSocketConnect);
  }

  start(documentId: string) {
    if (this.destroyed) return;

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] start", {
        previousDocumentId: this.documentId,
        nextDocumentId: documentId,
        ydocGuid: this.ydoc.guid,
      });

    this.bindOnce();

    const switchingDocs = this.documentId !== null && this.documentId !== documentId;
    this.documentId = documentId;

    this.isDocJoined = false;
    this.pendingJoinDocId = null;
    this.hasCompletedInitialSync = false;

    if (switchingDocs) {
      this.resetYDoc();
    } else {
      this.setLocalAwarenessUser();
    }

    if (this.socket.connected) {
      this.requestJoin();
    }
  }

  stop() {
    if (!this.documentId) return;

    const docId = this.documentId;

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] stop", {
        documentId: docId,
        ydocGuid: this.ydoc.guid,
      });

    this.documentId = null;
    this.isDocJoined = false;
    this.pendingJoinDocId = null;
    this.hasCompletedInitialSync = false;

    if (this.socket.connected) {
      this.socket.emit("leave_document", { documentId: docId });
    }

    this.clearCursor();
    this.awareness.setLocalState(null);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] destroy", {
        documentId: this.documentId,
        ydocGuid: this.ydoc.guid,
      });

    this.stop();

    if (this.onSyncStep2) {
      this.socket.off("yjs:sync_step2", this.onSyncStep2);
    }
    if (this.onRemoteDocUpdate) {
      this.socket.off("yjs:update", this.onRemoteDocUpdate);
    }
    if (this.onAwarenessRemote) {
      this.socket.off("yjs:awareness_update", this.onAwarenessRemote);
    }
    if (this.onDocumentJoined) {
      this.socket.off("document:joined", this.onDocumentJoined);
    }
    if (this.onSocketConnect) {
      this.socket.off("connect", this.onSocketConnect);
    }

    this.unbindDocHandlers();

    try {
      this.ydoc.destroy();
    } catch {
      // ignore
    }
  }

  setReadOnlyState(isReadOnly: boolean) {
    if (DEBUG_EDITOR)
      console.log("[EditorStateManager] setReadOnlyState", {
        documentId: this.documentId,
        isReadOnly,
        ydocGuid: this.ydoc.guid,
      });

    const prev = this.awareness.getLocalState() ?? {};

    this.awareness.setLocalState({
      ...prev,
      readOnly: isReadOnly,
      user: prev.user ?? {
        id: this.user.id,
        name: this.user.name,
        color: this.user.color,
      },
    });
  }
}