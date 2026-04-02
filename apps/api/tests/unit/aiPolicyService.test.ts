import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@repo/contracts";

const mockCountSince = vi.fn();

vi.mock("../../src/modules/ai/aiJobRepo", () => ({
  aiJobRepo: {
    countSince: mockCountSince,
  },
}));

describe("aiPolicyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns the current policy", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    const policy = aiPolicyService.getPolicy();

    expect(policy).toHaveProperty("enabledRoles");
    expect(policy).toHaveProperty("quotaPolicy");
    expect(policy).toHaveProperty("updatedAt");
    expect(Array.isArray(policy.enabledRoles)).toBe(true);
  });

  it("updates policy and returns diff", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    const result = aiPolicyService.updatePolicy({
      enabledRoles: ["Owner"],
      quotaPolicy: {
        perUserPerDay: 10,
        perOrgPerDay: 100,
      },
    });

    expect(result.policy.enabledRoles).toEqual(["Owner"]);
    expect(result.policy.quotaPolicy).toEqual({
      perUserPerDay: 10,
      perOrgPerDay: 100,
    });

    expect(result.diff).toHaveProperty("enabledRoles");
    expect(result.diff).toHaveProperty("quotaPolicy");
  });

  it("rejects invalid enabled roles", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    expect(() =>
      aiPolicyService.updatePolicy({
        enabledRoles: ["Viewer"] as any,
        quotaPolicy: { perUserPerDay: 10 },
      })
    ).toThrow();
  });

  it("rejects update when no quota limit is provided", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    expect(() =>
      aiPolicyService.updatePolicy({
        enabledRoles: ["Editor", "Owner"],
        quotaPolicy: {},
      })
    ).toThrow();
  });

  it("allows AI job creation when role is enabled and quota not exceeded", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    aiPolicyService.updatePolicy({
      enabledRoles: ["Editor", "Owner"],
      quotaPolicy: { perUserPerDay: 5 },
    });

    mockCountSince.mockResolvedValue(2);

    await expect(
      aiPolicyService.enforceAtJobCreation({
        documentRole: "Editor",
        userId: "user-1",
      })
    ).resolves.toBe(true);

    expect(mockCountSince).toHaveBeenCalledTimes(1);
  });

  it("rejects AI job creation when role is disabled", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    aiPolicyService.updatePolicy({
      enabledRoles: ["Owner"],
      quotaPolicy: { perUserPerDay: 5 },
    });

    await expect(
      aiPolicyService.enforceAtJobCreation({
        documentRole: "Editor",
        userId: "user-1",
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AI_DISABLED_BY_POLICY,
    });
  });

  it("rejects AI job creation when user quota is exceeded", async () => {
    const { aiPolicyService } = await import("../../src/modules/ai/aiPolicyService");

    aiPolicyService.updatePolicy({
      enabledRoles: ["Editor", "Owner"],
      quotaPolicy: { perUserPerDay: 3 },
    });

    mockCountSince.mockResolvedValue(3);

    await expect(
      aiPolicyService.enforceAtJobCreation({
        documentRole: "Owner",
        userId: "user-1",
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AI_QUOTA_EXCEEDED,
      details: {
        limit: 3,
        used: 3,
        scope: "perUserPerDay",
      },
    });
  });
});