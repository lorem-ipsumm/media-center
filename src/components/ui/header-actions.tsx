import { Sun, Moon, PowerOff } from "lucide-react";
import { useThemeStore } from "@/lib/hooks/store/use-theme-store";
import { usePlayerStatus } from "@/lib/hooks/api/use-player";
import { useKillAllMpv } from "@/lib/hooks/api/use-system";
import { cn } from "@/lib/utils";

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center justify-center size-9 rounded-lg transition-colors shrink-0",
        "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function KillMpvButton() {
  const { data: playerStatus } = usePlayerStatus();
  const killAllMpv = useKillAllMpv();

  if (!playerStatus?.playing) return null;

  return (
    <button
      onClick={() => killAllMpv.mutate()}
      disabled={killAllMpv.isPending}
      aria-label="Kill all mpv instances"
      className={cn(
        "flex items-center justify-center size-9 rounded-lg transition-colors shrink-0",
        "bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <PowerOff className="size-4" />
    </button>
  );
}

export function HeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <KillMpvButton />
      <ThemeToggle />
    </div>
  );
}
