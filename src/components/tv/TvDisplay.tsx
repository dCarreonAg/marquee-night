"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { PublicView } from "@/lib/game";
import { Board } from "./Board";
import { BonusScreen } from "./BonusScreen";
import { FinalQuestionScreen, FinalRevealScreen, FinalWagerScreen } from "./FinalScreens";
import { Lobby } from "./Lobby";
import { FLIP_COVER_S, TileFlip, TvMemoryProvider } from "./motion";
import { QuestionScreen } from "./QuestionScreen";
import { RevealScreen } from "./RevealScreen";
import { WinnerScreen, type RecordStatus } from "./WinnerScreen";

/**
 * Everything the room sees. Takes a PublicView only, which never carries an
 * unrevealed answer, so nothing here can leak one onto the big screen.
 */
export function TvDisplay({
  view,
  roomCode,
  joinUrl,
  hostUrl,
  hostConnected,
  localOnly,
  ranked = false,
  record = "off",
  onPick,
}: {
  view: PublicView;
  roomCode: string;
  joinUrl: string;
  hostUrl: string;
  hostConnected: boolean;
  localOnly: boolean;
  ranked?: boolean;
  record?: RecordStatus;
  onPick?: (col: number, row: number) => void;
}) {
  const p = view.phase;
  // Steal attempts re-render in place; everything else crossfades.
  const key = "tile" in p ? `${p.kind}-${p.tile.col}-${p.tile.row}` : p.kind;

  let screen: React.ReactNode;
  switch (p.kind) {
    case "lobby":
      screen = (
        <Lobby
          view={view}
          roomCode={roomCode}
          joinUrl={joinUrl}
          hostUrl={hostUrl}
          hostConnected={hostConnected}
          localOnly={localOnly}
          ranked={ranked}
        />
      );
      break;
    case "board":
      screen = <Board view={view} roomCode={roomCode} hostConnected={hostConnected} onPick={onPick} />;
      break;
    case "bonusReveal":
      screen = <BonusScreen phase={p} teams={view.teams} />;
      break;
    case "question":
      screen = <QuestionScreen phase={p} teams={view.teams} />;
      break;
    case "reveal":
      screen = <RevealScreen phase={p} teams={view.teams} />;
      break;
    case "finalWager":
      screen = <FinalWagerScreen phase={p} teams={view.teams} />;
      break;
    case "finalQuestion":
      screen = <FinalQuestionScreen phase={p} teams={view.teams} />;
      break;
    case "finalReveal":
      screen = <FinalRevealScreen phase={p} teams={view.teams} />;
      break;
    case "winner":
      screen = <WinnerScreen view={view} record={record} />;
      break;
  }

  // The flip plays once per tile: it stays mounted (same key) from the bonus
  // reveal through the question and any steal, so it doesn't replay.
  const flip =
    p.kind === "question" || p.kind === "bonusReveal" ? (
      <TileFlip key={`flip-${p.tile.col}-${p.tile.row}`} tile={p.tile} value={p.value} />
    ) : null;

  return (
    <MotionConfig reducedMotion="user">
      <TvMemoryProvider>
        <AnimatePresence mode="wait" initial={false} custom={p.kind}>
          <motion.div
            key={key}
            className="absolute inset-0"
            custom={p.kind}
            variants={screenVariants(p.kind)}
            initial="enter"
            animate="show"
            exit="exit"
          >
            {screen}
          </motion.div>
        </AnimatePresence>
        {flip}
      </TvMemoryProvider>
    </MotionConfig>
  );
}

/**
 * Screen transitions. `custom` is the kind of the screen coming in; the exiting
 * screen knows its own kind. When a tile is opened from the board, the board
 * stays put until the flipping tile covers it, then cuts.
 */
function screenVariants(ownKind: PublicView["phase"]["kind"]) {
  return {
    enter: { opacity: 0, scale: 0.97 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    exit: (incoming: PublicView["phase"]["kind"]) =>
      ownKind === "board" && (incoming === "question" || incoming === "bonusReveal")
        ? { opacity: 0, transition: { delay: FLIP_COVER_S, duration: 0 } }
        : { opacity: 0, scale: 1.02, transition: { duration: 0.3 } },
  };
}
