import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { leaderboardConfigured } from "./db";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** An error response when the leaderboard database isn't set up, else null. */
export function requireLeaderboard(): NextResponse | null {
  return leaderboardConfigured ? null : jsonError(503, "The season leaderboard isn't set up on this server.");
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Same person across nights: case and spacing don't matter. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
