import {
  BONUS_WAGER_FLOOR,
  MAX_PLAYER_NAME,
  MAX_TEAMS,
  MAX_UNDO,
  MIN_TEAMS,
  STREAK_BONUS,
  STREAK_BONUS_EVERY,
  TEAM_COLORS,
} from "./constants";
import { questionType, seededRandom } from "./questions";
import type {
  Action,
  GameFile,
  GameState,
  HistoryEntry,
  Phase,
  Player,
  Question,
  Team,
  TileRef,
  TileResult,
  Timer,
} from "./types";

/** Thrown when an action is not allowed by the rules in the current state. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

function fail(message: string): never {
  throw new RuleError(message);
}

// ---------- Setup ----------

export function createGameState(game: GameFile): GameState {
  return {
    game,
    teams: [],
    players: [],
    turn: 0,
    played: game.categories.map((c) => c.questions.map(() => false)),
    phase: { kind: "lobby" },
    history: [],
  };
}

function buildTeams(input: { name: string; color: string }[]): Team[] {
  if (input.length < MIN_TEAMS || input.length > MAX_TEAMS) {
    fail(`A game needs ${MIN_TEAMS}–${MAX_TEAMS} teams.`);
  }
  const seen = new Set<string>();
  return input.map((t, i) => {
    const name = t.name.trim();
    if (!name) fail(`Team ${i + 1} needs a name.`);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(`Two teams are called "${name}".`);
    seen.add(key);
    return {
      id: `t${i + 1}`,
      name,
      color: t.color || TEAM_COLORS[i % TEAM_COLORS.length],
      score: 0,
      streak: 0,
      correct: 0,
    };
  });
}

// ---------- Timer ----------

export function newTimer(seconds: number, now: number, running = true): Timer {
  const durationMs = seconds * 1000;
  return { durationMs, remainingMs: durationMs, startedAt: running ? now : null };
}

export function timerRemaining(timer: Timer, now: number): number {
  if (timer.startedAt === null) return timer.remainingMs;
  return Math.max(0, timer.remainingMs - (now - timer.startedAt));
}

function pauseTimer(timer: Timer, now: number): Timer {
  return { ...timer, remainingMs: timerRemaining(timer, now), startedAt: null };
}

function resumeTimer(timer: Timer, now: number): Timer {
  if (timer.startedAt !== null || timer.remainingMs <= 0) return timer;
  return { ...timer, startedAt: now };
}

// ---------- Queries ----------

export function getQuestion(game: GameFile, tile: TileRef): Question {
  const q = game.categories[tile.col]?.questions[tile.row];
  if (!q) fail(`There is no tile at column ${tile.col + 1}, row ${tile.row + 1}.`);
  return q;
}

export function findTeam(state: { teams: Team[] }, teamId: string): Team {
  return state.teams.find((t) => t.id === teamId) ?? fail(`Unknown team "${teamId}".`);
}

function teamIndex(state: { teams: Team[] }, teamId: string): number {
  const i = state.teams.findIndex((t) => t.id === teamId);
  if (i < 0) fail(`Unknown team "${teamId}".`);
  return i;
}

export function nextTeamId(state: { teams: Team[] }, teamId: string): string {
  const i = teamIndex(state, teamId);
  return state.teams[(i + 1) % state.teams.length].id;
}

/** Bonus tiles and Wager tiles both ask the picker for a wager before the question. */
export function asksForWager(q: Question): boolean {
  return q.bonus || questionType(q) === "wager";
}

/** Players on a team, in roster order. */
export function teamMembers(state: { players?: Player[] }, teamId: string): Player[] {
  return (state.players ?? []).filter((p) => p.teamId === teamId);
}

/** Highest bonus wager allowed: up to the score, or 500 if the score is lower. */
export function maxBonusWager(score: number): number {
  return Math.max(score, BONUS_WAGER_FLOOR);
}

/** Only teams with a positive score play the final round. */
export function finalEligibleIds(state: { teams: Team[] }): string[] {
  return state.teams.filter((t) => t.score > 0).map((t) => t.id);
}

export function isBoardCleared(state: { played: boolean[][] }): boolean {
  return state.played.every((col) => col.every(Boolean));
}

/** Teams sorted by score, highest first; ties keep turn order. */
export function standings(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => b.score - a.score);
}

// ---------- Reducer ----------

type Snapshot = Omit<GameState, "history">;

// Joining isn't undoable: an undo should never kick someone out of the game.
const NOT_UNDOABLE: Action["type"][] = ["undo", "timerStart", "timerPause", "timerSkip", "addPlayer"];

/**
 * Applies a host action and returns the new state. Pure: the caller passes the
 * clock. Throws RuleError if the action is not allowed right now.
 */
export function applyAction(state: GameState, action: Action, now: number = Date.now()): GameState {
  if (action.type === "undo") {
    const last = state.history.at(-1);
    if (!last) fail("Nothing to undo.");
    // Keep anyone who joined after the snapshot was taken.
    const before = last.snapshot.players ?? [];
    const joined = (state.players ?? []).filter((p) => !before.some((b) => b.id === p.id));
    const teamIds = new Set(last.snapshot.teams.map((t) => t.id));
    const players = [
      ...before,
      ...joined.map((p) => (p.teamId && teamIds.has(p.teamId) ? p : { ...p, teamId: null })),
    ];
    return { ...last.snapshot, players, history: state.history.slice(0, -1) };
  }

  const { history, ...snapshot } = state;
  const next = reduce(snapshot, action, now);
  if (NOT_UNDOABLE.includes(action.type)) return { ...next, history };

  const entry: HistoryEntry = { label: describeAction(snapshot, action), snapshot };
  return { ...next, history: [...history, entry].slice(-MAX_UNDO) };
}

function reduce(s: Snapshot, action: Exclude<Action, { type: "undo" }>, now: number): Snapshot {
  const phase = s.phase;

  switch (action.type) {
    case "setTeams": {
      if (phase.kind !== "lobby") fail("Teams can only be changed in the lobby.");
      const teams = buildTeams(action.teams);
      const ids = new Set(teams.map((t) => t.id));
      const players = (s.players ?? []).map((p) => (p.teamId && ids.has(p.teamId) ? p : { ...p, teamId: null }));
      return { ...s, teams, players, turn: 0 };
    }

    case "addPlayer": {
      const id = action.player.id.trim();
      const name = action.player.name.trim().replace(/\s+/g, " ").slice(0, MAX_PLAYER_NAME);
      if (!id) fail("A player needs an id.");
      if (!name) fail("Type a name first.");
      const players = s.players ?? [];
      // Names identify people on the season leaderboard, so they're unique in a game.
      const key = name.toLowerCase();
      if (players.some((p) => p.id !== id && p.name.toLowerCase() === key)) {
        fail(`Someone here is already called "${name}". Add an initial?`);
      }
      if (players.some((p) => p.id === id)) {
        // Rejoining (refresh, new name): keep their team.
        return { ...s, players: players.map((p) => (p.id === id ? { ...p, name } : p)) };
      }
      const player: Player = { id, name, teamId: smallestTeam(s) };
      return { ...s, players: [...players, player] };
    }

    case "removePlayer": {
      const players = s.players ?? [];
      if (!players.some((p) => p.id === action.playerId)) fail("That player isn't in this game.");
      return { ...s, players: players.filter((p) => p.id !== action.playerId) };
    }

    case "movePlayer": {
      const players = s.players ?? [];
      if (!players.some((p) => p.id === action.playerId)) fail("That player isn't in this game.");
      if (action.teamId !== null) findTeam(s, action.teamId);
      return {
        ...s,
        players: players.map((p) => (p.id === action.playerId ? { ...p, teamId: action.teamId } : p)),
      };
    }

    case "randomizeTeams": {
      if (phase.kind !== "lobby") fail("Teams can only be shuffled in the lobby.");
      const players = s.players ?? [];
      if (players.length === 0) fail("Nobody has joined yet.");
      if (s.teams.length === 0) fail("Set up the teams first.");
      const rand = seededRandom(action.seed);
      const order = players.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      // Deal round-robin from a random team, so the same team doesn't always get the extra player.
      const offset = Math.floor(rand() * s.teams.length);
      const teamOf = new Map(order.map((pi, k) => [pi, s.teams[(offset + k) % s.teams.length].id]));
      return { ...s, players: players.map((p, i) => ({ ...p, teamId: teamOf.get(i)! })) };
    }

    case "startGame": {
      if (phase.kind !== "lobby") fail("The game has already started.");
      if (s.teams.length < MIN_TEAMS) fail(`Add at least ${MIN_TEAMS} teams first.`);
      return { ...s, turn: 0, phase: { kind: "board" } };
    }

    case "pickTile": {
      if (phase.kind !== "board") fail("Tiles can only be picked from the board.");
      const tile = { col: action.col, row: action.row };
      const q = getQuestion(s.game, tile);
      if (s.played[tile.col][tile.row]) fail("That tile has already been played.");
      const played = s.played.map((col, c) =>
        c === tile.col ? col.map((p, r) => p || r === tile.row) : col,
      );
      const pickerId = s.teams[s.turn].id;
      if (asksForWager(q)) {
        return { ...s, played, phase: { kind: "bonusReveal", tile, teamId: pickerId } };
      }
      return { ...s, played, phase: openQuestion(s, tile, pickerId, null, now) };
    }

    case "lockBonusWager": {
      if (phase.kind !== "bonusReveal") fail("There is no bonus wager to lock.");
      const team = findTeam(s, phase.teamId);
      const amount = checkWager(action.amount, maxBonusWager(team.score));
      return { ...s, phase: openQuestion(s, phase.tile, phase.teamId, amount, now) };
    }

    case "correct":
    case "wrong": {
      if (phase.kind !== "question") fail("There is no question being answered.");
      if (phase.stage === "all") fail("On Closest Wins, enter every team's guess instead.");
      const q = getQuestion(s.game, phase.tile);
      const stake = phase.wager ?? q.value;
      const isSteal = phase.stage === "steal";
      const right = action.type === "correct";
      // Steals are risk-free: a wrong steal costs nothing.
      const delta = right ? stake : isSteal ? 0 : -stake;
      const { teams, streak, streakBonus } = recordAnswer(s.teams, phase.answeringId, right, delta);
      const results: TileResult[] = [
        ...phase.results,
        { teamId: phase.answeringId, delta, steal: isSteal, streak, ...(streakBonus > 0 && { streakBonus }) },
      ];

      const canSteal =
        !right && !isSteal && phase.wager === null && questionType(q) !== "trueFalse" && s.teams.length > 1;
      if (canSteal) {
        return {
          ...s,
          teams,
          phase: {
            ...phase,
            stage: "steal",
            answeringId: nextTeamId(s, phase.pickerId),
            results,
            timer: newTimer(s.game.timerSeconds, now),
          },
        };
      }
      return { ...s, teams, phase: { kind: "reveal", tile: phase.tile, results } };
    }

    case "judgeClosest": {
      if (phase.kind !== "question" || phase.stage !== "all") fail("This isn't a Closest Wins question.");
      const q = getQuestion(s.game, phase.tile);
      const target = q.target;
      if (target === undefined) fail("This question has no target number.");
      const entries = Object.entries(action.guesses);
      if (entries.length === 0) fail("Enter at least one team's guess.");
      for (const [id, g] of entries) {
        const team = findTeam(s, id);
        if (typeof g !== "number" || !Number.isFinite(g)) fail(`${team.name}'s guess isn't a number.`);
      }
      const best = Math.min(...entries.map(([, g]) => Math.abs(g - target)));
      let teams = s.teams;
      const results: TileResult[] = [];
      // Team order, so the TV lists guesses consistently.
      for (const t of s.teams) {
        const guess = action.guesses[t.id];
        if (guess === undefined) continue;
        if (Math.abs(guess - target) === best) {
          const r = recordAnswer(teams, t.id, true, q.value);
          teams = r.teams;
          results.push({
            teamId: t.id,
            delta: q.value,
            steal: false,
            guess,
            streak: r.streak,
            ...(r.streakBonus > 0 && { streakBonus: r.streakBonus }),
          });
        } else {
          // Not being closest costs nothing and doesn't break a streak.
          results.push({ teamId: t.id, delta: 0, steal: false, guess });
        }
      }
      return { ...s, teams, phase: { kind: "reveal", tile: phase.tile, results } };
    }

    case "revealAnswer": {
      if (phase.kind !== "question") fail("There is no question to reveal.");
      return { ...s, phase: { kind: "reveal", tile: phase.tile, results: phase.results } };
    }

    case "continue": {
      if (phase.kind !== "reveal") fail("Nothing to continue from.");
      const advanced = { ...s, turn: (s.turn + 1) % s.teams.length };
      if (isBoardCleared(advanced)) return enterFinal(advanced);
      return { ...advanced, phase: { kind: "board" } };
    }

    case "goToFinal": {
      if (phase.kind !== "board") fail("The final round can only start from the board.");
      return enterFinal(s);
    }

    case "timerStart":
    case "timerPause":
    case "timerSkip": {
      if (phase.kind !== "question" && phase.kind !== "finalQuestion") {
        fail("There is no timer running.");
      }
      const timer =
        action.type === "timerStart"
          ? resumeTimer(phase.timer, now)
          : action.type === "timerPause"
            ? pauseTimer(phase.timer, now)
            : { ...phase.timer, remainingMs: 0, startedAt: null };
      return { ...s, phase: { ...phase, timer } };
    }

    case "setScore": {
      findTeam(s, action.teamId);
      const score = checkInteger(action.score, "Score");
      return {
        ...s,
        teams: s.teams.map((t) => (t.id === action.teamId ? { ...t, score } : t)),
      };
    }

    case "adjustScore": {
      findTeam(s, action.teamId);
      return { ...s, teams: addToScore(s.teams, action.teamId, checkInteger(action.delta, "Change")) };
    }

    case "lockFinalWager": {
      if (phase.kind !== "finalWager") fail("Final wagers are not open.");
      if (!(action.teamId in phase.wagers)) fail("That team sits out the final round.");
      const team = findTeam(s, action.teamId);
      const amount = checkWager(action.amount, team.score);
      return { ...s, phase: { ...phase, wagers: { ...phase.wagers, [action.teamId]: amount } } };
    }

    case "showFinalQuestion": {
      if (phase.kind !== "finalWager") fail("Final wagers are not open.");
      const wagers: Record<string, number> = {};
      for (const [id, w] of Object.entries(phase.wagers)) {
        if (w === null) fail(`${findTeam(s, id).name} hasn't locked a wager yet.`);
        wagers[id] = w;
      }
      return {
        ...s,
        phase: { kind: "finalQuestion", wagers, timer: newTimer(s.game.timerSeconds, now) },
      };
    }

    case "startFinalReveal": {
      if (phase.kind !== "finalQuestion") fail("The final question isn't showing.");
      const ids = Object.keys(phase.wagers);
      // Lowest score first, so the leader is revealed last.
      const order = s.teams
        .filter((t) => ids.includes(t.id))
        .sort((a, b) => a.score - b.score)
        .map((t) => t.id);
      return { ...s, phase: { kind: "finalReveal", wagers: phase.wagers, order, judgments: {} } };
    }

    case "judgeFinal": {
      if (phase.kind !== "finalReveal") fail("Final answers aren't being revealed.");
      const expected = phase.order.find((id) => !(id in phase.judgments));
      if (!expected) fail("Every final answer has been judged.");
      if (action.teamId !== expected) {
        fail(`Judge ${findTeam(s, expected).name} first.`);
      }
      const wager = phase.wagers[action.teamId];
      const delta = action.correct ? wager : -wager;
      const teams = addToScore(s.teams, action.teamId, delta).map((t) =>
        t.id === action.teamId && action.correct ? { ...t, correct: t.correct + 1 } : t,
      );
      return {
        ...s,
        teams,
        phase: {
          ...phase,
          judgments: {
            ...phase.judgments,
            [action.teamId]: { correct: action.correct, answer: action.answer?.trim() ?? "" },
          },
        },
      };
    }

    case "showWinner": {
      if (phase.kind !== "finalReveal") fail("Finish the final round first.");
      if (phase.order.some((id) => !(id in phase.judgments))) fail("Judge every final answer first.");
      return { ...s, phase: { kind: "winner" } };
    }
  }
}

function openQuestion(
  s: Snapshot,
  tile: TileRef,
  pickerId: string,
  wager: number | null,
  now: number,
): Phase {
  const closest = questionType(getQuestion(s.game, tile)) === "closest";
  return {
    kind: "question",
    tile,
    pickerId,
    answeringId: pickerId,
    stage: closest ? "all" : "picker",
    wager,
    results: [],
    timer: newTimer(s.game.timerSeconds, now),
  };
}

function enterFinal(s: Snapshot): Snapshot {
  const eligible = finalEligibleIds(s);
  if (eligible.length === 0) return { ...s, phase: { kind: "winner" } };
  const wagers = Object.fromEntries(eligible.map((id) => [id, null]));
  return { ...s, phase: { kind: "finalWager", wagers } };
}

/** Team with the fewest players (earliest in turn order on a tie); null before teams exist. */
function smallestTeam(s: Snapshot): string | null {
  let best: string | null = null;
  let bestCount = Infinity;
  for (const t of s.teams) {
    const n = teamMembers(s, t.id).length;
    if (n < bestCount) {
      best = t.id;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Scores an answer and updates the team's streak: a correct answer extends it
 * (paying a bonus every few in a row), a wrong one resets it.
 */
function recordAnswer(
  teams: Team[],
  teamId: string,
  right: boolean,
  delta: number,
): { teams: Team[]; streak: number; streakBonus: number } {
  const team = teams.find((t) => t.id === teamId) ?? fail(`Unknown team "${teamId}".`);
  const streak = right ? (team.streak ?? 0) + 1 : 0;
  const streakBonus = right && streak % STREAK_BONUS_EVERY === 0 ? STREAK_BONUS : 0;
  const next = teams.map((t) =>
    t.id === teamId
      ? { ...t, score: t.score + delta + streakBonus, streak, correct: (t.correct ?? 0) + (right ? 1 : 0) }
      : t,
  );
  return { teams: next, streak, streakBonus };
}

function addToScore(teams: Team[], teamId: string, delta: number): Team[] {
  if (delta === 0) return teams;
  return teams.map((t) => (t.id === teamId ? { ...t, score: t.score + delta } : t));
}

function checkInteger(n: number, label: string): number {
  if (!Number.isInteger(n)) fail(`${label} must be a whole number.`);
  return n;
}

function checkWager(amount: number, max: number): number {
  checkInteger(amount, "Wager");
  if (amount < 0 || amount > max) fail(`Wager must be between 0 and ${max}.`);
  return amount;
}

// ---------- Labels for the undo row ----------

function describeAction(s: Snapshot, action: Action): string {
  const name = (id: string) => s.teams.find((t) => t.id === id)?.name ?? id;
  const playerName = (id: string) => s.players?.find((p) => p.id === id)?.name ?? "Player";
  const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);
  const phase = s.phase;

  switch (action.type) {
    case "setTeams":
      return "Set teams";
    case "addPlayer":
      return `${action.player.name} joined`;
    case "removePlayer":
      return `Remove ${playerName(action.playerId)}`;
    case "movePlayer":
      return action.teamId
        ? `${playerName(action.playerId)} to ${name(action.teamId)}`
        : `Bench ${playerName(action.playerId)}`;
    case "randomizeTeams":
      return "Shuffle teams";
    case "startGame":
      return "Start game";
    case "pickTile": {
      const cat = s.game.categories[action.col]?.name ?? "?";
      const value = s.game.categories[action.col]?.questions[action.row]?.value ?? 0;
      return `Open ${cat} ${value}`;
    }
    case "lockBonusWager":
      return phase.kind === "bonusReveal" ? `${name(phase.teamId)} wager ${action.amount}` : "Wager";
    case "correct":
    case "wrong": {
      if (phase.kind !== "question") return action.type;
      const stake = phase.wager ?? getQuestion(s.game, phase.tile).value;
      const right = action.type === "correct";
      if (phase.stage === "steal") {
        return right ? `${name(phase.answeringId)} steal ${signed(stake)}` : `${name(phase.answeringId)} steal missed`;
      }
      return `${name(phase.answeringId)} ${signed(right ? stake : -stake)}`;
    }
    case "judgeClosest":
      return "Closest guesses";
    case "revealAnswer":
      return "Reveal answer";
    case "continue":
      return "Back to board";
    case "goToFinal":
      return "Go to final round";
    case "setScore":
      return `${name(action.teamId)} score set to ${action.score}`;
    case "adjustScore":
      return `${name(action.teamId)} ${signed(action.delta)}`;
    case "lockFinalWager":
      return `${name(action.teamId)} final wager`;
    case "showFinalQuestion":
      return "Show final question";
    case "startFinalReveal":
      return "Start final reveal";
    case "judgeFinal":
      return `${name(action.teamId)} final ${action.correct ? "correct" : "wrong"}`;
    case "showWinner":
      return "Show winner";
    default:
      return action.type;
  }
}

/** Label of the action that `undo` would revert, if any. */
export function lastActionLabel(state: GameState): string | null {
  return state.history.at(-1)?.label ?? null;
}
