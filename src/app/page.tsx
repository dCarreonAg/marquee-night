"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/tv/parts";
import {
  applyAction,
  createGameState,
  MAX_TEAMS,
  MIN_TEAMS,
  parseGameJson,
  RuleError,
  TEAM_COLORS,
  validateGame,
  type GameFile,
} from "@/lib/game";
import { createNight, leaderboardEnabled } from "@/lib/leaderboard";
import { listGames, loadGame, type SavedGameMeta } from "@/lib/library";
import { loadSession, newRoomCode, saveSession, type Session } from "@/lib/session";

interface TeamDraft {
  key: number;
  name: string;
  color: string;
}

let nextKey = 0;
const draft = (color: string, name = ""): TeamDraft => ({ key: nextKey++, name, color });

export default function SetupPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SetupPage />
    </Suspense>
  );
}

function SetupPage() {
  const router = useRouter();
  const gameParam = useSearchParams().get("game");
  const [library, setLibrary] = useState<SavedGameMeta[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [game, setGame] = useState<GameFile | null>(null);
  const [problems, setProblems] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });
  const [teams, setTeams] = useState<TeamDraft[]>(() => TEAM_COLORS.slice(0, 4).map((c) => draft(c)));
  const [teamError, setTeamError] = useState<string | null>(null);
  const [resume, setResume] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  /** null = still asking the server whether it has a leaderboard. */
  const [seasonAvailable, setSeasonAvailable] = useState<boolean | null>(null);
  const [ranked, setRanked] = useState(true);
  // Set after the leaderboard failed once: the next click plays unranked.
  const [unrankedOk, setUnrankedOk] = useState(false);

  useEffect(() => {
    loadSession().then((s) => {
      if (s && s.state.phase.kind !== "winner") setResume(s);
    });
    listGames().then(setLibrary);
    leaderboardEnabled().then(setSeasonAvailable);
  }, []);

  const loadSaved = async (id: string) => {
    const saved = await loadGame(id);
    if (!saved) return;
    setChosenId(id);
    showResult(validateGame(saved));
  };

  const showResult = (result: ReturnType<typeof validateGame>) => {
    if (result.ok) {
      setGame(result.game);
      setProblems({ errors: [], warnings: result.warnings });
    } else {
      setGame(null);
      setProblems({ errors: result.errors, warnings: result.warnings });
    }
  };

  // Coming from the editor's "Play on this screen".
  useEffect(() => {
    if (!gameParam) return;
    loadGame(gameParam).then((saved) => {
      if (!saved) return;
      setChosenId(gameParam);
      showResult(validateGame(saved));
    });
  }, [gameParam]);

  const loadSample = async () => {
    setChosenId(null);
    const res = await fetch("/sample-game.json");
    showResult(validateGame(await res.json()));
  };

  const importFile = async (file: File) => {
    setChosenId(null);
    showResult(parseGameJson(await file.text()));
  };

  const updateTeam = (key: number, patch: Partial<TeamDraft>) =>
    setTeams((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const moveTeam = (i: number, dir: -1 | 1) =>
    setTeams((ts) => {
      const j = i + dir;
      if (j < 0 || j >= ts.length) return ts;
      const copy = [...ts];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const addTeam = () =>
    setTeams((ts) => {
      const used = new Set(ts.map((t) => t.color));
      const color = TEAM_COLORS.find((c) => !used.has(c)) ?? TEAM_COLORS[ts.length % TEAM_COLORS.length];
      return [...ts, draft(color)];
    });

  const openLobby = async () => {
    if (!game) return;
    setTeamError(null);
    try {
      const state = applyAction(createGameState(game), {
        type: "setTeams",
        teams: teams.map((t) => ({ name: t.name, color: t.color })),
      });
      setBusy(true);
      const roomCode = newRoomCode();
      let night: { id: string; token: string } | null = null;
      if (seasonAvailable && ranked && !unrankedOk) {
        const opened = await createNight(game.title, roomCode);
        if ("error" in opened) {
          setBusy(false);
          setUnrankedOk(true);
          setTeamError(`${opened.error} Click again to play this one unranked.`);
          return;
        }
        night = opened;
      }
      await saveSession({ roomCode, state, nightId: night?.id ?? null, nightToken: night?.token ?? null, updatedAt: Date.now() });
      router.push("/tv");
    } catch (e) {
      setBusy(false);
      setTeamError(e instanceof RuleError ? e.message : "Could not start the game.");
    }
  };

  return (
    <main className="bg-board-glow min-h-screen px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <Wordmark size={72} />
          <p className="text-text-muted">Set up tonight&apos;s game on the screen everyone will watch.</p>
          {seasonAvailable && (
            <Link href="/leaderboard" className="text-sm font-semibold text-gold hover:underline">
              Season leaderboard →
            </Link>
          )}
        </header>

        {resume && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-hot/60 bg-panel px-6 py-4">
            <div>
              <div className="font-mono text-xs tracking-[0.2em] text-text-dim">GAME IN PROGRESS</div>
              <div className="text-lg font-semibold">
                {resume.state.game.title} · room {resume.roomCode}
              </div>
            </div>
            <button
              onClick={() => router.push("/tv")}
              className="rounded-xl bg-hot px-5 py-3 font-semibold text-white hover:brightness-110"
            >
              Resume
            </button>
          </div>
        )}

        <Section step="1" title="Load a game">
          {library.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              <div className="font-mono text-xs tracking-[0.2em] text-text-dim">SAVED GAMES</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {library.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => loadSaved(g.id)}
                    className={`truncate rounded-xl bg-panel px-4 py-3 text-left font-semibold ring-2 ${chosenId === g.id ? "ring-gold" : "ring-panel-border hover:ring-cat-border"}`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button onClick={loadSample} className="rounded-xl bg-panel px-5 py-3 font-semibold ring-2 ring-panel-border hover:ring-cat-border">
              Use the sample game
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded-xl bg-panel px-5 py-3 font-semibold ring-2 ring-panel-border hover:ring-cat-border"
            >
              Import JSON…
            </button>
            <Link
              href={chosenId ? `/editor?id=${chosenId}` : "/editor"}
              className="rounded-xl px-5 py-3 font-semibold text-text-muted ring-2 ring-transparent hover:text-text hover:ring-panel-border"
            >
              {chosenId ? "Edit this game" : "Write a game…"}
            </Link>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {game && (
            <div className="mt-4 rounded-xl border-2 border-correct/60 bg-panel px-5 py-4">
              <div className="font-mono text-xs tracking-[0.2em] text-correct-soft">READY</div>
              <div className="text-lg font-semibold">{game.title}</div>
              <div className="text-sm text-text-muted">
                {game.categories.map((c) => c.name).join(" · ")} · {game.timerSeconds}s timer
              </div>
            </div>
          )}
          {problems.errors.length > 0 && (
            <Messages tone="error" title="This file can't be played yet:" items={problems.errors} />
          )}
          {problems.warnings.length > 0 && <Messages tone="warn" title="Heads up:" items={problems.warnings} />}
        </Section>

        <Section step="2" title="Teams" hint="Turn order. Players who join are dealt onto these; shuffle from the host phone.">
          <ul className="flex flex-col gap-2">
            {teams.map((t, i) => (
              <li key={t.key} className="flex items-center gap-2 rounded-xl bg-panel p-2 ring-1 ring-panel-border">
                <span className="w-6 text-center font-mono text-text-dim">{i + 1}</span>
                <div className="flex gap-1">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Color ${c}`}
                      onClick={() => updateTeam(t.key, { color: c })}
                      className={`h-7 w-7 rounded-full transition ${t.color === c ? "ring-2 ring-text ring-offset-2 ring-offset-panel" : "opacity-50 hover:opacity-100"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <input
                  value={t.name}
                  onChange={(e) => updateTeam(t.key, { name: e.target.value })}
                  placeholder={`Team ${i + 1} name`}
                  maxLength={24}
                  className="min-w-0 flex-1 rounded-lg bg-bg px-3 py-2.5 text-text outline-none ring-1 ring-panel-border focus:ring-cat-border"
                />
                <IconBtn label="Move up" disabled={i === 0} onClick={() => moveTeam(i, -1)}>
                  ↑
                </IconBtn>
                <IconBtn label="Move down" disabled={i === teams.length - 1} onClick={() => moveTeam(i, 1)}>
                  ↓
                </IconBtn>
                <IconBtn
                  label="Remove team"
                  disabled={teams.length <= MIN_TEAMS}
                  onClick={() => setTeams((ts) => ts.filter((x) => x.key !== t.key))}
                >
                  ✕
                </IconBtn>
              </li>
            ))}
          </ul>
          {teams.length < MAX_TEAMS && (
            <button onClick={addTeam} className="mt-3 text-sm font-semibold text-text-muted hover:text-text">
              + Add team
            </button>
          )}
          {teamError && <p className="mt-3 text-wrong-soft">{teamError}</p>}
        </Section>

        {seasonAvailable && (
          <Section step="3" title="Season night">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-panel px-5 py-4 ring-1 ring-panel-border">
              <span className="text-sm text-text-muted">
                <span className={`font-semibold ${ranked ? "text-correct-soft" : "text-text"}`}>
                  {ranked ? "Counts on the season leaderboard." : "Just for fun tonight."}
                </span>{" "}
                Players scan the QR code on the TV and type their name; everyone earns points for where their team
                finishes.
              </span>
              <input
                type="checkbox"
                checked={ranked}
                onChange={(e) => setRanked(e.target.checked)}
                className="h-6 w-6 shrink-0 accent-[#ffc53d]"
              />
            </label>
          </Section>
        )}

        <button
          onClick={openLobby}
          disabled={!game || busy}
          className="rounded-2xl bg-gold py-5 font-display text-3xl font-black uppercase tracking-[0.08em] text-bg shadow-[0_0_40px_rgba(255,197,61,0.35)] transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
        >
          Open lobby on this screen
        </button>
      </div>
    </main>
  );
}

function Section({ step, title, hint, children }: { step: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-sm text-gold">{step}</span>
        <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.06em]">{title}</h2>
        {hint && <span className="text-sm text-text-dim">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Messages({ tone, title, items }: { tone: "error" | "warn"; title: string; items: string[] }) {
  return (
    <div
      className={`mt-4 rounded-xl border-2 px-5 py-4 text-sm ${tone === "error" ? "border-wrong/60 text-wrong-soft" : "border-gold/40 text-gold"}`}
    >
      <div className="mb-1 font-semibold">{title}</div>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.slice(0, 12).map((m, i) => (
          <li key={i}>{m}</li>
        ))}
        {items.length > 12 && <li>…and {items.length - 12} more.</li>}
      </ul>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-10 rounded-lg text-text-muted hover:bg-bg hover:text-text disabled:opacity-25"
    >
      {children}
    </button>
  );
}
