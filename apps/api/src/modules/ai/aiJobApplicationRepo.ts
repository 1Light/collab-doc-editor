// apps/api/src/modules/ai/aiJobApplicationRepo.ts

import { prisma } from "../../lib/prisma";

export const aiJobApplicationRepo = {
  async create(data: {
    aiJobId: string;
    appliedById: string;
    finalText?: string | null;
    newVersionId?: string | null;
  }) {
    return prisma.aIJobApplication.create({
      data: {
        aiJobId: data.aiJobId,
        appliedById: data.appliedById,
        finalText: data.finalText ?? null,
        newVersionId: data.newVersionId ?? null,
      },
    });
  },

  async findById(id: string) {
    return prisma.aIJobApplication.findUnique({
      where: { id },
    });
  },

  async listByJob(aiJobId: string) {
    return prisma.aIJobApplication.findMany({
      where: { aiJobId },
      orderBy: { createdAt: "desc" },
    });
  },

  async deleteOlderThan(date: Date) {
    return prisma.aIJobApplication.deleteMany({
      where: {
        createdAt: { lt: date },
      },
    });
  },
};