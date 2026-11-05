"use client";

import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Player, PublicView } from "@/lib/game";
import { Eyebrow, TeamDot, Wordmark } from "./parts";

export function Lobby({
  view,
  roomCode,
  joinUrl,
  hostUrl,
  hostConnected,
  localOnly,
  ranked,
}: {
  view: PublicView;
  roomCode: string;
  /** Where players go (the QR code). */
  joinUrl: string;
  /** Where the host goes, shown as text. */
  hostUrl: string;
  hostConnected: boolean;
  localOnly: boolean;
  /** This night counts toward the season leaderboard. */
  ranked: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 680,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#050818", light: "#eef1ff" },
    }).then(setQr, () => setQr(null));
  }, [joinUrl]);

  const strip = (url: string) => url.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
  const benched = view.players.filter((p) => !p.teamId || !view.teams.some((t) => t.id === p.teamId));

  return (
    <div className="bg-board-glow flex h-full items-center gap-[80px] px-[100px]">
      <div className="flex h-full min-w-0 flex-1 flex-col justify-center py-[70px]">
        <Wordmark size={140} />
        <div className="mt-6 flex items-center gap-6 text-[44px] font-semibold text-text-muted">
          {view.title}
          {ranked && (
            <span className="rounded-full border-2 border-gold/60 px-5 py-1 font-mono text-[18px] tracking-[0.2em] text-gold">
              SEASON NIGHT · RANKED
            </span>
          )}
        </div>

        <Eyebrow className="mt-[60px]">
          Teams · turn order {view.players.length > 0 && `· ${view.players.length} playing`}
        </Eyebrow>
        <div className={`mt-6 grid gap-5 ${view.teams.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
          {view.teams.map((t, i) => {
            const members = view.players.filter((p) => p.teamId === t.id);
            return (
              <div key={t.id} className="flex min-h-[150px] flex-col gap-3 rounded-[18px] border-2 border-panel-border bg-panel px-6 py-5">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[18px] text-text-dim">{i + 1}</span>
                  <TeamDot color={t.color} size={22} />
                  <span className="truncate text-[32px] font-semibold">{t.name}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {members.map((p) => (
                      <PlayerPill key={p.id} player={p} color={t.color} />
                    ))}
                  </AnimatePresence>
                  {members.length === 0 && <span className="text-[20px] text-text-dim">Waiting for players…</span>}
                </div>
              </div>
            );
          })}
        </div>
        {benched.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-2 font-mono text-[16px] tracking-[0.2em] text-text-dim">NOT ON A TEAM</span>
            {benched.map((p) => (
              <PlayerPill key={p.id} player={p} color="#7d88c4" />
            ))}
          </div>
        )}
      </div>

      <div className="flex w-[520px] shrink-0 flex-col items-center rounded-[20px] border-2 border-panel-border bg-panel px-12 py-12">
        <Eyebrow tone="text-gold">Players · scan to join</Eyebrow>
        <div className="mt-6 flex h-[320px] w-[320px] items-center justify-center overflow-hidden rounded-[14px] bg-text">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URI */}
          {qr && <img src={qr} alt={`QR code for ${joinUrl}`} className="h-full w-full" />}
        </div>
        <div className="mt-6 font-display text-[120px] font-black leading-none tracking-[0.12em] text-glow-gold">
          {roomCode}
        </div>
        <div className="mt-3 font-mono text-[20px] tracking-[0.1em] text-text-dim">{strip(joinUrl)}</div>
        <div className="mt-6 h-px w-full bg-panel-border" />
        <div className="mt-5 text-center text-[20px] text-text-muted">
          Host: open <span className="font-mono text-text">{strip(hostUrl)}</span> and enter the code
        </div>
        <div
          className={`mt-4 flex items-center gap-3 rounded-full px-6 py-2 font-mono text-[18px] tracking-[0.16em] ${hostConnected ? "bg-correct/15 text-correct-soft" : "bg-bg/60 text-text-dim"}`}
        >
          <span className={`h-3 w-3 rounded-full ${hostConnected ? "bg-correct-soft" : "animate-pulse bg-text-dim"}`} />
          {hostConnected ? "HOST CONNECTED" : "WAITING FOR HOST"}
        </div>
        {localOnly && (
          <div className="mt-4 max-w-[440px] text-center text-[17px] leading-snug text-gold">
            Realtime isn&apos;t configured, so only another tab in this browser can connect. Add the Supabase keys to
            pair phones.
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerPill({ player, color }: { player: Player; color: string }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      className="flex items-center gap-2 rounded-full bg-bg/70 py-1 pr-4 pl-1 text-[22px] font-semibold"
      style={{ boxShadow: `inset 0 0 0 2px ${color}66` }}
    >
      <Avatar player={player} size={34} />
      {player.name}
    </motion.span>
  );
}

/** A player's initial in a circle. */
export function Avatar({ player, size }: { player: Pick<Player, "name">; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-cat-bg font-display font-black uppercase text-text-muted"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {player.name.slice(0, 1)}
    </span>
  );
}
