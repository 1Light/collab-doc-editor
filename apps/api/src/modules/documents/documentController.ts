// apps/api/src/modules/documents/documentController.ts

import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { ERROR_CODES } from "@repo/contracts";
import type { DocumentRole } from "@repo/contracts";
import { prisma } from "../../lib/prisma";
import { getDocumentLinkToken } from "../../lib/documentLinkAccess";
import { documentService } from "./documentService";
import { exportService } from "./exportService";
import { permissionService } from "../permissions/permissionService";
import { realtimeNotifyService } from "../../integrations/realtimeNotifyService";
import { auditLogService } from "../audit/auditLogService";

function isEmailLike(v: string) {
  return v.includes("@");
}

function assertSharableRole(role: DocumentRole) {
  if (role === "Owner") {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Owner role cannot be granted via sharing",
    };
  }
}

function assertPrincipalType(value: unknown): asserts value is "user" | "link" {
  if (value !== "user" && value !== "link") {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message: "targetType/principalType must be 'user' or 'link'",
    };
  }
}

function canEditRole(role: DocumentRole | null | undefined) {
  return role === "Owner" || role === "Editor";
}

function canExportRole(role: DocumentRole | null | undefined) {
  return role === "Owner" || role === "Editor";
}

function makeLinkToken() {
  return crypto.randomBytes(18).toString("hex");
}

function setNoStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

export const documentController = {
  /**
   * POST /documents
   * Auth required.
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      if (!req.authUser.orgId) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "No org selected" };
      }

      const { title } = req.body;

      const doc = await documentService.createDocument({
        title,
        ownerId: req.authUser.id,
        orgId: req.authUser.orgId,
      });

      return res.status(201).json({
        id: doc.id,
        title: doc.title,
        ownerId: doc.ownerId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /documents/:id
   * Requires document access (Viewer+).
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: req.authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No access to this document" };
      }

      const doc = await documentService.getDocument(documentId);

      setNoStore(res);

      return res.json({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        versionHeadId: doc.headVersionId,
        updatedAt: doc.updatedAt.toISOString(),
        role,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * PUT /documents/:id
   * Requires Editor/Owner.
   *
   * Role is resolved at request-time, so downgrades take effect immediately.
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const { content } = req.body as { content?: unknown };

      if (typeof content !== "string") {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "content must be a string",
        };
      }

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: req.authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No access to this document" };
      }

      if (!canEditRole(role)) {
        return res.status(403).json({
          code: ERROR_CODES.FORBIDDEN,
          message: "Read-only: you cannot edit this document",
          role,
        });
      }

      const { document, version } = await documentService.updateDocument({
        documentId,
        content,
        authorId: req.authUser.id,
        reason: "manual_save",
      });

      return res.json({
        id: document.id,
        updatedAt: document.updatedAt.toISOString(),
        versionHeadId: version.id,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /documents/:id
   * Requires Owner.
   */
  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      if (!req.authUser.orgId) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "No org selected" };
      }

      const documentId = req.params.id;

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: req.authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (role !== "Owner") {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can delete document" };
      }

      const result = await documentService.softDeleteDocument({
        documentId,
        userId: req.authUser.id,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /documents
   * List documents accessible to the user.
   */
  async listMine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      if (!req.authUser.orgId) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "No org selected" };
      }

      const docs = await documentService.listMyDocuments(req.authUser.id, req.authUser.orgId);

      const roles = await Promise.all(
        docs.map(async (d) => {
          const role = await permissionService.resolveEffectiveRole({
            documentId: d.id,
            userId: req.authUser!.id,
            linkToken: getDocumentLinkToken(req),
          });
          return [d.id, role] as const;
        })
      );
      const roleMap = new Map(roles);

      setNoStore(res);

      return res.json(
        docs.map((d) => ({
          id: d.id,
          title: d.title,
          ownerId: d.ownerId,
          updatedAt: d.updatedAt.toISOString(),
          role: roleMap.get(d.id) ?? null,
        }))
      );
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /documents/:id/export
   * Requires Editor/Owner.
   */
  async export(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const { format } = req.body as { format: "pdf" | "docx" };

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: req.authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No access to this document" };
      }

      if (!canExportRole(role)) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Only Editors and Owners can export this document",
        };
      }

      const result = await exportService.exportDocument({
        documentId,
        format,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /documents/:id/share
   */
  async share(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const body = req.body as
        | { targetType?: "user" | "link"; targetId?: string; role?: DocumentRole }
        | undefined;

      if (!body) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "Request body is required",
        };
      }

      if (!body.role) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "role is required",
        };
      }

      assertPrincipalType(body.targetType);
      assertSharableRole(body.role);

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, orgId: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can share this document" };
      }

      if (body.targetType === "user") {
        const rawTarget = (body.targetId ?? "").trim();
        if (!rawTarget) {
          throw { code: ERROR_CODES.INVALID_REQUEST, message: "targetId required" };
        }

        const targetUser = isEmailLike(rawTarget)
          ? await prisma.user.findUnique({
              where: { email: rawTarget.toLowerCase() },
              select: { id: true, email: true, name: true },
            })
          : await prisma.user.findUnique({
              where: { id: rawTarget },
              select: { id: true, email: true, name: true },
            });

        if (!targetUser) {
          throw { code: ERROR_CODES.NOT_FOUND, message: "Target user not found" };
        }

        const membership = await prisma.organizationMember.findUnique({
          where: { orgId_userId: { orgId: doc.orgId, userId: targetUser.id } },
          select: { id: true },
        });

        if (!membership) {
          throw {
            code: ERROR_CODES.FORBIDDEN,
            message: "User must be a member of the organization to access this document",
          };
        }

        const existing = await prisma.documentPermission.findUnique({
          where: {
            documentId_principalType_principalId: {
              documentId,
              principalType: "user",
              principalId: targetUser.id,
            },
          },
          select: { role: true },
        });

        const permission = await prisma.documentPermission.upsert({
          where: {
            documentId_principalType_principalId: {
              documentId,
              principalType: "user",
              principalId: targetUser.id,
            },
          },
          update: {
            role: body.role,
            grantedById: req.authUser.id,
          } as any,
          create: {
            documentId,
            principalType: "user",
            principalId: targetUser.id,
            role: body.role,
            grantedById: req.authUser.id,
          } as any,
          select: { id: true },
        });

        await auditLogService.logAction({
          userId: req.authUser.id,
          orgId: doc.orgId,
          actionType: "PERMISSION_GRANTED",
          documentId,
          metadata: {
            principalType: "user",
            principalId: targetUser.id,
            role: body.role,
            previousRole: existing?.role ?? null,
            isRoleChange: Boolean(existing),
          },
        });

        await realtimeNotifyService.documentRoleUpdated({
          documentId,
          userId: targetUser.id,
          role: body.role,
        });

        return res.status(201).json({ shareId: permission.id });
      }

      const linkToken = makeLinkToken();

      const permission = await prisma.documentPermission.upsert({
        where: {
          documentId_principalType_principalId: {
            documentId,
            principalType: "link",
            principalId: linkToken,
          },
        },
        update: {
          role: body.role,
          grantedById: req.authUser.id,
        } as any,
        create: {
          documentId,
          principalType: "link",
          principalId: linkToken,
          role: body.role,
          grantedById: req.authUser.id,
        } as any,
        select: { id: true },
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId: doc.orgId,
        actionType: "PERMISSION_GRANTED",
        documentId,
        metadata: {
          principalType: "link",
          principalId: linkToken,
          role: body.role,
        },
      });

      return res.status(201).json({ shareId: permission.id, linkToken });
    } catch (err) {
      return next(err);
    }
  },

  async listPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, orgId: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can view permissions" };
      }

      const perms = await prisma.documentPermission.findMany({
        where: { documentId },
        orderBy: { createdAt: "desc" },
        select: {
          principalType: true,
          principalId: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          grantedById: true,
        },
      });

      const userIds = new Set<string>();
      userIds.add(doc.ownerId);

      for (const p of perms) {
        if (p.principalType === "user") userIds.add(p.principalId);
        if (p.grantedById) userIds.add(p.grantedById);
      }

      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, name: true, email: true },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));

      const ownerUser = userMap.get(doc.ownerId);
      const out: any[] = [
        {
          principalType: "user" as const,
          principalId: doc.ownerId,
          role: "Owner" as const,
          user: ownerUser
            ? { id: ownerUser.id, name: ownerUser.name, email: ownerUser.email }
            : { id: doc.ownerId, name: "Owner", email: "" },
          createdAt: null,
          updatedAt: null,
          grantedBy: null,
        },
      ];

      for (const p of perms) {
        if (p.principalType === "user") {
          const u = userMap.get(p.principalId);
          out.push({
            principalType: "user",
            principalId: p.principalId,
            role: p.role,
            user: u ? { id: u.id, name: u.name, email: u.email } : null,
            createdAt: p.createdAt?.toISOString?.() ?? null,
            updatedAt: p.updatedAt?.toISOString?.() ?? null,
            grantedBy: p.grantedById
              ? (() => {
                  const g = userMap.get(p.grantedById);
                  return g ? { id: g.id, name: g.name, email: g.email } : { id: p.grantedById };
                })()
              : null,
          });
        } else {
          out.push({
            principalType: "link",
            principalId: p.principalId,
            role: p.role,
            user: null,
            createdAt: p.createdAt?.toISOString?.() ?? null,
            updatedAt: p.updatedAt?.toISOString?.() ?? null,
            grantedBy: p.grantedById
              ? (() => {
                  const g = userMap.get(p.grantedById);
                  return g ? { id: g.id, name: g.name, email: g.email } : { id: p.grantedById };
                })()
              : null,
          });
        }
      }

      return res.json(out);
    } catch (err) {
      return next(err);
    }
  },

  async updatePermission(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const { principalType, principalId, role } = req.body as {
        principalType?: "user" | "link";
        principalId?: string;
        role?: DocumentRole;
      };

      if (!principalType || !principalId || !role) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "principalType, principalId, role required",
        };
      }

      assertPrincipalType(principalType);
      assertSharableRole(role);

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, orgId: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can update permissions" };
      }

      if (principalType === "user") {
        if (principalId === doc.ownerId) {
          throw {
            code: ERROR_CODES.INVALID_REQUEST,
            message: "Cannot change document owner role here",
          };
        }

        const membership = await prisma.organizationMember.findUnique({
          where: { orgId_userId: { orgId: doc.orgId, userId: principalId } },
          select: { id: true },
        });

        if (!membership) {
          throw {
            code: ERROR_CODES.FORBIDDEN,
            message: "User must be a member of the organization to keep access",
          };
        }
      }

      const existing = await prisma.documentPermission.findUnique({
        where: {
          documentId_principalType_principalId: {
            documentId,
            principalType,
            principalId,
          },
        },
        select: { role: true },
      });

      const updated = await prisma.documentPermission.upsert({
        where: {
          documentId_principalType_principalId: {
            documentId,
            principalType,
            principalId,
          },
        },
        update: {
          role,
          grantedById: req.authUser.id,
        } as any,
        create: {
          documentId,
          principalType,
          principalId,
          role,
          grantedById: req.authUser.id,
        } as any,
        select: { id: true },
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId: doc.orgId,
        actionType: "PERMISSION_GRANTED",
        documentId,
        metadata: {
          principalType,
          principalId,
          role,
          previousRole: existing?.role ?? null,
          isRoleChange: Boolean(existing),
        },
      });

      if (principalType === "user") {
        await realtimeNotifyService.documentRoleUpdated({
          documentId,
          userId: principalId,
          role,
        });
      } else {
        await realtimeNotifyService.documentAccessRulesChanged({
          documentId,
        });
      }

      return res.json({ updated: true, id: updated.id });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /documents/:id/permissions
   * Body: { principalType, principalId }
   */
  async deletePermission(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const { principalType, principalId } = req.body as {
        principalType?: "user" | "link";
        principalId?: string;
      };

      if (!principalType || !principalId) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "principalType and principalId required",
        };
      }

      assertPrincipalType(principalType);

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, orgId: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can revoke permissions" };
      }

      if (principalType === "user" && principalId === doc.ownerId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Cannot revoke the document owner" };
      }

      const existing = await prisma.documentPermission.findUnique({
        where: {
          documentId_principalType_principalId: {
            documentId,
            principalType,
            principalId,
          },
        },
        select: { role: true },
      });

      const { deleted } = await prisma.$transaction(async (tx) => {
        const del = await tx.documentPermission.deleteMany({
          where: { documentId, principalType, principalId },
        });

        if (principalType === "user" && del.count > 0) {
          const u = await tx.user.findUnique({
            where: { id: principalId },
            select: { email: true },
          });

          const email = (u?.email ?? "").trim().toLowerCase();

          if (email) {
            await tx.documentInvite.updateMany({
              where: {
                documentId,
                email,
                status: { in: ["pending", "accepted"] },
              },
              data: { status: "revoked" },
            });
          }
        }

        return { deleted: del.count > 0 };
      });

      if (deleted) {
        await auditLogService.logAction({
          userId: req.authUser.id,
          orgId: doc.orgId,
          actionType: "PERMISSION_REVOKED",
          documentId,
          metadata: {
            principalType,
            principalId,
            previousRole: existing?.role ?? null,
          },
        });
      }

      if (principalType === "user" && deleted) {
        await realtimeNotifyService.documentRoleUpdated({
          documentId,
          userId: principalId,
          role: "Viewer",
        });
      } else if (principalType === "link" && deleted) {
        await realtimeNotifyService.documentAccessRulesChanged({
          documentId,
        });
      }

      return res.json({ deleted });
    } catch (err) {
      return next(err);
    }
  },
};
