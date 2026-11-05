"use client";

import { useEffect, useRef, useState } from "react";
import { toHostView, toPlayerView, type Action, type GameState } from "@/lib/game";
import { connectRoom, type LinkStatus, type RoomLink, type RoomSettings } from "./room";

/** The host counts as connected if we heard from them this recently. */
const HOST_TIMEOUT_MS = 25_000;

/**
 * TV side of the room: applies actions from the host's phone, adds players who
 * join from theirs, answers hellos with the full state, and pushes fresh views
 * whenever the game changes.
 */
export function useRoomHost({
  roomCode,
  nightId = null,
  state,
  settings,
  dispatch,
  setMuted,
}: {
  roomCode: string | null;
  /** Season night id, passed to players so their phones can register for it. */
  nightId?: string | null;
  state: GameState | null;
  settings: RoomSettings;
  dispatch: (action: Action) => string | null;
  setMuted: (muted: boolean) => void;
}) {
  const [link, setLink] = useState<RoomLink | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [hostSeenAt, setHostSeenAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Latest values for the message handlers, which are registered once per room.
  const latest = useRef({ state, settings, dispatch, setMuted, nightId });
  useEffect(() => {
    latest.current = { state, settings, dispatch, setMuted, nightId };
  });

  useEffect(() => {
    if (!roomCode) return;
    const room = connectRoom(roomCode);
    const sendState = () => {
      const { state, settings } = latest.current;
      if (state) room.send("state", { view: toHostView(state, Date.now()), settings });
    };
    const sendPlayers = () => {
      const { state, nightId } = latest.current;
      if (state) room.send("players", { view: toPlayerView(state), nightId });
    };
    const seen = () => setHostSeenAt(Date.now());

    const offs = [
      room.onStatus(setStatus),
      room.on("hello", () => {
        seen();
        sendState();
      }),
      room.on("ping", seen),
      room.on("action", ({ clientId, id, action }) => {
        seen();
        const error = latest.current.dispatch(action);
        room.send("ack", { clientId, id, error });
        // On error the state didn't change, so no state push would follow;
        // send one anyway so a confused phone resyncs.
        if (error) sendState();
      }),
      room.on("settings", ({ settings }) => {
        seen();
        latest.current.setMuted(settings.muted);
      }),
      room.on("playerHello", sendPlayers),
      room.on("join", ({ clientId, player }) => {
        const error = latest.current.dispatch({ type: "addPlayer", player });
        room.send("joinResult", { clientId, error });
        // Answer right away too, so a rejoining phone gets the view even if nothing changed.
        sendPlayers();
      }),
    ];
    setLink(room);
    return () => {
      offs.forEach((off) => off());
      room.close();
      setLink(null);
    };
  }, [roomCode]);

  // Push the host view on every change (including timer start/pause).
  useEffect(() => {
    if (link && state) link.send("state", { view: toHostView(state, Date.now()), settings });
  }, [link, state, settings]);

  // Players only care about teams, scores and the phase, not the timer.
  const playerView = state ? JSON.stringify(toPlayerView(state)) : null;
  useEffect(() => {
    if (link && playerView) link.send("players", { view: JSON.parse(playerView), nightId });
  }, [link, playerView, nightId]);

  // Re-evaluate "host connected" every few seconds.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const hostConnected = hostSeenAt !== null && (now === 0 || now - hostSeenAt < HOST_TIMEOUT_MS);
  return { status, hostConnected };
}
