"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, RuleError, toPublicView, type Action, type GameState, type PublicView } from "@/lib/game";
import { loadSession, saveSession, type Session } from "@/lib/session";

export type TvStatus = "loading" | "missing" | "ready";

/**
 * The TV owns the game state: it applies actions (from the laptop controls now,
 * from the host's phone in phase 3) and persists every change so a refresh
 * resumes the game.
 */
export function useTvGame() {
  // The public view is built alongside each state change (not during render),
  // so its timer snapshot is taken at the moment the state changed.
  const [{ session, publicView }, setCurrent] = useState<{ session: Session | null; publicView: PublicView | null }>({
    session: null,
    publicView: null,
  });
  const [status, setStatus] = useState<TvStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((s) => {
      if (cancelled) return;
      sessionRef.current = s;
      setCurrent({ session: s, publicView: s ? toPublicView(s.state, Date.now()) : null });
      setStatus(s ? "ready" : "missing");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Applies an action; returns an error message if the rules don't allow it. */
  const dispatch = useCallback((action: Action): string | null => {
    const current = sessionRef.current;
    if (!current) return "No game loaded.";
    let state: GameState;
    try {
      state = applyAction(current.state, action, Date.now());
    } catch (e) {
      const message = e instanceof RuleError ? e.message : "Something went wrong.";
      if (!(e instanceof RuleError)) console.error(e);
      // A refused join (name taken) is the player's problem, shown on their phone.
      if (action.type !== "addPlayer") setError(message);
      return message;
    }
    const next = { ...current, state, updatedAt: Date.now() };
    sessionRef.current = next;
    setCurrent({ session: next, publicView: toPublicView(state, Date.now()) });
    setError(null);
    saveSession(next).catch((err) => console.error("Could not save the game", err));
    return null;
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    const current = sessionRef.current;
    if (!current || !!current.muted === muted) return;
    const next = { ...current, muted };
    sessionRef.current = next;
    setCurrent((c) => ({ ...c, session: next }));
    saveSession(next).catch((err) => console.error("Could not save the game", err));
  }, []);

  const markRecorded = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.recorded) return;
    const next = { ...current, recorded: true };
    sessionRef.current = next;
    setCurrent((c) => ({ ...c, session: next }));
    saveSession(next).catch((err) => console.error("Could not save the game", err));
  }, []);

  return {
    status,
    setMuted,
    markRecorded,
    session,
    state: session?.state ?? null,
    publicView,
    dispatch,
    error,
    clearError: () => setError(null),
  };
}
