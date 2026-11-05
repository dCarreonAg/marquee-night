"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LocalControls } from "@/components/tv/LocalControls";
import { Stage } from "@/components/tv/Stage";
import { TvDisplay } from "@/components/tv/TvDisplay";
import type { RecordStatus } from "@/components/tv/WinnerScreen";
import { submitResults } from "@/lib/leaderboard";
import { isLocalOnly } from "@/lib/realtime/room";
import { useRoomHost } from "@/lib/realtime/useRoomHost";
import { useGameSounds } from "@/lib/useGameSounds";
import { useTvGame } from "@/lib/useTvGame";

const subscribeNoop = () => () => {};
const RETRY_MS = 10_000;

export default function TvPage() {
  const { status, session, state, publicView, dispatch, error, setMuted, markRecorded } = useTvGame();
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
  const muted = !!session?.muted;
  const settings = useMemo(() => ({ muted }), [muted]);
  const nightId = session?.nightId ?? null;
  const nightToken = session?.nightToken ?? null;
  const { hostConnected } = useRoomHost({
    roomCode: session?.roomCode ?? null,
    nightId,
    state,
    settings,
    dispatch,
    setMuted,
  });
  const { needsUnlock } = useGameSounds(publicView, muted);
  const record = useRecordResults(nightId, nightToken, session?.recorded ?? false, state, markRecorded);

  if (status === "loading") return <div className="fixed inset-0 bg-bg" />;

  if (status === "missing" || !session || !publicView) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-xl text-text-muted">No game is set up on this screen yet.</p>
        <Link href="/" className="rounded-xl bg-gold px-6 py-3 font-semibold text-bg">
          Set up a game
        </Link>
      </main>
    );
  }

  return (
    <>
      <Stage>
        <TvDisplay
          view={publicView}
          roomCode={session.roomCode}
          joinUrl={`${origin}/play?room=${session.roomCode}`}
          hostUrl={`${origin}/host`}
          hostConnected={hostConnected}
          localOnly={isLocalOnly}
          ranked={!!nightId}
          record={record}
          onPick={(col, row) => dispatch({ type: "pickTile", col, row })}
        />
      </Stage>
      {needsUnlock && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 rounded-full bg-panel/90 px-4 py-2 text-sm text-text-muted ring-1 ring-panel-border">
          Click anywhere to turn on sound
        </div>
      )}
      <LocalControls
        view={publicView}
        dispatch={dispatch}
        error={error}
        muted={muted}
        onToggleMute={() => setMuted(!muted)}
      />
    </>
  );
}

/** Saves a ranked night once the winner is shown, retrying until it sticks. */
function useRecordResults(
  nightId: string | null,
  nightToken: string | null,
  recorded: boolean,
  state: ReturnType<typeof useTvGame>["state"],
  markRecorded: () => void,
): RecordStatus {
  const [failed, setFailed] = useState(false);
  const atWinner = state?.phase.kind === "winner";
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!nightId || !nightToken || recorded || !atWinner) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      const current = stateRef.current;
      if (!current) return;
      const err = await submitResults(nightId, nightToken, current);
      if (cancelled) return;
      if (err) {
        console.error("Could not save the night:", err);
        setFailed(true);
        timer = setTimeout(attempt, RETRY_MS);
      } else {
        setFailed(false);
        markRecorded();
      }
    };
    attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nightId, nightToken, recorded, atWinner, markRecorded]);

  if (!nightId) return "off";
  if (recorded) return "saved";
  return failed ? "error" : "saving";
}
