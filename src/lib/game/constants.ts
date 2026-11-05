export const CATEGORY_COUNT = 6;
export const QUESTIONS_PER_CATEGORY = 5;
export const STANDARD_VALUES = [100, 200, 300, 400, 500] as const;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 6;

export const DEFAULT_TIMER_SECONDS = 30;
export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 300;

export const MAX_BONUS_TILES = 2;
/** A bonus wager may go up to the team's score, or this floor if their score is lower. */
export const BONUS_WAGER_FLOOR = 500;

export const MAX_UNDO = 50;

export const MAX_PLAYER_NAME = 24;

/** A team on this many correct answers in a row gets a streak badge. */
export const STREAK_SHOW = 3;
/** Every this many in a row pays out a streak bonus. */
export const STREAK_BONUS_EVERY = 5;
export const STREAK_BONUS = 100;

/** Exactly this many items for Order It and clues for Connection. */
export const ORDER_ITEMS = 4;
export const CONNECTION_CLUES = 4;
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

/**
 * Season ranking points by team finish, ALGS-style (index 0 = 1st place).
 * Every player on the team gets them, plus 1 per correct answer the team made.
 */
export const PLACEMENT_POINTS = [12, 9, 7, 5, 4, 3] as const;
export const POINTS_PER_CORRECT = 1;

/** Team colors in assignment order (design spec). */
export const TEAM_COLORS = [
  "#35d6ff", // cyan
  "#b18cff", // violet
  "#7ee06b", // lime
  "#ff8a5c", // coral
  "#ffd35c", // yellow
  "#ff6b9a", // pink
] as const;
