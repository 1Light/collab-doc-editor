// apps/realtime/src/auth/verifySocketJwt.ts

import jwt from "jsonwebtoken";
import { config } from "../config/env";

export type SocketAuthUser = {
  userId: string;
  name?: string;
};

export function verifySocketJwt(token: string): SocketAuthUser {
  if (!token) {
    throw new Error("Missing JWT");
  }

  const verified = jwt.verify(token, config.JWT_SECRET);

  const payload =
    typeof verified === "string"
      ? (JSON.parse(verified) as any)
      : (verified as any);

  if (!payload?.userId) {
    throw new Error("JWT missing userId");
  }

  return {
    userId: payload.userId,
    name: payload.name, // optional, if included in JWT
  };
}