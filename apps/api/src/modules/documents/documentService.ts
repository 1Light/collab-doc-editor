// apps/api/src/modules/documents/documentService.ts

import { ERROR_CODES } from "@repo/contracts";
import { documentRepo } from "./documentRepo";
import { versionRepo } from "../versions/versionRepo";
import { permissionRepo } from "../permissions/permissionRepo";
import { auditLogService } from "../audit/auditLogService";

export const documentService = {
  async createDocument(params: { title: string; ownerId: string; orgId: string }) {
    const doc = await documentRepo.create({
      title: params.title,
      content: "",
      ownerId: params.ownerId,
      orgId: params.orgId,
    });

    const v1 = await versionRepo.create({
      documentId: doc.id,
      parentVersionId: null,
      content: doc.content,
      authorId: params.ownerId,
      reason: "checkpoint",
    });

    await documentRepo.updateContent(doc.id, doc.content, v1.id);

    await permissionRepo.create({
      documentId: doc.id,
      principalType: "user",
      principalId: params.ownerId,
      role: "Owner",
    });

    await auditLogService.logAction({
      userId: params.ownerId,
      orgId: params.orgId,
      actionType: "DOCUMENT_CREATED",
      documentId: doc.id,
      metadata: {
        title: params.title,
        ownerId: params.ownerId,
      },
    });

    return {
      ...doc,
      headVersionId: v1.id,
    };
  },

  async getDocument(documentId: string) {
    const doc = await documentRepo.findById(documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }
    return doc;
  },

  async updateDocument(params: {
    documentId: string;
    content: string;
    authorId: string;
    reason?: string;
  }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    const newVersion = await versionRepo.create({
      documentId: doc.id,
      parentVersionId: doc.headVersionId ?? null,
      content: params.content,
      authorId: params.authorId,
      reason: params.reason ?? "manual_save",
    });

    const updated = await documentRepo.updateContent(doc.id, params.content, newVersion.id);

    await auditLogService.logAction({
      userId: params.authorId,
      orgId: doc.orgId,
      actionType: "DOCUMENT_UPDATED",
      documentId: doc.id,
      metadata: {
        title: doc.title,
        versionId: newVersion.id,
        reason: params.reason ?? "manual_save",
      },
    });

    return {
      document: updated,
      version: newVersion,
    };
  },

  async softDeleteDocument(params: { documentId: string; userId: string }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    await documentRepo.softDelete(doc.id);

    await auditLogService.logAction({
      userId: params.userId,
      orgId: doc.orgId,
      actionType: "DOCUMENT_DELETED",
      documentId: doc.id,
      metadata: {
        title: doc.title,
        softDelete: true,
      },
    });

    return { deleted: true };
  },

  async listMyDocuments(userId: string, orgId: string) {
    return documentRepo.listAccessibleDocuments(userId, orgId);
  },
};