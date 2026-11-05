"use client";

import type { GameState } from "@/lib/game";

/** What the TV sends when a ranked night ends. The server works out the points. */
export interface ResultsPayload {
  token: string;
  teams: { name: string; score: number; correct: number; players: string[] }[];
}

export function resultsPayload(state: GameState, token: string): ResultsPayload {
  return {
    token,
    teams: state.teams.map((t) => ({
      name: t.name,
      score: t.score,
      correct: t.correct ?? 0,
      players: (state.players ?? []).filter((p) => p.teamId === t.id).map((p) => p.name),
    })),
  };
}

/** Whether this server can record season nights. */
export async function leaderboardEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/nights");
    return res.ok && (await res.json()).enabled === true;
  } catch {
    return false;
  }
}

/** Opens a season night for this game. The token stays on this screen; results need it. */
export async function createNight(
  title: string,
  roomCode: string,
): Promise<{ id: string; token: string } | { error: string }> {
  try {
    const res = await fetch("/api/nights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, roomCode }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error ?? "The leaderboard isn't available right now." };
    return { id: body.id, token: body.token };
  } catch {
    return { error: "The leaderboard isn't reachable." };
  }
}

export async function submitResults(nightId: string, token: string, state: GameState): Promise<string | null> {
  try {
    const res = await fetch(`/api/nights/${encodeURIComponent(nightId)}/results`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(resultsPayload(state, token)),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? `Saving failed (${res.status}).`;
  } catch {
    return "Couldn't reach the leaderboard.";
  }
}
