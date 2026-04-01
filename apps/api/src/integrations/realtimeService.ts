// apps/api/src/integrations/realtimeService.ts
import { config } from "../config/env";

export const realtimeService = {
  async emitOrgEvent(orgId: string, event: string, payload?: any) {
    if (!config.REALTIME_INTERNAL_SECRET) return;

    try {
      await fetch(`${config.REALTIME_INTERNAL_URL}/internal/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": config.REALTIME_INTERNAL_SECRET,
        },
        body: JSON.stringify({ orgId, event, payload }),
      });
    } catch {
      // swallow errors: realtime should not break API requests
    }
  },
};