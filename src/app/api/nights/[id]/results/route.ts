import { NextResponse } from "next/server";
import { finishPlaces, MAX_TEAMS, rankingPoints } from "@/lib/game";
import { jsonError, nameKey, requireLeaderboard, tokenMatches, UUID } from "@/lib/server/api";
import { db } from "@/lib/server/db";

interface TeamResult {
  name: string;
  score: number;
  correct: number;
  players: string[];
}

function parseBody(body: unknown): { token: string; teams: TeamResult[] } | null {
  const b = body as { token?: unknown; teams?: unknown } | null;
  if (typeof b?.token !== "string" || !Array.isArray(b.teams) || b.teams.length < 1 || b.teams.length > MAX_TEAMS) {
    return null;
  }
  const teams: TeamResult[] = [];
  for (const t of b.teams) {
    if (
      typeof t?.name !== "string" ||
      !Number.isInteger(t.score) ||
      !Number.isInteger(t.correct) ||
      t.correct < 0 ||
      !Array.isArray(t.players) ||
      t.players.length > 50 ||
      !t.players.every((p: unknown) => typeof p === "string" && p.trim() !== "")
    ) {
      return null;
    }
    teams.push({
      name: t.name.slice(0, 40),
      score: t.score,
      correct: t.correct,
      players: t.players.map((p: string) => p.trim().replace(/\s+/g, " ").slice(0, 24)),
    });
  }
  return { token: b.token, teams };
}

/**
 * The TV that opened the night posts the final standings, with its secret
 * token. Points are worked out here. A night is scored once; later posts are
 * ignored.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = requireLeaderboard();
  if (off) return off;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(404, "No such night.");

  const body = parseBody(await request.json().catch(() => null));
  if (!body) return jsonError(400, "Those results don't look right.");

  try {
    const { data: night, error: nightError } = await db()
      .from("nights")
      .select("id, host_token_hash, finalized_at")
      .eq("id", id)
      .maybeSingle();
    if (nightError) throw nightError;
    if (!night) return jsonError(404, "No such night.");
    if (!tokenMatches(body.token, night.host_token_hash)) return jsonError(403, "Only the screen that opened this night can post its results.");
    if (night.finalized_at) return NextResponse.json({ ok: true, alreadySaved: true });

    // One entry per person, even if the same name somehow appears twice.
    const places = finishPlaces(body.teams);
    const entries = new Map<string, { name: string; team: TeamResult; place: number }>();
    body.teams.forEach((team, i) => {
      for (const name of team.players) {
        const key = nameKey(name);
        if (!entries.has(key)) entries.set(key, { name, team, place: places[i] });
      }
    });

    if (entries.size > 0) {
      const now = new Date().toISOString();
      const { data: players, error: playersError } = await db()
        .from("players")
        .upsert(
          [...entries].map(([key, e]) => ({ name: e.name, name_key: key, updated_at: now })),
          { onConflict: "name_key" },
        )
        .select("id, name_key");
      if (playersError) throw playersError;

      const rows = (players ?? []).map((p) => {
        const e = entries.get(p.name_key as string)!;
        return {
          night_id: id,
          player_id: p.id,
          team_name: e.team.name,
          place: e.place,
          team_score: e.team.score,
          correct: e.team.correct,
          points: rankingPoints(e.place, e.team.correct),
        };
      });
      const { error } = await db().from("night_players").upsert(rows, { onConflict: "night_id,player_id" });
      if (error) throw error;
    }

    const { error: finalError } = await db()
      .from("nights")
      .update({ finalized_at: new Date().toISOString() })
      .eq("id", id)
      .is("finalized_at", null);
    if (finalError) throw finalError;

    return NextResponse.json({ ok: true, scored: entries.size });
  } catch (e) {
    console.error("Saving results failed", e);
    return jsonError(500, "Couldn't save the results.");
  }
}
