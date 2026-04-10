import { useState, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  FileVideo,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePausePlayer,
  useResumePlayer,
  useStopPlayer,
  useSeekPlayer,
  useSetVolume,
  useSetFullscreen,
  type PlayerStatus,
} from "@/lib/hooks/api/use-player";

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) return <VolumeX className="size-4" />;
  if (volume < 50) return <Volume1 className="size-4" />;
  return <Volume2 className="size-4" />;
}

// ---------------------------------------------------------------------------
// Seek scrubber
// ---------------------------------------------------------------------------
function SeekBar({
  position,
  duration,
  onSeek,
}: {
  position: number | null | undefined;
  duration: number | null | undefined;
  onSeek: (seconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPct, setLocalPct] = useState<number | null>(null);

  const pct =
    localPct !== null
      ? localPct
      : position != null && duration != null && duration > 0
        ? Math.min((position / duration) * 100, 100)
        : 0;

  function pctFromEvent(e: React.PointerEvent | React.TouchEvent): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.PointerEvent).clientX;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * 100;
  }

  function commitSeek(pct: number) {
    if (duration == null) return;
    onSeek((pct / 100) * duration);
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pctFromEvent(e);
    setDragging(true);
    setLocalPct(p);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setLocalPct(pctFromEvent(e));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    const p = pctFromEvent(e);
    setDragging(false);
    setLocalPct(null);
    commitSeek(p);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="Seek"
      className="relative w-full h-5 flex items-center cursor-pointer group/seek touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Track */}
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden group-hover/seek:h-1.5 transition-all duration-150">
        <div
          className="h-full bg-primary rounded-full transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Thumb — visible on hover / drag */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3.5 rounded-full bg-primary shadow transition-opacity duration-150",
          dragging ? "opacity-100" : "opacity-0 group-hover/seek:opacity-100",
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume control
// ---------------------------------------------------------------------------
function VolumeControl({
  volume,
  onVolume,
}: {
  volume: number;
  onVolume: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onVolume(volume === 0 ? 50 : 0)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={volume === 0 ? "Unmute" : "Mute"}
      >
        <VolumeIcon volume={volume} />
      </button>
      <input
        type="range"
        min={0}
        max={130}
        step={1}
        value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        className={cn(
          "w-20 sm:w-24 h-1.5 appearance-none rounded-full cursor-pointer",
          "bg-muted accent-primary",
        )}
        aria-label="Volume"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconButton helper
// ---------------------------------------------------------------------------
function IconButton({
  onClick,
  disabled,
  className,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex items-center justify-center size-10 rounded-lg transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PlayerBar
// ---------------------------------------------------------------------------
interface PlayerBarProps {
  status: PlayerStatus;
}

export function PlayerBar({ status }: PlayerBarProps) {
  const pause = usePausePlayer();
  const resume = useResumePlayer();
  const stop = useStopPlayer();
  const seek = useSeekPlayer();
  const setVolume = useSetVolume();
  const setFullscreen = useSetFullscreen();

  const isPaused = status.paused ?? false;
  const volume = status.volume ?? 100;
  const isFullscreen = status.fullscreen ?? false;

  const title = status.title ?? "Unknown";
  const nameWithoutExt = title.includes(".")
    ? title.slice(0, title.lastIndexOf("."))
    : title;

  return (
    <div className="shrink-0 border-t border-border bg-card text-card-foreground">
      {/* Seek scrubber — full width, flush to the top edge */}
      <div className="px-4 pt-2">
        <SeekBar
          position={status.position}
          duration={status.duration}
          onSeek={(pos) => seek.mutate(pos)}
        />
      </div>

      {/*
        Two-row layout on mobile, single row on sm+
        Mobile:
          Row A  [icon + title/time]          [fullscreen]
          Row B  [volume control]    [play/pause + stop]
        sm+:
          [icon + title/time]  [volume]  [play/pause + stop]  [fullscreen]
      */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 pb-3 pt-1">
        {/* ── Row A / Left: icon + title + timestamp ── */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center justify-center size-8 rounded-md bg-primary/10 border border-border shrink-0">
            <FileVideo className="size-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-none">
              {nameWithoutExt}
            </p>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              {formatTime(status.position)}
              <span className="mx-1 opacity-40">/</span>
              {formatTime(status.duration)}
            </p>
          </div>

          {/* Fullscreen — shown inline with title on mobile (right side of row A) */}
          <IconButton
            onClick={() => setFullscreen.mutate(!isFullscreen)}
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="sm:hidden text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {isFullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </IconButton>
        </div>

        {/* ── Row B / Right: volume + controls + fullscreen ── */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
          {/* Volume */}
          <VolumeControl
            volume={volume}
            onVolume={(v) => setVolume.mutate(v)}
          />

          {/* Play / Pause + Stop */}
          <div className="flex items-center gap-2">
            <IconButton
              onClick={() => (isPaused ? resume.mutate() : pause.mutate())}
              disabled={pause.isPending || resume.isPending}
              label={isPaused ? "Resume" : "Pause"}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPaused ? (
                <Play className="size-4 fill-current" />
              ) : (
                <Pause className="size-4 fill-current" />
              )}
            </IconButton>

            <IconButton
              onClick={() => stop.mutate()}
              disabled={stop.isPending}
              label="Stop"
              className="bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            >
              <Square className="size-3.5 fill-current" />
            </IconButton>
          </div>

          {/* Fullscreen — hidden on mobile, shown on sm+ */}
          <IconButton
            onClick={() => setFullscreen.mutate(!isFullscreen)}
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="hidden sm:flex text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {isFullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
