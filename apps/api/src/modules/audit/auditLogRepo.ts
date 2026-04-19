// apps/api/src/modules/audit/auditLogRepo.ts
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";

type Cursor = { createdAt: Date; id: string };

/**
 * Note: we intentionally return one extra row (limit+1) to calculate hasMore and nextCursor.
 * The service/controller should pass the cursor returned as `nextCursor` to fetch the next page.
 */
export const auditLogRepo = {
  async create(data: {
    userId: string;
    actionType: string;
    documentId?: string | null;
    orgId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        actionType: data.actionType,
        documentId: data.documentId ?? null,
        orgId: data.orgId ?? null,
        metadata: data.metadata,
      },
    });
  },

  /**
   * Query audit logs with cursor pagination and useful joins for display.
   *
   * filters:
   *  - orgId (string)
   *  - documentId (string)
   *  - userId (string)
   *  - actionTypes (string[])
   *  - from/to (Date)
   *  - q (free-text, matches user.name/email or document.title)
   *  - limit (number)
   *  - cursor (object with createdAt + id) : fetch next page after this cursor (descending order)
   */
  async query(filters?: {
    orgId?: string;
    documentId?: string;
    userId?: string;
    actionTypes?: string[];
    from?: Date;
    to?: Date;
    q?: string;
    limit?: number;
    cursor?: Cursor;
  }) {
    const limit = Math.min(filters?.limit ?? 50, 200);
    const take = limit + 1;

    const where: any = {
      ...(filters?.orgId && { orgId: filters.orgId }),
      ...(filters?.documentId && { documentId: filters.documentId }),
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.actionTypes && filters.actionTypes.length > 0 && {
        actionType: { in: filters.actionTypes },
      }),
      ...(filters?.from || filters?.to
        ? {
            createdAt: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lte: filters.to }),
            },
          }
        : {}),
    };

    if (filters?.q) {
      const q = filters.q.trim();
      if (q.length > 0) {
        where.OR = [
          { user: { name: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
          { document: { title: { contains: q, mode: "insensitive" } } },
        ];
      }
    }

    if (filters?.cursor) {
      const c = filters.cursor;
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { createdAt: { lt: c.createdAt } },
            {
              AND: [{ createdAt: c.createdAt }, { id: { lt: c.id } }],
            },
          ],
        },
      ];
    }

    const useMetadataSearch =
      filters?.q && filters.q.trim().length > 0 && prisma.$queryRaw;

    if (useMetadataSearch) {
      // We'll perform a two-step approach:
      // 1) Use Prisma findMany with the normal where (which already covers user/doc matches)
      // 2) If results are less than take and q is present, supplement with a raw query that searches metadata::text ILIKE '%q%'.
      // For simplicity and safety here we'll let the service layer perform metadata search if you need it.
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        document: {
          select: { id: true, title: true },
        },
      },
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;

    const nextCursor = hasMore
      ? {
          id: items[items.length - 1].id,
          createdAt: items[items.length - 1].createdAt,
        }
      : null;

    const normalized = items.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      userId: r.userId,
      actionType: r.actionType,
      documentId: r.documentId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      actor: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
      document: r.document ? { id: r.document.id, title: r.document.title } : null,
    }));

    return {
      items: normalized,
      nextCursor,
      hasMore,
    };
  },

  async deleteOlderThan(date: Date) {
    return prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: date },
      },
    });
  },
};