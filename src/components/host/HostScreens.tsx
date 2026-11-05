"use client";

import { useState } from "react";
import {
  CHOICE_LETTERS,
  formatDelta,
  formatScore,
  QUESTION_TYPES,
  standings,
  STREAK_BONUS_EVERY,
  STREAK_SHOW,
  type Action,
  type HostPhase,
  type HostView,
  type Player,
  type Team,
} from "@/lib/game";
import { WagerPad } from "./WagerPad";
import { AnswerCard, BigButton, Eyebrow, TeamName, TeamScores, TimerRow } from "./ui";

type Act = (a: Action) => Promise<string | null>;
type Phase<K extends HostPhase["kind"]> = Extract<HostPhase, { kind: K }>;

interface ScreenProps {
  view: HostView;
  act: Act;
  pending: boolean;
  openScores: () => void;
}

const teamOf = (view: HostView, id: string | null | undefined) => view.teams.find((t) => t.id === id);

/** First word, trimmed to fit a 6-column mini board on a phone. */
function abbreviate(name: string) {
  const word = name.trim().split(/\s+/)[0] ?? "";
  return word.length > 8 ? word.slice(0, 7) + "." : word;
}

// ---------- Lobby ----------

export function LobbyScreen({ view, act, pending }: ScreenProps) {
  const benched = view.players.filter((p) => !view.teams.some((t) => t.id === p.teamId));
  /** Tapping a player moves them to the next team (and off a team after the last). */
  const nextTeam = (p: Player): string | null => {
    const i = view.teams.findIndex((t) => t.id === p.teamId);
    return i < 0 ? (view.teams[0]?.id ?? null) : (view.teams[i + 1]?.id ?? null);
  };
  const move = (p: Player) => act({ type: "movePlayer", playerId: p.id, teamId: nextTeam(p) });
  const shuffle = () => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    act({ type: "randomizeTeams", seed });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Connected to</Eyebrow>
        <div className="mt-1 text-[22px] font-semibold">{view.title}</div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          Teams · turn order · {view.players.length} player{view.players.length === 1 ? "" : "s"}
        </Eyebrow>
        <button
          type="button"
          disabled={pending || view.players.length === 0}
          onClick={shuffle}
          className="h-11 shrink-0 rounded-[12px] bg-hot px-4 text-[14px] font-semibold text-white disabled:opacity-35"
        >
          🎲 Shuffle teams
        </button>
      </div>

      <ol className="flex flex-col gap-2">
        {view.teams.map((t, i) => {
          const members = view.players.filter((p) => p.teamId === t.id);
          return (
            <li key={t.id} className="rounded-[14px] bg-panel px-4 py-3 ring-2 ring-panel-border">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] text-text-dim">{i + 1}</span>
                <TeamName team={t} />
                <span className="ml-auto font-mono text-[12px] text-text-dim">{members.length}</span>
              </div>
              {members.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map((p) => (
                    <PlayerChip
                      key={p.id}
                      player={p}
                      disabled={pending}
                      onTap={() => move(p)}
                      onRemove={() => act({ type: "removePlayer", playerId: p.id })}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {benched.length > 0 && (
        <div>
          <Eyebrow className="mb-2">Not on a team</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {benched.map((p) => (
              <PlayerChip
                      key={p.id}
                      player={p}
                      disabled={pending}
                      onTap={() => move(p)}
                      onRemove={() => act({ type: "removePlayer", playerId: p.id })}
                    />
            ))}
          </div>
        </div>
      )}

      <p className="text-[13px] text-text-dim">
        {view.players.length === 0
          ? "Players join by scanning the QR code on the TV."
          : "Tap a name to move them to the next team, ✕ to remove them."}
      </p>

      <BigButton tone="gold" size="xl" disabled={pending} onClick={() => act({ type: "startGame" })}>
        Start game
      </BigButton>
    </div>
  );
}

function PlayerChip({
  player,
  onTap,
  onRemove,
  disabled,
}: {
  player: Player;
  onTap: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex h-9 items-center rounded-full bg-bg ring-1 ring-panel-border">
      <button
        type="button"
        disabled={disabled}
        onClick={onTap}
        className="flex h-full items-center gap-1.5 rounded-l-full pr-1 pl-3 text-[14px] font-semibold active:brightness-125"
      >
        {player.name}
        <span className="text-text-dim">›</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${player.name}`}
        className="flex h-full w-8 items-center justify-center rounded-r-full text-[12px] text-text-dim active:text-wrong-soft"
      >
        ✕
      </button>
    </span>
  );
}

// ---------- 1i Pick a tile ----------

export function PickScreen({ view, act, pending, openScores }: ScreenProps) {
  const picker = teamOf(view, view.turnTeamId);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const rows = view.categories[0]?.tiles.length ?? 5;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[16px] border-[3px] border-hot bg-panel px-4 py-3 shadow-[0_0_24px_rgba(255,62,165,0.35)]">
        <Eyebrow tone="text-hot">Picking now</Eyebrow>
        <div className="mt-0.5 text-[22px] font-semibold">
          <TeamName team={picker} /> <span className="text-text-muted">are picking</span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {view.categories.map((c, col) => (
          <div
            key={col}
            title={c.name}
            className="flex h-9 items-center justify-center overflow-hidden rounded-[6px] bg-cat-bg px-0.5 text-center font-display text-[11px] font-extrabold uppercase leading-none tracking-[0.02em] ring-1 ring-cat-border"
          >
            {abbreviate(c.name)}
          </div>
        ))}
        {Array.from({ length: rows }, (_, row) =>
          view.categories.map((c, col) => {
            const tile = c.tiles[row];
            return (
              <button
                key={`${col}-${row}`}
                type="button"
                disabled={tile.played || pending}
                aria-label={`${c.name} for ${tile.value}`}
                onClick={() => {
                  navigator.vibrate?.(12);
                  act({ type: "pickTile", col, row });
                }}
                className={
                  tile.played
                    ? "h-[52px] rounded-[8px] bg-tile-played ring-1 ring-tile-played-border"
                    : "tile-face h-[52px] font-display text-[20px] font-black text-gold active:brightness-125 disabled:opacity-60"
                }
              >
                {tile.played ? "" : tile.value}
              </button>
            );
          }),
        )}
      </div>

      <TeamScores teams={view.teams} activeId={view.turnTeamId} onTap={openScores} />

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirmFinal) act({ type: "goToFinal" });
          setConfirmFinal((c) => !c);
        }}
        className={`h-11 rounded-[12px] text-[14px] font-semibold ${confirmFinal ? "bg-wrong/20 text-wrong-soft" : "text-text-dim"}`}
      >
        {confirmFinal ? "Tap again to end the board and start the final" : "Skip to final round…"}
      </button>
    </div>
  );
}

// ---------- Bonus wager (1l) ----------

export function BonusWagerScreen({ view, act, pending, phase }: ScreenProps & { phase: Phase<"bonusReveal"> }) {
  const team = teamOf(view, phase.teamId);
  return (
    <WagerPad
      title={`Bonus · ${phase.category} · ${phase.value}`}
      teamName={team?.name ?? "Team"}
      max={phase.maxWager}
      disabled={pending}
      onLock={(amount) => act({ type: "lockBonusWager", amount })}
    />
  );
}

// ---------- 1j Question live / 1k Steal attempt ----------

export function QuestionScreen({ view, act, pending, phase }: ScreenProps & { phase: Phase<"question"> }) {
  const answering = teamOf(view, phase.answeringId);
  const isSteal = phase.stage === "steal";
  const isClosest = phase.stage === "all";
  const penalty = phase.results.find((r) => !r.steal);
  const penaltyTeam = teamOf(view, penalty?.teamId);
  const tag = QUESTION_TYPES[phase.type].tag;
  const noSteal = phase.isBonus || phase.type === "trueFalse";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow tone={phase.deepCut ? "text-wrong-soft" : "text-gold"}>
          {phase.isBonus
            ? `${phase.type === "wager" ? "Wager" : "Bonus"} · ${phase.category} · wager ${phase.stake}`
            : `${phase.category} · ${phase.value}`}
          {phase.deepCut && " · 💀 deep cut"}
        </Eyebrow>
        {isSteal && penalty && penaltyTeam && (
          <span className="shrink-0 rounded-full bg-wrong/20 px-3 py-1 font-mono text-[12px] tracking-[0.1em] text-wrong-soft">
            {penaltyTeam.name.toUpperCase()} {formatDelta(penalty.delta)}
          </span>
        )}
      </div>

      <p className="text-[18px] leading-snug">
        {(tag || phase.mediaType) && (
          <span className="mr-2 rounded bg-panel px-1.5 py-0.5 font-mono text-[11px] uppercase text-text-muted ring-1 ring-panel-border">
            {tag || phase.mediaType}
          </span>
        )}
        {phase.question}
      </p>

      {phase.options.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {phase.options.map((o, i) => {
            const right = phase.type === "multipleChoice" && o === phase.answer;
            return (
              <li
                key={i}
                className={`flex min-h-10 items-center gap-3 rounded-[10px] px-3 py-1.5 text-[15px] ring-1 ${right ? "bg-correct/20 font-semibold ring-correct" : "bg-panel ring-panel-border"}`}
              >
                <span className="font-display text-[18px] font-black text-gold">{CHOICE_LETTERS[i]}</span>
                {o}
              </li>
            );
          })}
        </ul>
      )}

      {isClosest ? (
        <div className="text-[16px] text-text-muted">
          Every team writes down a number. Closest wins {phase.value}; nobody loses points.
        </div>
      ) : isSteal ? (
        <div className="rounded-[16px] border-[3px] border-steal bg-steal/10 px-4 py-3">
          <Eyebrow tone="text-steal">Steal · risk-free</Eyebrow>
          <div className="mt-0.5 text-[20px] font-semibold">
            <TeamName team={answering} /> <span className="text-text-muted">get one try</span>
          </div>
        </div>
      ) : (
        <div className="text-[16px] text-text-muted">
          <TeamName team={answering} /> answering
          <StreakNote team={answering} />
        </div>
      )}

      <AnswerCard answer={phase.answer} lines={phase.answerLines} />

      <TimerRow
        timer={phase.timer}
        disabled={pending}
        onToggle={() => act({ type: phase.timer.running ? "timerPause" : "timerStart" })}
        onSkip={() => act({ type: "timerSkip" })}
      />

      {isClosest ? (
        <ClosestEntry teams={view.teams} target={phase.target} disabled={pending} act={act} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <BigButton tone="correct" size="xl" disabled={pending} sub={`+${phase.stake}`} onClick={() => act({ type: "correct" })}>
            Correct
          </BigButton>
          <BigButton
            tone={isSteal ? "neutral" : "wrong"}
            size="xl"
            disabled={pending}
            sub={isSteal ? "no penalty" : noSteal ? `−${phase.stake} · no steal` : `−${phase.stake}`}
            onClick={() => act({ type: "wrong" })}
          >
            Wrong
          </BigButton>
        </div>
      )}

      <BigButton disabled={pending} onClick={() => act({ type: "revealAnswer" })}>
        {isSteal || isClosest ? "Nobody got it · reveal" : "Reveal answer on TV"}
      </BigButton>
    </div>
  );
}

function StreakNote({ team }: { team?: Team }) {
  if (!team || team.streak < STREAK_SHOW - 1) return null;
  const toBonus = STREAK_BONUS_EVERY - (team.streak % STREAK_BONUS_EVERY);
  return (
    <span className="ml-2 font-semibold text-[#ffb36b]">
      🔥 {team.streak} in a row{toBonus === 1 ? " · next one +100" : ""}
    </span>
  );
}

/** Closest Wins: type each team's number, then score them all at once. */
function ClosestEntry({
  teams,
  target,
  disabled,
  act,
}: {
  teams: Team[];
  target: number | null;
  disabled?: boolean;
  act: Act;
}) {
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const parsed: Record<string, number> = {};
  for (const [id, raw] of Object.entries(guesses)) {
    const n = Number(raw.replace(/,/g, ""));
    if (raw.trim() !== "" && Number.isFinite(n)) parsed[id] = n;
  }
  const count = Object.keys(parsed).length;

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Guesses{target !== null && ` · target ${target.toLocaleString("en-US")}`}</Eyebrow>
      {teams.map((t) => (
        <label key={t.id} className="flex h-14 items-center gap-3 rounded-[12px] bg-panel px-4 ring-2 ring-panel-border">
          <span className="min-w-0 flex-1 truncate">
            <TeamName team={t} />
          </span>
          <input
            inputMode="decimal"
            value={guesses[t.id] ?? ""}
            onChange={(e) => setGuesses((g) => ({ ...g, [t.id]: e.target.value.replace(/[^0-9.,-]/g, "") }))}
            placeholder="—"
            className="h-10 w-32 rounded-[10px] bg-bg px-3 text-right font-display text-[22px] font-black outline-none ring-2 ring-panel-border focus:ring-gold"
          />
        </label>
      ))}
      <BigButton tone="gold" size="lg" disabled={disabled || count === 0} onClick={() => act({ type: "judgeClosest", guesses: parsed })}>
        Lock guesses · closest wins
      </BigButton>
    </div>
  );
}

// ---------- Answer revealed ----------

export function RevealScreen({ view, act, pending, phase }: ScreenProps & { phase: Phase<"reveal"> }) {
  const boardDone = view.categories.every((c) => c.tiles.every((t) => t.played));
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow tone="text-gold">
        {phase.category} · {phase.value} · on the TV now
      </Eyebrow>
      <AnswerCard answer={phase.answer} lines={phase.answerLines} label="Answer · revealed" />
      <div className="flex flex-col gap-2">
        {phase.results.length === 0 && <div className="text-text-muted">Nobody scored on this one.</div>}
        {phase.results.map((r, i) => (
          <div key={i} className="flex h-12 items-center justify-between rounded-[12px] bg-panel px-4 ring-2 ring-panel-border">
            <span className="flex items-center gap-2">
              <TeamName team={teamOf(view, r.teamId)} />
              {r.steal && <span className="font-mono text-[11px] tracking-[0.16em] text-steal">STEAL</span>}
              {r.guess !== undefined && <span className="font-mono text-[11px] text-text-dim">{r.guess.toLocaleString("en-US")}</span>}
              {(r.streak ?? 0) >= STREAK_SHOW && <span className="text-[12px]">🔥{r.streak}</span>}
              {!!r.streakBonus && <span className="font-mono text-[11px] text-[#ffb36b]">+{r.streakBonus} BONUS</span>}
            </span>
            <span
              className={`font-display text-[24px] font-black ${r.delta > 0 ? "text-correct-soft" : r.delta < 0 ? "text-wrong-soft" : "text-text-dim"}`}
            >
              {formatDelta(r.delta)}
            </span>
          </div>
        ))}
      </div>
      <BigButton tone="gold" size="xl" disabled={pending} onClick={() => act({ type: "continue" })}>
        {boardDone ? "Final round" : "Back to board"}
      </BigButton>
    </div>
  );
}

// ---------- Final round ----------

export function FinalWagerScreen({ view, act, pending, phase }: ScreenProps & { phase: Phase<"finalWager"> }) {
  const [wagerFor, setWagerFor] = useState<string | null>(null);
  const eligible = view.teams.filter((t) => t.id in phase.wagers);
  const sittingOut = view.teams.filter((t) => !(t.id in phase.wagers));
  const allLocked = eligible.every((t) => phase.wagers[t.id] !== null);
  const team = teamOf(view, wagerFor);

  if (team) {
    return (
      <WagerPad
        key={team.id}
        title={`Final · ${phase.category}`}
        teamName={team.name}
        max={team.score}
        initial={phase.wagers[team.id]}
        disabled={pending}
        onCancel={() => setWagerFor(null)}
        onLock={async (amount) => {
          const err = await act({ type: "lockFinalWager", teamId: team.id, amount });
          if (err) return;
          // Jump straight to the next team that still needs a wager.
          const next = eligible.find((t) => t.id !== team.id && phase.wagers[t.id] === null);
          setWagerFor(next?.id ?? null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow tone="text-gold">Final round</Eyebrow>
        <div className="mt-1 font-display text-[40px] font-black uppercase leading-none">{phase.category}</div>
        <p className="mt-2 text-[15px] text-text-muted">Collect each team&apos;s secret wager and enter it here.</p>
      </div>

      <div className="flex flex-col gap-2">
        {eligible.map((t) => {
          const w = phase.wagers[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setWagerFor(t.id)}
              className={`flex min-h-[60px] items-center justify-between rounded-[14px] bg-panel px-4 ring-2 ${w === null ? "ring-gold/60" : "ring-correct"}`}
            >
              <span className="flex flex-col items-start">
                <TeamName team={t} />
                <span className="text-[13px] text-text-dim">Score {formatScore(t.score)}</span>
              </span>
              <span className={`font-mono text-[13px] tracking-[0.12em] ${w === null ? "text-gold" : "text-correct-soft"}`}>
                {w === null ? "ENTER WAGER ›" : `LOCKED · ${w}`}
              </span>
            </button>
          );
        })}
        {sittingOut.map((t) => (
          <div key={t.id} className="flex h-12 items-center justify-between rounded-[14px] px-4 text-text-dim ring-1 ring-panel-border">
            <TeamName team={t} />
            <span className="font-mono text-[12px] tracking-[0.12em]">SITS OUT</span>
          </div>
        ))}
      </div>

      <BigButton tone="gold" size="xl" disabled={!allLocked || pending} onClick={() => act({ type: "showFinalQuestion" })}>
        Show question
      </BigButton>
    </div>
  );
}

export function FinalQuestionScreen({ act, pending, phase }: ScreenProps & { phase: Phase<"finalQuestion"> }) {
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow tone="text-gold">Final round · {phase.category}</Eyebrow>
      <p className="text-[18px] leading-snug">{phase.question}</p>
      <AnswerCard answer={phase.answer} />
      <TimerRow
        timer={phase.timer}
        disabled={pending}
        onToggle={() => act({ type: phase.timer.running ? "timerPause" : "timerStart" })}
        onSkip={() => act({ type: "timerSkip" })}
      />
      <BigButton tone="gold" size="xl" disabled={pending} onClick={() => act({ type: "startFinalReveal" })}>
        Reveal answers
      </BigButton>
    </div>
  );
}

export function FinalRevealScreen({ view, act, pending, phase }: ScreenProps & { phase: Phase<"finalReveal"> }) {
  const [answer, setAnswer] = useState("");
  const nextId = phase.order.find((id) => !(id in phase.judgments));
  const next = teamOf(view, nextId);

  const judge = async (correct: boolean) => {
    if (!nextId) return;
    const err = await act({ type: "judgeFinal", teamId: nextId, correct, answer });
    if (!err) setAnswer("");
  };

  return (
    <div className="flex flex-col gap-4">
      <Eyebrow tone="text-gold">Final round · reveal</Eyebrow>
      <AnswerCard answer={phase.answer} label="Correct answer" />

      {next ? (
        <>
          <div className="rounded-[16px] bg-panel p-4 ring-2 ring-gold/60">
            <Eyebrow>Up next</Eyebrow>
            <div className="mt-1 text-[22px] font-semibold">
              <TeamName team={next} />
            </div>
            <div className="text-[14px] text-text-muted">
              Wagered {phase.wagers[next.id]} · score {formatScore(next.score)}
            </div>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="What they wrote (optional, shown on TV)"
              maxLength={60}
              className="mt-3 h-12 w-full rounded-[12px] bg-bg px-3 text-[16px] outline-none ring-2 ring-panel-border focus:ring-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BigButton tone="correct" size="xl" disabled={pending} sub={`+${phase.wagers[next.id]}`} onClick={() => judge(true)}>
              Correct
            </BigButton>
            <BigButton tone="wrong" size="xl" disabled={pending} sub={`−${phase.wagers[next.id]}`} onClick={() => judge(false)}>
              Wrong
            </BigButton>
          </div>
        </>
      ) : (
        <BigButton tone="gold" size="xl" disabled={pending} onClick={() => act({ type: "showWinner" })}>
          Show winner
        </BigButton>
      )}

      <div className="flex flex-col gap-2">
        {phase.order
          .filter((id) => id in phase.judgments)
          .map((id) => {
            const j = phase.judgments[id];
            return (
              <div key={id} className="flex h-12 items-center justify-between rounded-[12px] bg-panel px-4 ring-2 ring-panel-border">
                <TeamName team={teamOf(view, id)} />
                <span className={`font-display text-[22px] font-black ${j.correct ? "text-correct-soft" : "text-wrong-soft"}`}>
                  {formatDelta(j.correct ? phase.wagers[id] : -phase.wagers[id])}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function WinnerScreen({ view }: ScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow tone="text-gold">Final standings</Eyebrow>
      {standings(view.teams).map((t, i) => (
        <div
          key={t.id}
          className={`flex h-14 items-center justify-between rounded-[14px] px-4 ring-2 ${i === 0 ? "bg-gold/15 ring-gold" : "bg-panel ring-panel-border"}`}
        >
          <span className="flex items-center gap-3">
            <span className="font-display text-[22px] font-black text-text-dim">{i + 1}</span>
            <TeamName team={t} />
          </span>
          <span className="font-display text-[26px] font-black">{formatScore(t.score)}</span>
        </div>
      ))}
      <p className="text-center text-[14px] text-text-muted">Game over! Start a new game from the laptop.</p>
    </div>
  );
}
