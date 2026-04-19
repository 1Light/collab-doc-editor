// apps/api/src/modules/versions/versionService.ts

import { ERROR_CODES } from "@repo/contracts";
import { documentRepo } from "../documents/documentRepo";
import { versionRepo } from "./versionRepo";
import { auditLogService } from "../audit/auditLogService";

type VersionReason = "checkpoint" | "manual_save" | "revert" | "ai_apply" | string;

function requireId(value: string | null | undefined, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message: `${fieldName} is required`,
    };
  }
  return trimmed;
}

export const versionService = {
  async listVersions(documentId: string, limit = 20) {
    const safeDocumentId = requireId(documentId, "documentId");

    const doc = await documentRepo.findById(safeDocumentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const versions = await versionRepo.listByDocument(safeDocumentId, {
      limit,
    });

    return versions.map((v) => ({
      ...v,
      authorName: v.author?.name ?? "Unknown",
    }));
  },

  async createSnapshot(params: {
    documentId: string;
    authorId: string;
    content: string;
    parentVersionId?: string | null;
    reason?: VersionReason;
  }) {
    const documentId = requireId(params.documentId, "documentId");
    const authorId = requireId(params.authorId, "authorId");

    const doc = await documentRepo.findById(documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const version = await versionRepo.create({
      documentId: doc.id,
      parentVersionId:
        typeof params.parentVersionId !== "undefined"
          ? params.parentVersionId
          : doc.headVersionId ?? null,
      content: params.content,
      authorId,
      reason: params.reason ?? "checkpoint",
    });

    return version;
  },

  async createCheckpoint(params: {
    documentId: string;
    authorId: string;
    reason?: VersionReason;
  }) {
    const documentId = requireId(params.documentId, "documentId");
    const authorId = requireId(params.authorId, "authorId");

    const doc = await documentRepo.findById(documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const version = await this.createSnapshot({
      documentId: doc.id,
      authorId,
      content: doc.content,
      parentVersionId: doc.headVersionId ?? null,
      reason: params.reason ?? "checkpoint",
    });

    await documentRepo.updateContent(doc.id, doc.content, version.id);

    await auditLogService.logAction({
      userId: authorId,
      orgId: doc.orgId,
      actionType: "VERSION_CHECKPOINT_CREATED",
      documentId: doc.id,
      metadata: {
        versionId: version.id,
        reason: params.reason ?? "checkpoint",
      },
    });

    return version;
  },

  async revertToVersion(params: {
    documentId: string;
    targetVersionId: string;
    userId: string;
  }) {
    const documentId = requireId(params.documentId, "documentId");
    const targetVersionId = requireId(params.targetVersionId, "targetVersionId");
    const userId = requireId(params.userId, "userId");

    const doc = await documentRepo.findById(documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const target = await versionRepo.findById(targetVersionId);
    if (!target || target.documentId !== doc.id) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Target version not found" };
    }

    const newHead = await this.createSnapshot({
      documentId: doc.id,
      authorId: userId,
      content: target.content,
      parentVersionId: doc.headVersionId ?? null,
      reason: "revert",
    });

    await documentRepo.updateContent(doc.id, target.content, newHead.id);

    await auditLogService.logAction({
      userId,
      orgId: doc.orgId,
      actionType: "VERSION_REVERTED",
      documentId: doc.id,
      metadata: {
        previousHeadVersionId: doc.headVersionId ?? null,
        targetVersionId: target.id,
        newHeadVersionId: newHead.id,
      },
    });

    return { newHeadVersionId: newHead.id };
  },

  async deleteVersion(params: {
    documentId: string;
    versionId: string;
    userId: string;
  }) {
    const documentId = requireId(params.documentId, "documentId");
    const versionId = requireId(params.versionId, "versionId");

    const doc = await documentRepo.findById(documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const version = await versionRepo.findById(versionId);

    if (!version || version.documentId !== documentId) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Version not found" };
    }

    if (doc.headVersionId === versionId) {
      throw {
        code: ERROR_CODES.FORBIDDEN,
        message: "Cannot delete the current (head) version",
      };
    }

    await versionRepo.deleteById(versionId);

    await auditLogService.logAction({
      userId: params.userId,
      orgId: doc.orgId,
      actionType: "VERSION_DELETED",
      documentId,
      metadata: { versionId },
    });

    return { deleted: true };
  },
};