"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Action, HostView, PlayerView } from "@/lib/game";

/**
 * Messages on a room channel. The TV owns the game; the host's phone sends
 * actions and receives a HostView (with the answer). Players' phones only
 * join and receive a PlayerView (no question, no answer). Nothing a phone
 * sends ever contains an answer, and the TV only renders its own PublicView.
 */
export interface RoomSettings {
  muted: boolean;
}

export interface RoomEvents {
  /** phone → TV: "I'm here, send me the full state" (on join, rejoin, wake). */
  hello: { clientId: string };
  /** phone → TV: keep-alive so the TV can show "host connected". */
  ping: { clientId: string };
  /** phone → TV */
  action: { clientId: string; id: string; action: Action };
  /** phone → TV */
  settings: { clientId: string; settings: RoomSettings };
  /** TV → phone */
  state: { view: HostView; settings: RoomSettings };
  /** TV → phone: result of one action. */
  ack: { clientId: string; id: string; error: string | null };
  /** player → TV: "send me the player view" (on join, rejoin, wake). */
  playerHello: { clientId: string };
  /** player → TV: wants in with a name (repeated on reconnect; joining is idempotent). */
  join: { clientId: string; player: { id: string; name: string } };
  /** TV → player: why a join was refused (e.g. the name is taken), or null once they're in. */
  joinResult: { clientId: string; error: string | null };
  /** TV → players. `nightId` is set when the night counts toward the season leaderboard. */
  players: { view: PlayerView; nightId: string | null };
}

export type RoomEvent = keyof RoomEvents;
export type LinkStatus = "connecting" | "live" | "offline";

const EVENTS: RoomEvent[] = ["hello", "ping", "action", "settings", "state", "ack", "playerHello", "join", "joinResult", "players"];

export interface RoomLink {
  send<E extends RoomEvent>(event: E, payload: RoomEvents[E]): void;
  on<E extends RoomEvent>(event: E, handler: (payload: RoomEvents[E]) => void): () => void;
  onStatus(handler: (status: LinkStatus) => void): () => void;
  close(): void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Without Supabase keys we fall back to BroadcastChannel, which only links tabs
 * in the same browser. Handy for development; useless for a real phone.
 */
export const isLocalOnly = !SUPABASE_URL || !SUPABASE_KEY;

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

export function channelName(roomCode: string) {
  return `marquee-night:${roomCode.toUpperCase()}`;
}

export function connectRoom(roomCode: string): RoomLink {
  const listeners = new Map<RoomEvent, Set<(p: never) => void>>();
  const statusListeners = new Set<(s: LinkStatus) => void>();
  let status: LinkStatus = "connecting";

  const emit = (event: RoomEvent, payload: unknown) => {
    listeners.get(event)?.forEach((h) => (h as (p: unknown) => void)(payload));
  };
  const setStatus = (s: LinkStatus) => {
    status = s;
    statusListeners.forEach((h) => h(s));
  };

  let sendRaw: (event: RoomEvent, payload: unknown) => void;
  let closeRaw: () => void;

  if (isLocalOnly) {
    const bc = new BroadcastChannel(channelName(roomCode));
    bc.onmessage = (e: MessageEvent<{ event: RoomEvent; payload: unknown }>) => emit(e.data.event, e.data.payload);
    sendRaw = (event, payload) => bc.postMessage({ event, payload });
    closeRaw = () => bc.close();
    queueMicrotask(() => setStatus("live"));
  } else {
    const channel: RealtimeChannel = supabase().channel(channelName(roomCode), {
      config: { broadcast: { self: false, ack: false } },
    });
    for (const event of EVENTS) {
      channel.on("broadcast", { event }, (msg) => emit(event, msg.payload));
    }
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("live");
      else if (s === "CLOSED") setStatus("offline");
      else setStatus("connecting"); // TIMED_OUT / CHANNEL_ERROR: supabase-js retries the join
    });
    sendRaw = (event, payload) => {
      channel.send({ type: "broadcast", event, payload }).catch(() => {});
    };
    closeRaw = () => {
      supabase().removeChannel(channel);
    };
  }

  return {
    send: (event, payload) => sendRaw(event, payload),
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      const set = listeners.get(event)!;
      set.add(handler as (p: never) => void);
      return () => set.delete(handler as (p: never) => void);
    },
    onStatus: (handler) => {
      statusListeners.add(handler);
      handler(status);
      return () => statusListeners.delete(handler);
    },
    close: () => {
      statusListeners.clear();
      listeners.clear();
      closeRaw();
    },
  };
}

/** Works on plain http too (a phone hitting a dev server by LAN IP), unlike randomUUID. */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
}
