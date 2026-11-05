import { describe, expect, it } from "vitest";
import sample from "../../../public/sample-game.json";
import { applyAction, createGameState, RuleError } from "./engine";
import { shuffledOrder } from "./questions";
import { finishPlaces, rankingPoints } from "./rankings";
import type { Action, GameFile, GameState, Question } from "./types";
import { validateGame } from "./validate";
import { toHostView, toPlayerView, toPublicView } from "./views";

const T0 = 1_000_000;

/** The sample with no bonus tiles and every tile a plain question. */
function plainGame(): GameFile {
  const r = validateGame(sample);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return {
    ...r.game,
    categories: r.game.categories.map((c) => ({
      ...c,
      questions: c.questions.map((q) => ({ value: q.value, question: q.question, answer: q.answer, bonus: false })),
    })),
  };
}

function withTile(game: GameFile, col: number, row: number, patch: Partial<Question>): GameFile {
  return {
    ...game,
    categories: game.categories.map((c, ci) => ({
      ...c,
      questions: c.questions.map((q, ri) => (ci === col && ri === row ? { ...q, ...patch } : q)),
    })),
  };
}

const play = (s: GameState, ...actions: Action[]) => actions.reduce((st, a) => applyAction(st, a, T0), s);

function started(game: GameFile = plainGame(), names = ["Owls", "Foxes"]): GameState {
  return play(createGameState(game), { type: "setTeams", teams: names.map((name) => ({ name, color: "" })) }, { type: "startGame" });
}

const pick = (col: number, row: number): Action => ({ type: "pickTile", col, row });
const next: Action = { type: "continue" };
const correct: Action = { type: "correct" };
const wrong: Action = { type: "wrong" };
const scores = (s: GameState) => s.teams.map((t) => t.score);

describe("streaks", () => {
  it("counts consecutive correct answers per team and pays +100 at 5", () => {
    // Owls get every tile right; Foxes miss theirs and nobody steals.
    let s = started();
    const owlTiles: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    const foxTiles: [number, number][] = [[0, 1], [1, 1], [2, 1], [3, 1]];
    for (let i = 0; i < 5; i++) {
      s = play(s, pick(...owlTiles[i]), correct);
      const phase = s.phase;
      if (phase.kind !== "reveal") throw new Error("expected reveal");
      expect(phase.results[0].streak).toBe(i + 1);
      expect(phase.results[0].streakBonus).toBe(i === 4 ? 100 : undefined);
      s = play(s, next);
      if (i < 4) s = play(s, pick(...foxTiles[i]), wrong, { type: "revealAnswer" }, next);
    }
    expect(s.teams[0].streak).toBe(5);
    expect(s.teams[0].correct).toBe(5);
    // 5 × 100 + streak bonus; Foxes lost 4 × 200.
    expect(scores(s)).toEqual([600, -800]);
  });

  it("a wrong answer (even a missed steal) resets the streak", () => {
    let s = started();
    s = play(s, pick(0, 0), correct, next); // Owls 1
    s = play(s, pick(0, 1), wrong); // Foxes miss, Owls steal…
    s = play(s, wrong, next); // …and miss
    expect(s.teams.map((t) => t.streak)).toEqual([0, 0]);
  });

  it("manual score edits leave streaks alone", () => {
    let s = play(started(), pick(0, 0), correct, next);
    s = play(s, { type: "adjustScore", teamId: "t1", delta: -50 });
    expect(s.teams[0]).toMatchObject({ streak: 1, score: 50 });
  });
});

describe("question types", () => {
  it("True / False has no steal", () => {
    const g = withTile(plainGame(), 0, 0, { type: "trueFalse", answer: "True" });
    const s = play(started(g), pick(0, 0), wrong);
    expect(s.phase.kind).toBe("reveal");
  });

  it("Multiple choice can be stolen", () => {
    const g = withTile(plainGame(), 0, 0, { type: "multipleChoice", options: ["A", "B", "C", "D"], answer: "B" });
    const s = play(started(g), pick(0, 0), wrong);
    expect(s.phase).toMatchObject({ kind: "question", stage: "steal" });
  });

  it("Wager tiles ask for a wager first and have no steal", () => {
    const g = withTile(plainGame(), 0, 0, { type: "wager" });
    let s = play(started(g), pick(0, 0));
    expect(toPublicView(s).phase).toMatchObject({ kind: "bonusReveal", reason: "wager", maxWager: 500 });
    s = play(s, { type: "lockBonusWager", amount: 400 }, wrong);
    expect(s.phase.kind).toBe("reveal");
    expect(scores(s)).toEqual([-400, 0]);
  });

  it("Closest Wins: every team guesses, the closest (ties too) score, nobody loses", () => {
    const g = withTile(plainGame(), 0, 2, { type: "closest", target: 100, answer: "100" });
    let s = play(started(g, ["Owls", "Foxes", "Bears"]), pick(0, 2));
    expect(s.phase).toMatchObject({ kind: "question", stage: "all" });
    expect(() => play(s, correct)).toThrow(RuleError);
    s = play(s, { type: "judgeClosest", guesses: { t1: 90, t2: 110, t3: 300 } });
    expect(scores(s)).toEqual([300, 300, 0]);
    expect(s.phase).toMatchObject({
      kind: "reveal",
      results: [
        { teamId: "t1", delta: 300, guess: 90 },
        { teamId: "t2", delta: 300, guess: 110 },
        { teamId: "t3", delta: 0, guess: 300 },
      ],
    });
  });

  it("Order It shuffles the same way on the TV and the phone, and the answer gives the letters", () => {
    const items = ["Pyramids", "Colosseum", "Eiffel Tower", "Burj Khalifa"];
    const g = withTile(plainGame(), 1, 1, { type: "order", options: items, question: "", answer: "x" });
    const s = play(started(g), pick(1, 1));
    const tv = toPublicView(s).phase;
    const host = toHostView(s).phase;
    if (tv.kind !== "question" || host.kind !== "question") throw new Error("expected question");
    expect(tv.options).toEqual(host.options);
    expect(tv.options).not.toEqual(items);
    expect([...tv.options].sort()).toEqual([...items].sort());
    expect(tv.question).toMatch(/in order/);
    // Each answer line names the letter the item had on screen.
    host.answerLines!.forEach((line, i) => {
      const letter = line[0];
      expect(tv.options["ABCD".indexOf(letter)]).toBe(items[i]);
    });
  });

  it("never shows Order It already in order", () => {
    for (let seed = 1; seed < 200; seed++) {
      expect(shuffledOrder(["a", "b", "c", "d"], seed)).not.toEqual([0, 1, 2, 3]);
    }
  });

  it("flags the last row as the deep cut", () => {
    const s = play(started(), pick(2, 4));
    expect(toPublicView(s).phase).toMatchObject({ kind: "question", deepCut: true });
    expect(toPublicView(started()).categories[0].tiles.map((t) => t.deepCut)).toEqual([false, false, false, false, true]);
  });
});

describe("players and teams", () => {
  const join = (id: string, name = id): Action => ({ type: "addPlayer", player: { id, name } });

  it("puts new players on the smallest team, and rejoining keeps the team", () => {
    let s = play(createGameState(plainGame()), { type: "setTeams", teams: [{ name: "A", color: "" }, { name: "B", color: "" }] });
    s = play(s, join("u1"), join("u2"), join("u3"));
    expect(s.players!.map((p) => p.teamId)).toEqual(["t1", "t2", "t1"]);
    s = play(s, join("u2", "Renamed"));
    expect(s.players![1]).toMatchObject({ name: "Renamed", teamId: "t2" });
  });

  it("refuses a name someone else is using (any case), but lets the same phone rename itself", () => {
    let s = play(createGameState(plainGame()), { type: "setTeams", teams: [{ name: "A", color: "" }, { name: "B", color: "" }] });
    s = play(s, join("u1", "Diego"));
    expect(() => play(s, join("u2", "  diego "))).toThrow(/already called/);
    s = play(s, join("u1", "Diego C"));
    expect(s.players).toEqual([{ id: "u1", name: "Diego C", teamId: "t1" }]);
    expect(() => play(s, join("u3", "   "))).toThrow(/name/);
  });

  it("randomizes evenly and deterministically from the seed", () => {
    let s = play(createGameState(plainGame()), { type: "setTeams", teams: ["A", "B", "C"].map((name) => ({ name, color: "" })) });
    s = play(s, ...["a", "b", "c", "d", "e", "f", "g"].map((id) => join(id)));
    const a = play(s, { type: "randomizeTeams", seed: 42 });
    const b = play(s, { type: "randomizeTeams", seed: 42 });
    expect(a.players).toEqual(b.players);
    const sizes = ["t1", "t2", "t3"].map((id) => a.players!.filter((p) => p.teamId === id).length).sort();
    expect(sizes).toEqual([2, 2, 3]);
  });

  it("only shuffles in the lobby", () => {
    const s = play(started(), join("u1"));
    expect(() => play(s, { type: "randomizeTeams", seed: 1 })).toThrow(/lobby/);
  });

  it("undo never removes someone who joined", () => {
    let s = play(started(), pick(0, 0));
    s = play(s, join("late"), { type: "undo" });
    expect(s.phase.kind).toBe("board");
    expect(s.players!.map((p) => p.id)).toEqual(["late"]);
  });

  it("player view carries no question or answer", () => {
    const s = play(started(), join("u1"), pick(0, 0));
    const json = JSON.stringify(toPlayerView(s));
    const q = s.game.categories[0].questions[0];
    expect(json).not.toContain(q.answer);
    expect(json).not.toContain(q.question);
  });
});

describe("ranking points", () => {
  it("ties share the better place", () => {
    expect(finishPlaces([{ score: 500, correct: 0 }, { score: 900, correct: 0 }, { score: 500, correct: 0 }, { score: -100, correct: 0 }])).toEqual([2, 1, 2, 4]);
  });

  it("is placement points plus one per correct answer", () => {
    expect(rankingPoints(1, 6)).toBe(18);
    expect(rankingPoints(3, 2)).toBe(9);
    expect(rankingPoints(9, 1)).toBe(1);
  });
});

describe("validating question types", () => {
  const errs = (patch: Omit<Partial<Question>, "type"> & Record<string, unknown>) => {
    const r = validateGame(withTile(plainGame(), 0, 0, patch as unknown as Partial<Question>));
    return r.ok ? [] : r.errors;
  };

  it("accepts each type with its fields", () => {
    expect(errs({ type: "multipleChoice", options: ["Paris", "Rome"], answer: "paris" })).toEqual([]);
    expect(errs({ type: "trueFalse", answer: "false" })).toEqual([]);
    expect(errs({ type: "closest", target: 8849, answer: "" })).toEqual([]);
    expect(errs({ type: "order", options: ["a", "b", "c", "d"], question: "", answer: "" })).toEqual([]);
    expect(errs({ type: "connection", options: ["a", "b", "c", "d"], question: "", answer: "Planets" })).toEqual([]);
    expect(errs({ type: "picture", media: { type: "image", src: "https://x.test/a.png" } })).toEqual([]);
  });

  it("explains what's missing", () => {
    expect(errs({ type: "multipleChoice", options: ["Paris", "Rome"], answer: "Oslo" })[0]).toMatch(/one of the choices/);
    expect(errs({ type: "trueFalse", answer: "Maybe" })[0]).toMatch(/True or False/);
    expect(errs({ type: "closest" })[0]).toMatch(/target number/);
    expect(errs({ type: "order", options: ["a", "b"] })[0]).toMatch(/exactly 4 items/);
    expect(errs({ type: "video" })[0]).toMatch(/needs a video/);
    expect(errs({ type: "wager", bonus: true })[0]).toMatch(/can't also be a bonus/);
    expect(errs({ type: "nonsense" })[0]).toMatch(/type must be one of/);
  });

  it("normalizes answers and keeps the type through export", () => {
    const r = validateGame(withTile(plainGame(), 0, 0, { type: "trueFalse", answer: "t" }));
    expect(r.ok && r.game.categories[0].questions[0]).toMatchObject({ type: "trueFalse", answer: "True" });
  });
});
