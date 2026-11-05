import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/tv/parts";
import { PLACEMENT_POINTS, placeLabel, POINTS_PER_CORRECT } from "@/lib/game";
import { db, leaderboardConfigured, type LeaderboardRow } from "@/lib/server/db";

export const metadata: Metadata = { title: "Season leaderboard · Marquee Night" };

export default async function LeaderboardPage() {
  // Render per request: the database keys may only exist at runtime.
  await connection();
  return (
    <main className="bg-board-glow min-h-screen px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="Marquee Night home">
            <Wordmark size={48} />
          </Link>
        </header>

        <div>
          <div className="font-mono text-xs tracking-[0.2em] text-gold">SEASON STANDINGS</div>
          <h1 className="mt-1 font-display text-5xl font-black uppercase tracking-[0.04em]">Power rankings</h1>
          <p className="mt-3 max-w-2xl text-text-muted">
            Teams are shuffled every night, so points belong to people (by the name they type). Everyone on a team earns
            its placement points (
            {PLACEMENT_POINTS.map((p, i) => `${placeLabel(i + 1)} ${p}`).join(" · ")}) plus {POINTS_PER_CORRECT} per
            correct answer the team made.
          </p>
        </div>

        {leaderboardConfigured ? (
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-panel/60" />}>
            <Standings />
          </Suspense>
        ) : (
          <div className="rounded-2xl border-2 border-gold/40 bg-panel px-6 py-5 text-gold">
            The season leaderboard isn&apos;t set up on this server yet. It needs <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            and the migration in <code>supabase/migrations</code> (see the README).
          </div>
        )}
      </div>
    </main>
  );
}

async function Standings() {
  const [board, nights] = await Promise.all([
    db().from("leaderboard").select("*").order("points", { ascending: false }).order("wins", { ascending: false }).order("correct", { ascending: false }).limit(200),
    db()
      .from("nights")
      .select("id, title, finalized_at, night_players(place, team_name, points, players(name))")
      .not("finalized_at", "is", null)
      .order("finalized_at", { ascending: false })
      .limit(5),
  ]);

  if (board.error || nights.error) {
    console.error("Leaderboard query failed", board.error ?? nights.error);
    return <p className="text-wrong-soft">Couldn&apos;t load the leaderboard. Has the migration been run?</p>;
  }

  const rows = (board.data ?? []) as LeaderboardRow[];
  // Equal points share a rank, like 1, 2, 2, 4.
  const ranks = rows.map((r) => 1 + rows.filter((o) => o.points > r.points).length);

  return (
    <>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-panel px-6 py-8 text-center text-text-muted ring-1 ring-panel-border">
          No ranked nights yet. Leave &ldquo;Counts on the season leaderboard&rdquo; on when you set up a game, and have
          everyone join from their phones.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-4 rounded-2xl px-4 py-3 ring-2 sm:px-5 ${ranks[i] === 1 ? "bg-gold/10 ring-gold" : "bg-panel ring-panel-border"}`}
            >
              <span className={`w-9 text-center font-display text-3xl font-black ${ranks[i] <= 3 ? "text-gold" : "text-text-dim"}`}>
                {ranks[i]}
              </span>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cat-bg font-display text-xl font-black uppercase">
                {r.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">{r.name}</div>
                <div className="font-mono text-[11px] tracking-[0.12em] text-text-dim">
                  {r.nights} NIGHT{r.nights === 1 ? "" : "S"} · {r.wins} WIN{r.wins === 1 ? "" : "S"} · {r.correct} CORRECT ·{" "}
                  {(r.points / Math.max(1, r.nights)).toFixed(1)} AVG
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-4xl font-black leading-none tabular-nums">{r.points}</div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-text-dim">PTS</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {(nights.data ?? []).length > 0 && (
        <section>
          <div className="mb-3 font-mono text-xs tracking-[0.2em] text-text-dim">RECENT NIGHTS</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(nights.data ?? []).map((n) => {
              const entries = (n.night_players ?? []) as unknown as { place: number | null; team_name: string | null; players: { name: string } | null }[];
              const winners = entries.filter((e) => e.place === 1);
              const team = winners[0]?.team_name;
              return (
                <div key={n.id} className="rounded-xl bg-panel px-4 py-3 ring-1 ring-panel-border">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{n.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-text-dim">
                      {new Date(n.finalized_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-text-muted">
                    {team ? (
                      <>
                        🏆 <span className="text-text">{team}</span>
                        {winners.length > 0 && ` · ${winners.map((w) => w.players?.name).filter(Boolean).join(", ")}`}
                      </>
                    ) : (
                      "No ranked players"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
