// ---------- Game file (the JSON format from the product brief) ----------

export type MediaType = "image" | "audio" | "video";

export interface Media {
  type: MediaType;
  /** A data: URI (default, works offline) or an http(s) URL. */
  src: string;
}

/**
 * How a tile plays. Most types are judged like a normal question; the
 * differences are what the TV shows and a few rule tweaks:
 * - trueFalse: no steal (the other answer is obvious).
 * - closest: every team guesses a number; the closest (ties included) scores.
 * - wager: the picker risks 0–max before seeing the question; no steal.
 * - picture / audio / video: a normal question that needs matching media.
 */
export type QuestionType =
  | "standard"
  | "multipleChoice"
  | "trueFalse"
  | "picture"
  | "audio"
  | "video"
  | "closest"
  | "order"
  | "connection"
  | "wager";

export interface Question {
  value: number;
  /** Omitted in the JSON = "standard". */
  type?: QuestionType;
  question: string;
  answer: string;
  /**
   * multipleChoice: the choices (the answer is one of them).
   * order: the items in the correct order (shown shuffled).
   * connection: the four clues.
   */
  options?: string[];
  /** closest: the number to get close to. */
  target?: number;
  media?: Media;
  bonus: boolean;
}

export interface Category {
  name: string;
  questions: Question[];
}

export interface FinalQuestion {
  category: string;
  question: string;
  answer: string;
  media?: Media;
}

export interface GameFile {
  title: string;
  timerSeconds: number;
  categories: Category[];
  final: FinalQuestion;
}

// ---------- Runtime state (owned by the TV) ----------

export interface Team {
  id: string;
  name: string;
  color: string;
  score: number;
  /** Consecutive correct answers (reset by a wrong answer). */
  streak: number;
  /** Correct answers this game, including steals and the final. */
  correct: number;
}

/** Someone who joined from their phone with a name. */
export interface Player {
  /** Random id the phone keeps, so a refresh or a new tab rejoins the same player. */
  id: string;
  name: string;
  teamId: string | null;
}

/** Column (category index) and row (question index) on the board. */
export interface TileRef {
  col: number;
  row: number;
}

export interface Timer {
  durationMs: number;
  /** Time left as of `startedAt` (or now, if paused). */
  remainingMs: number;
  /** Epoch ms when the timer was last resumed; null while paused/stopped. */
  startedAt: number | null;
}

export interface TileResult {
  teamId: string;
  delta: number;
  steal: boolean;
  /** closest: what the team guessed. */
  guess?: number;
  /** The team's streak after this answer. */
  streak?: number;
  /** Extra points for hitting a streak milestone (already in the score). */
  streakBonus?: number;
}

export type FinalJudgment = { correct: boolean; answer: string };

export type Phase =
  | { kind: "lobby" }
  | { kind: "board" }
  | { kind: "bonusReveal"; tile: TileRef; teamId: string }
  | {
      kind: "question";
      tile: TileRef;
      /** Team whose turn it was; they picked the tile. */
      pickerId: string;
      /** Team currently answering: the picker, or the stealer. */
      answeringId: string;
      /** "all" = Closest Wins: every team guesses at once. */
      stage: "picker" | "steal" | "all";
      /** Set on bonus and wager tiles: the points at stake replace the tile value. */
      wager: number | null;
      results: TileResult[];
      timer: Timer;
    }
  | { kind: "reveal"; tile: TileRef; results: TileResult[] }
  | {
      kind: "finalWager";
      /** Wager per eligible team; null = not locked in yet. */
      wagers: Record<string, number | null>;
    }
  | { kind: "finalQuestion"; wagers: Record<string, number>; timer: Timer }
  | {
      kind: "finalReveal";
      wagers: Record<string, number>;
      /** Reveal order (eligible teams, lowest score first for drama). */
      order: string[];
      judgments: Record<string, FinalJudgment>;
    }
  | { kind: "winner" };

export type PhaseKind = Phase["kind"];

export interface HistoryEntry {
  label: string;
  snapshot: Omit<GameState, "history">;
}

export interface GameState {
  game: GameFile;
  teams: Team[];
  /** Players who joined from their phones. Optional so older saved sessions load. */
  players?: Player[];
  /** Index into `teams` of the team whose turn it is to pick. */
  turn: number;
  /** played[col][row] */
  played: boolean[][];
  phase: Phase;
  history: HistoryEntry[];
}

// ---------- Actions (sent by the host remote) ----------

export type Action =
  | { type: "setTeams"; teams: { name: string; color: string }[] }
  | { type: "startGame" }
  | { type: "pickTile"; col: number; row: number }
  | { type: "addPlayer"; player: { id: string; name: string } }
  | { type: "removePlayer"; playerId: string }
  | { type: "movePlayer"; playerId: string; teamId: string | null }
  /** `seed` comes from the sender so the reducer stays pure (and undo replays exactly). */
  | { type: "randomizeTeams"; seed: number }
  | { type: "lockBonusWager"; amount: number }
  | { type: "correct" }
  | { type: "wrong" }
  | { type: "judgeClosest"; guesses: Record<string, number> }
  | { type: "revealAnswer" }
  | { type: "continue" }
  | { type: "timerStart" }
  | { type: "timerPause" }
  | { type: "timerSkip" }
  | { type: "setScore"; teamId: string; score: number }
  | { type: "adjustScore"; teamId: string; delta: number }
  | { type: "goToFinal" }
  | { type: "lockFinalWager"; teamId: string; amount: number }
  | { type: "showFinalQuestion" }
  | { type: "startFinalReveal" }
  | { type: "judgeFinal"; teamId: string; correct: boolean; answer?: string }
  | { type: "showWinner" }
  | { type: "undo" };
