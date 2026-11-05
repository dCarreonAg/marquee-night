"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PlayerScreen } from "@/components/play/PlayerScreen";
import { Wordmark } from "@/components/tv/parts";
import { MAX_PLAYER_NAME } from "@/lib/game";
import { randomId } from "@/lib/realtime/room";
import { useRoomPlayer } from "@/lib/realtime/useRoomPlayer";

const CODE_PATTERN = /^[A-Z0-9]{4}$/;
const ID_KEY = "marquee-night:player-id";
const NAME_KEY = "marquee-night:player-name";

const subscribeNoop = () => () => {};
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** This phone's player id: kept so a refresh rejoins as the same player (same team). */
function playerId(): string {
  let id = read(ID_KEY);
  if (!id) {
    id = randomId() + randomId();
    write(ID_KEY, id);
  }
  return id;
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <Play />
    </Suspense>
  );
}

function Play() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("room")?.toUpperCase() ?? "";
  const room = CODE_PATTERN.test(raw) ? raw : null;
  const [name, setName] = useState<string | null>(null);
  // Why the last join was refused (e.g. the name is taken), shown on the name form.
  const [nameError, setNameError] = useState<string | null>(null);
  const changeName = useCallback((error: string | null) => {
    setName(null);
    setNameError(error);
  }, []);

  return (
    <main className="bg-board-glow mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="mb-5 py-2">
        <Wordmark size={30} />
      </header>

      {!room ? (
        <CodeForm onJoin={(code) => router.replace(`/play?room=${code}`)} />
      ) : name === null ? (
        <NameForm room={room} error={nameError} onJoin={setName} />
      ) : (
        <Joined room={room} name={name} onChangeName={changeName} />
      )}
    </main>
  );
}

function CodeForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  const valid = CODE_PATTERN.test(code);
  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onJoin(code);
      }}
    >
      <label htmlFor="room" className="text-center font-mono text-[12px] uppercase tracking-[0.2em] text-text-muted">
        Enter the room code on the TV
      </label>
      <input
        id="room"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="K7QX"
        className="h-[96px] w-full rounded-[18px] border-[3px] border-gold bg-panel text-center font-display text-[64px] font-black tracking-[0.2em] text-gold outline-none placeholder:text-text-dim/40"
      />
      <button
        type="submit"
        disabled={!valid}
        className="h-[72px] rounded-[16px] bg-gold font-display text-[24px] font-black uppercase tracking-[0.08em] text-bg disabled:opacity-40"
      >
        Next
      </button>
      <Link href="/leaderboard" className="mt-4 text-center text-[14px] font-semibold text-text-dim underline">
        Season leaderboard
      </Link>
    </form>
  );
}

function NameForm({ room, error, onJoin }: { room: string; error: string | null; onJoin: (name: string) => void }) {
  const remembered = useSyncExternalStore(subscribeNoop, () => read(NAME_KEY) ?? "", () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? remembered;
  const clean = value.trim().replace(/\s+/g, " ");

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!clean) return;
        write(NAME_KEY, clean);
        onJoin(clean);
      }}
    >
      <div className="text-center font-mono text-[13px] tracking-[0.2em] text-text-dim">ROOM {room}</div>
      <label htmlFor="name" className="text-center font-display text-[40px] font-black uppercase leading-none">
        What&apos;s your name?
      </label>
      <input
        id="name"
        value={value}
        onChange={(e) => setTyped(e.target.value.slice(0, MAX_PLAYER_NAME))}
        autoComplete="nickname"
        autoCapitalize="words"
        enterKeyHint="go"
        placeholder="Your name"
        className="h-[72px] w-full rounded-[18px] border-[3px] border-gold bg-panel px-5 text-center text-[28px] font-semibold outline-none placeholder:text-text-dim/50"
      />
      {error && <p className="text-center text-[15px] font-semibold text-wrong-soft">{error}</p>}
      <p className="text-center text-[13px] text-text-dim">
        Use the same name every night: it&apos;s how the season leaderboard knows you.
      </p>
      <button
        type="submit"
        disabled={!clean}
        className="h-[72px] rounded-[16px] bg-gold font-display text-[24px] font-black uppercase tracking-[0.08em] text-bg disabled:opacity-40"
      >
        Join
      </button>
      <Link href={`/host?room=${room}`} className="mt-2 text-center text-[14px] font-semibold text-text-dim underline">
        I&apos;m the host
      </Link>
    </form>
  );
}

function Joined({ room, name, onChangeName }: { room: string; name: string; onChangeName: (error: string | null) => void }) {
  const [id] = useState(playerId);
  const { status, view, nightId, joinError } = useRoomPlayer(room, { id, name });
  const inGame = !!view?.players.some((p) => p.id === id);
  const [wasIn, setWasIn] = useState(false);
  if (inGame && !wasIn) setWasIn(true);

  // Name refused (taken): back to the name form with the reason.
  useEffect(() => {
    if (joinError) onChangeName(joinError);
  }, [joinError, onChangeName]);

  if (view && inGame) {
    return <PlayerScreen view={view} me={id} room={room} live={status === "live"} ranked={!!nightId} onChangeName={() => onChangeName(null)} />;
  }

  if (view && wasIn) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="text-[20px] font-semibold">The host took you out of the game.</div>
        <button type="button" onClick={() => onChangeName(null)} className="h-12 rounded-[14px] bg-gold px-6 font-semibold text-bg">
          Join again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-panel-border border-t-gold" />
      <div className="text-[18px] font-semibold">Joining room {room} as {name}…</div>
      <p className="max-w-[300px] text-[15px] text-text-muted">
        {status === "offline" ? "You're offline. Reconnecting…" : "Make sure the game is open on the big screen."}
      </p>
      <button type="button" onClick={() => onChangeName(null)} className="h-11 px-4 text-[15px] font-semibold text-text-dim underline">
        Change name
      </button>
    </div>
  );
}
