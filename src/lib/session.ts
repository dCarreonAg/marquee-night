"use client";

import { del, get, set } from "idb-keyval";
import type { GameState } from "@/lib/game";

/**
 * The game in progress on this screen. Kept in IndexedDB (not localStorage) so
 * games with embedded images/audio fit, and a refreshed TV resumes where it was.
 */
export interface Session {
  roomCode: string;
  state: GameState;
  /** Sound is muted from the host remote; kept here so it survives a refresh. */
  muted?: boolean;
  /** Season night on the leaderboard (null/absent = an unranked game). */
  nightId?: string | null;
  /** Secret from the server that lets this screen post the night's results. */
  nightToken?: string | null;
  /** Results for `nightId` were saved. */
  recorded?: boolean;
  updatedAt: number;
}

const KEY = "marquee-night:session";

export async function loadSession(): Promise<Session | null> {
  try {
    return (await get<Session>(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await set(KEY, session);
}

export async function clearSession(): Promise<void> {
  await del(KEY);
}

/** Letters and digits that can't be confused when read off a TV (no 0/O, 1/I/L). */
const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode(length = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
}
