// apps/api/src/modules/ai/aiJobRepo.ts

import { prisma } from "../../lib/prisma";
import { AIJobStatus, AIOperation } from "@prisma/client";

export const aiJobRepo = {
  async create(data: {
    documentId: string;
    userId: string;
    operation: AIOperation;
    selectionStart: number;
    selectionEnd: number;
    parameters?: unknown;
    basedOnVersionId?: string | null;
  }) {
    return prisma.aIJob.create({
      data: {
        documentId: data.documentId,
        userId: data.userId,
        operation: data.operation,
        selectionStart: data.selectionStart,
        selectionEnd: data.selectionEnd,
        // Prefer a stable JSON value over undefined
        parameters: (data.parameters ?? {}) as any,
        basedOnVersionId: data.basedOnVersionId ?? null,
        status: AIJobStatus.queued,
      },
    });
  },

  async findById(id: string) {
    return prisma.aIJob.findUnique({
      where: { id },
    });
  },

  async updateStatus(
    id: string,
    status: AIJobStatus,
    data?: { result?: string; errorMessage?: string; parameters?: unknown }
  ) {
    // Clear stale fields when transitioning between states
    // Assumes result/errorMessage are nullable columns in Prisma.
    const base: any = {
      status,
    };

    if (status === AIJobStatus.running || status === AIJobStatus.queued) {
      base.result = null;
      base.errorMessage = null;
    }

    if (status === AIJobStatus.succeeded) {
      base.result = data?.result ?? null;
      base.errorMessage = null;
    }

    if (status === AIJobStatus.failed) {
      base.result = null;
      base.errorMessage = data?.errorMessage ?? "AI job failed";
    }

    if (data?.parameters !== undefined) {
      base.parameters = data.parameters as any;
    }

    return prisma.aIJob.update({
      where: { id },
      data: base,
    });
  },

  async updateParameters(id: string, parameters: unknown) {
    return prisma.aIJob.update({
      where: { id },
      data: {
        parameters: parameters as any,
      },
    });
  },

  async listByDocument(documentId: string, limit?: number) {
    const take =
      typeof limit === "number" && limit > 0 ? Math.floor(limit) : undefined;

    return prisma.aIJob.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      include: {
        applications: {
          orderBy: { createdAt: "desc" },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      ...(typeof take === "number" ? { take } : {}),
    });
  },

  async listByUser(userId: string) {
    return prisma.aIJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async countSince(date: Date, filters?: { userId?: string }) {
    return prisma.aIJob.count({
      where: {
        createdAt: { gte: date },
        ...(filters?.userId ? { userId: filters.userId } : {}),
      },
    });
  },

  async deleteOlderThan(date: Date) {
    return prisma.aIJob.deleteMany({
      where: {
        createdAt: { lt: date },
      },
    });
  },
};
