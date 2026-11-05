"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/lib/game";
import { connectRoom, randomId, type LinkStatus } from "./room";

const HELLO_RETRY_MS = 3000;

export interface PlayerIdentity {
  id: string;
  name: string;
}

/**
 * A player's phone: joins the room with a name and follows the PlayerView.
 * Re-sends the join on every reconnect (joining is idempotent), so a TV
 * refresh or a sleeping phone sorts itself out.
 */
export function useRoomPlayer(roomCode: string | null, player: PlayerIdentity | null) {
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [view, setView] = useState<PlayerView | null>(null);
  const [nightId, setNightId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const clientId = useRef("");

  const id = player?.id ?? null;
  const name = player?.name ?? null;

  useEffect(() => {
    if (!roomCode || !id || !name) return;
    clientId.current ||= randomId();
    let joined = false;
    let refused = false;
    // Removed by the host: don't sneak back in when the phone wakes up.
    let removed = false;
    const room = connectRoom(roomCode);
    const hello = () => {
      if (!removed) room.send("join", { clientId: clientId.current, player: { id, name } });
      room.send("playerHello", { clientId: clientId.current });
    };

    const offs = [
      room.onStatus((s) => {
        setStatus(s);
        if (s === "live") hello();
      }),
      room.on("players", ({ view, nightId }) => {
        const listed = view.players.some((p) => p.id === id);
        if (joined && !listed) removed = true;
        if (listed) joined = true;
        setView(view);
        setNightId(nightId);
      }),
      room.on("joinResult", ({ clientId: to, error }) => {
        if (to !== clientId.current) return;
        refused = error !== null;
        setJoinError(error);
      }),
    ];
    // The TV may not be open yet: keep knocking until we're on its list.
    const timer = setInterval(() => {
      if (!joined && !refused) hello();
    }, HELLO_RETRY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") hello();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      offs.forEach((off) => off());
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      room.close();
    };
  }, [roomCode, id, name]);

  return { status, view, nightId, joinError };
}
