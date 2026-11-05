import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashToken, jsonError, requireLeaderboard } from "@/lib/server/api";
import { db } from "@/lib/server/db";

/** Whether this server can record nights (the setup screen asks before offering it). */
export function GET() {
  return NextResponse.json({ enabled: requireLeaderboard() === null });
}

/**
 * Opens a season night. Returns a secret token that only the TV keeps; posting
 * the night's results needs it.
 */
export async function POST(request: Request) {
  const off = requireLeaderboard();
  if (off) return off;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const roomCode = typeof body?.roomCode === "string" ? body.roomCode.trim().toUpperCase().slice(0, 8) : "";
  if (!title || !roomCode) return jsonError(400, "A night needs a title and a room code.");

  const token = randomBytes(24).toString("base64url");
  try {
    const { data, error } = await db()
      .from("nights")
      .insert({ title, room_code: roomCode, host_token_hash: hashToken(token) })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, token });
  } catch (e) {
    console.error("Opening a night failed", e);
    return jsonError(500, "Couldn't open a season night.");
  }
}
