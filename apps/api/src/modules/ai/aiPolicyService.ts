// apps/api/src/modules/ai/aiPolicyService.ts

import { ERROR_CODES } from "@repo/contracts";
import type { DocumentRole } from "@repo/contracts";
import { aiJobRepo } from "./aiJobRepo";

type QuotaPolicy = {
  perUserPerDay?: number;
  perOrgPerDay?: number;
};

type AIPolicy = {
  enabledRoles: Array<"Editor" | "Owner">;
  quotaPolicy: QuotaPolicy;
  updatedAt: Date;
};

type PolicySnapshot = {
  enabledRoles: Array<"Editor" | "Owner">;
  quotaPolicy: QuotaPolicy;
};

type PolicyDiff = {
  enabledRoles?: { from: Array<"Editor" | "Owner">; to: Array<"Editor" | "Owner"> };
  quotaPolicy?: {
    perUserPerDay?: { from?: number; to?: number };
    perOrgPerDay?: { from?: number; to?: number };
  };
};

type UpdatePolicyResult = {
  policy: {
    enabledRoles: Array<"Editor" | "Owner">;
    quotaPolicy: QuotaPolicy;
    updatedAt: string;
  };
  diff: PolicyDiff;
};

let currentPolicy: AIPolicy = {
  enabledRoles: ["Editor", "Owner"],
  quotaPolicy: { perUserPerDay: 50, perOrgPerDay: 500 },
  updatedAt: new Date(),
};

function requireEnabledRoleSubset(roles: DocumentRole[]) {
  const allowed = new Set(["Editor", "Owner"]);
  for (const r of roles) {
    if (!allowed.has(r)) {
      throw {
        code: ERROR_CODES.INVALID_REQUEST,
        message: "enabledRoles must be a subset of {Editor, Owner}",
      };
    }
  }
}

function snapshot(policy: AIPolicy): PolicySnapshot {
  return {
    enabledRoles: [...policy.enabledRoles],
    quotaPolicy: { ...policy.quotaPolicy },
  };
}

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort().join("|");
  const bs = [...b].sort().join("|");
  return as === bs;
}

function computeDiff(before: PolicySnapshot, after: PolicySnapshot): PolicyDiff {
  const diff: PolicyDiff = {};

  if (!sameStringSet(before.enabledRoles, after.enabledRoles)) {
    diff.enabledRoles = { from: before.enabledRoles, to: after.enabledRoles };
  }

  const qp: NonNullable<PolicyDiff["quotaPolicy"]> = {};
  const beforeUser = before.quotaPolicy.perUserPerDay;
  const afterUser = after.quotaPolicy.perUserPerDay;
  if (beforeUser !== afterUser) qp.perUserPerDay = { from: beforeUser, to: afterUser };

  const beforeOrg = before.quotaPolicy.perOrgPerDay;
  const afterOrg = after.quotaPolicy.perOrgPerDay;
  if (beforeOrg !== afterOrg) qp.perOrgPerDay = { from: beforeOrg, to: afterOrg };

  if (qp.perUserPerDay || qp.perOrgPerDay) diff.quotaPolicy = qp;

  return diff;
}

export const aiPolicyService = {
  getPolicy() {
    return {
      enabledRoles: currentPolicy.enabledRoles,
      quotaPolicy: currentPolicy.quotaPolicy,
      updatedAt: currentPolicy.updatedAt.toISOString(),
    };
  },

  /**
   * OrgAdmin updates policy.
   * Returns { policy, diff } so audit logs can show from -> to.
   */
  updatePolicy(params: {
    enabledRoles: DocumentRole[];
    quotaPolicy: QuotaPolicy;
  }): UpdatePolicyResult {
    requireEnabledRoleSubset(params.enabledRoles);

    if (
      params.quotaPolicy.perUserPerDay === undefined &&
      params.quotaPolicy.perOrgPerDay === undefined
    ) {
      throw {
        code: ERROR_CODES.INVALID_REQUEST,
        message: "At least one quota limit must be provided",
      };
    }

    const before = snapshot(currentPolicy);

    currentPolicy = {
      enabledRoles: params.enabledRoles as Array<"Editor" | "Owner">,
      quotaPolicy: params.quotaPolicy,
      updatedAt: new Date(),
    };

    const after = snapshot(currentPolicy);

    return {
      policy: this.getPolicy(),
      diff: computeDiff(before, after),
    };
  },

  async enforceAtJobCreation(params: { documentRole: DocumentRole; userId: string }) {
    const enabled = new Set(currentPolicy.enabledRoles);
    if (!enabled.has(params.documentRole as any)) {
      throw {
        code: ERROR_CODES.AI_DISABLED_BY_POLICY,
        message: "AI is disabled for this role by organization policy",
      };
    }

    if (currentPolicy.quotaPolicy.perUserPerDay !== undefined) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const used = await aiJobRepo.countSince(startOfDay, { userId: params.userId });

      if (used >= currentPolicy.quotaPolicy.perUserPerDay) {
        throw {
          code: ERROR_CODES.AI_QUOTA_EXCEEDED,
          message: "AI quota exceeded",
          details: {
            limit: currentPolicy.quotaPolicy.perUserPerDay,
            used,
            scope: "perUserPerDay",
          },
        };
      }
    }

    return true;
  },
};