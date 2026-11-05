"use client";

import Link from "next/link";
import { Avatar } from "@/components/tv/Lobby";
import {
  finishPlaces,
  formatScore,
  placeLabel,
  rankingPoints,
  standings,
  STREAK_BONUS_EVERY,
  STREAK_SHOW,
  type PlayerView,
  type Team,
} from "@/lib/game";

/** A player's phone during the game: their team, what's happening, the scores. */
export function PlayerScreen({
  view,
  me,
  room,
  live,
  ranked,
  onChangeName,
}: {
  view: PlayerView;
  me: string;
  room: string;
  live: boolean;
  ranked: boolean;
  onChangeName: () => void;
}) {
  const player = view.players.find((p) => p.id === me);
  const team = view.teams.find((t) => t.id === player?.teamId);
  const mates = team ? view.players.filter((p) => p.teamId === team.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] text-text-dim">
        <span className={`h-2.5 w-2.5 rounded-full ${live ? "bg-correct-soft" : "animate-pulse bg-gold"}`} />
        ROOM {room} · {view.title}
        {ranked && <span className="ml-auto rounded-full bg-gold/15 px-2 py-0.5 text-gold">RANKED</span>}
      </div>

      {team ? (
        <div
          className="rounded-[20px] bg-panel p-5 ring-[3px]"
          style={{ boxShadow: `0 0 36px ${team.color}55`, ["--tw-ring-color" as string]: team.color }}
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">Your team</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: team.color }} />
              <span className="truncate text-[26px] font-semibold">{team.name}</span>
            </span>
            <span className={`font-display text-[44px] font-black leading-none ${team.score < 0 ? "text-wrong-soft" : ""}`}>
              {formatScore(team.score)}
            </span>
          </div>
          <Streak streak={team.streak} />
          <div className="mt-4 flex flex-wrap gap-2">
            {mates.map((p) => (
              <span
                key={p.id}
                className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[15px] font-semibold ${p.id === me ? "bg-gold/20 text-gold" : "bg-bg/70"}`}
              >
                <Avatar player={p} size={26} />
                {p.id === me ? "You" : p.name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] bg-panel p-5 text-center ring-2 ring-panel-border">
          <div className="text-[20px] font-semibold">You&apos;re in!</div>
          <div className="mt-1 text-[15px] text-text-muted">The host will put you on a team.</div>
        </div>
      )}

      <Status view={view} team={team} />

      <div className="flex flex-col gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">Scores</div>
        {standings(view.teams).map((t) => (
          <div
            key={t.id}
            className={`flex h-12 items-center gap-3 rounded-[12px] bg-panel px-4 ring-2 ${t.id === team?.id ? "ring-gold/70" : "ring-panel-border"}`}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
            {t.streak >= STREAK_SHOW && <span className="text-[13px]">🔥{t.streak}</span>}
            <span className={`font-display text-[22px] font-black ${t.score < 0 ? "text-wrong-soft" : ""}`}>{formatScore(t.score)}</span>
          </div>
        ))}
      </div>

      {!ranked && <p className="text-[13px] text-text-dim">This game doesn&apos;t count toward the season leaderboard.</p>}

      <div className="mt-2 flex justify-between text-[14px] font-semibold text-text-dim">
        <Link href="/leaderboard" className="underline">
          Season leaderboard
        </Link>
        {view.phase.kind === "lobby" && (
          <button type="button" onClick={onChangeName} className="underline">
            Change name
          </button>
        )}
      </div>
    </div>
  );
}

function Streak({ streak }: { streak: number }) {
  if (streak < STREAK_SHOW) return null;
  const toBonus = STREAK_BONUS_EVERY - (streak % STREAK_BONUS_EVERY);
  return (
    <div className="mt-3 rounded-[12px] bg-[#ff5a1f]/15 px-3 py-2 text-[15px] font-semibold text-[#ffb36b]">
      {streak >= STREAK_BONUS_EVERY ? "🔥🔥" : "🔥"} {streak} in a row
      <span className="font-normal text-text-muted"> · {toBonus === STREAK_BONUS_EVERY ? "bonus earned!" : `${toBonus} more for +100`}</span>
    </div>
  );
}

function Status({ view, team }: { view: PlayerView; team?: Team }) {
  const p = view.phase;
  const nameOf = (id?: string | null) => view.teams.find((t) => t.id === id)?.name ?? "A team";
  const ours = (id?: string | null) => !!team && id === team.id;
  let text: string;
  let hot = false;

  switch (p.kind) {
    case "lobby":
      text = "Waiting for the host to start…";
      break;
    case "board":
      hot = ours(view.turnTeamId);
      text = hot ? "Your team picks the next tile!" : `${nameOf(view.turnTeamId)} are picking`;
      break;
    case "bonusReveal":
      text = `${p.category} · ${p.value}: wager time!`;
      break;
    case "question":
      if (p.stage === "all") {
        hot = !!team;
        text = "Closest wins: agree on a number with your team!";
      } else {
        hot = ours(p.answeringId);
        text = hot
          ? p.stage === "steal"
            ? "Steal chance! No penalty."
            : "Your team is answering!"
          : `${nameOf(p.answeringId)} ${p.stage === "steal" ? "can steal" : "are answering"}`;
      }
      break;
    case "reveal":
      text = "Answer's on the TV";
      break;
    case "finalWager":
    case "finalQuestion":
    case "finalReveal":
      text = "Final round! Eyes on the TV.";
      break;
    case "winner": {
      if (!team) {
        text = "Game over!";
        break;
      }
      const ranked = standings(view.teams);
      const place = finishPlaces(ranked)[ranked.findIndex((t) => t.id === team.id)];
      hot = place === 1;
      text = `${placeLabel(place)} place · +${rankingPoints(place, team.correct ?? 0)} season points`;
      break;
    }
  }

  return (
    <div
      className={`rounded-[16px] px-4 py-4 text-center text-[18px] font-semibold ${hot ? "bg-hot text-white shadow-[0_0_24px_rgba(255,62,165,0.45)]" : "bg-panel text-text-muted ring-2 ring-panel-border"}`}
    >
      {text}
    </div>
  );
}
