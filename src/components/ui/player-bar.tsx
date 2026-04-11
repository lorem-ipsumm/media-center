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
  SkipBack,
  SkipForward,
  Captions,
  CaptionsOff,
  Gauge,
  Monitor,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  usePausePlayer,
  useResumePlayer,
  useStopPlayer,
  useSeekPlayer,
  useSkipPlayer,
  useSetVolume,
  useSetFullscreen,
  useSetSubtitle,
  useSetSpeed,
  type PlayerStatus,
  type SubtitleTrack,
} from "@/lib/hooks/api/use-player";
import { useSetDisplayMode } from "@/lib/hooks/api/use-system";

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
// Playback speed selector
// ---------------------------------------------------------------------------
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function SpeedSelector({
  speed,
  onSelect,
}: {
  speed: number;
  onSelect: (speed: number) => void;
}) {
  const isNormal = speed === 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Playback speed"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
          "border border-border bg-muted hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          isNormal ? "text-muted-foreground" : "text-primary border-primary/40",
        )}
      >
        <Gauge className="size-3.5 shrink-0" />
        <span className="tabular-nums">{speed === 1 ? "1×" : `${speed}×`}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" className="min-w-[120px]">
        <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={speed.toString()}
          onValueChange={(val) => onSelect(Number(val))}
        >
          {SPEEDS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s.toString()}>
              {s === 1 ? "1× Normal" : `${s}×`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Subtitle selector
// ---------------------------------------------------------------------------
function SubtitleSelector({
  subtitles,
  onSelect,
}: {
  subtitles: SubtitleTrack[];
  onSelect: (id: number | "no") => void;
}) {
  const active = subtitles.find((t) => t.selected);

  function label(t: SubtitleTrack): string {
    const parts = [t.title, t.lang ? `(${t.lang})` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : `Track ${t.id}`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Subtitle track"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
          "border border-border bg-muted hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          active ? "text-primary border-primary/40" : "text-muted-foreground",
        )}
      >
        {active ? (
          <Captions className="size-3.5 shrink-0" />
        ) : (
          <CaptionsOff className="size-3.5 shrink-0" />
        )}
        <span className="hidden sm:inline max-w-[90px] truncate">
          {active ? label(active) : "Off"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="end" className="min-w-[160px]">
        <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={active?.id.toString() ?? "no"}
          onValueChange={(val) => onSelect(val === "no" ? "no" : Number(val))}
        >
          <DropdownMenuRadioItem value="no">Off</DropdownMenuRadioItem>
          {subtitles.map((t) => (
            <DropdownMenuRadioItem key={t.id} value={t.id.toString()}>
              {label(t)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const skip = useSkipPlayer();
  const setVolume = useSetVolume();
  const setFullscreen = useSetFullscreen();
  const setSubtitle = useSetSubtitle();
  const setSpeed = useSetSpeed();
  const setDisplayMode = useSetDisplayMode();

  const isPaused = status.paused ?? false;
  const volume = status.volume ?? 100;
  const isFullscreen = status.fullscreen ?? false;
  const subtitles = status.subtitles ?? [];
  const speed = status.speed ?? 1;

  const title = status.title ?? "Unknown";
  const nameWithoutExt = title.includes(".")
    ? title.slice(0, title.lastIndexOf("."))
    : title;

  return (
    <div className="shrink-0 border-t border-border bg-card text-card-foreground flex flex-col">
      {/* ── Row 1: Playback controls ── */}
      <div className="flex items-center gap-2 pl-1 pr-4 pt-3 pb-1">
        <IconButton
          onClick={() => skip.mutate(-10)}
          disabled={skip.isPending}
          label="Skip back 10 seconds"
          className="text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <SkipBack className="size-4" />
        </IconButton>

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

        <IconButton
          onClick={() => skip.mutate(10)}
          disabled={skip.isPending}
          label="Skip forward 10 seconds"
          className="text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <SkipForward className="size-4" />
        </IconButton>

        <div className="ml-auto flex items-center gap-2">
          <SpeedSelector speed={speed} onSelect={(s) => setSpeed.mutate(s)} />
          <Dialog>
            <DialogTrigger asChild>
              <button
                aria-label="More controls"
                className={cn(
                  "flex items-center justify-center size-10 rounded-lg transition-colors",
                  "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <SlidersHorizontal className="size-4" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>More Controls</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 pt-2">
                {/* Display mode */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Display</span>
                  <button
                    onClick={() => setDisplayMode.mutate()}
                    disabled={setDisplayMode.isPending}
                    aria-label="Set display mode to 1920x1080"
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      "border border-border bg-muted hover:bg-accent hover:text-accent-foreground",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <Monitor className="size-4 shrink-0" />
                    <span>Set 1920×1080</span>
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Row 2: Seek scrubber ── */}
      <div className="px-4 pt-1 pb-1">
        <SeekBar
          position={status.position}
          duration={status.duration}
          onSeek={(pos) => seek.mutate(pos)}
        />
      </div>

      {/* ── Row 3: Title + timestamp ── */}
      <div className="flex items-center gap-2.5 px-4 py-2">
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

        {/* Volume */}
        <VolumeControl volume={volume} onVolume={(v) => setVolume.mutate(v)} />

        {/* Subtitles — only shown when tracks are available */}
        {subtitles.length > 0 && (
          <SubtitleSelector
            subtitles={subtitles}
            onSelect={(id) => setSubtitle.mutate(id)}
          />
        )}

        {/* Fullscreen */}
        <IconButton
          onClick={() => setFullscreen.mutate(!isFullscreen)}
          label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
        >
          {isFullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </IconButton>
      </div>
    </div>
  );
}
