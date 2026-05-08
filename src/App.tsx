import { useMemo, useState } from "react";
import {
  Film,
  Folder,
  FolderOpen,
  AlertCircle,
  Loader2,
  FileVideo,
  Search,
  X,
  ChevronDown,
  Play,
} from "lucide-react";
import {
  useMediaFiles,
  type MediaFile,
  type MediaGroup,
} from "@/lib/hooks/api/use-directory-content";
import { usePlayerStatus, usePlayFile } from "@/lib/hooks/api/use-player";
import { PlayerBar } from "@/components/ui/player-bar";
import { HeaderActions } from "@/components/ui/header-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-primary/20 text-primary rounded-sm">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

function MediaFileRow({
  file,
  query,
  onSelect,
}: {
  file: MediaFile;
  query: string;
  onSelect: (file: MediaFile) => void;
}) {
  const ext = file.name.split(".").pop()?.toUpperCase() ?? "";
  const nameWithoutExt =
    file.name.slice(0, file.name.lastIndexOf(".")) || file.name;

  return (
    <li
      onClick={() => onSelect(file)}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors group cursor-pointer select-none"
    >
      <FileVideo className="size-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
      <span className="flex-1 truncate text-sm">
        <Highlight text={nameWithoutExt} query={query} />
      </span>
      <span className="text-[10px] font-semibold font-mono tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
        {ext}
      </span>
      {file.size !== null && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 text-right">
          {formatBytes(file.size)}
        </span>
      )}
    </li>
  );
}

function DirectoryGroup({
  group,
  query,
  onSelect,
}: {
  group: MediaGroup & { files: MediaFile[] };
  query: string;
  onSelect: (file: MediaFile) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-muted/50 hover:bg-muted transition-colors text-left group"
      >
        {open ? (
          <FolderOpen className="size-4 shrink-0 text-primary transition-colors" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        )}

        <span className="flex-1 font-semibold text-sm truncate">
          <Highlight text={group.name} query={query} />
        </span>

        <span className="text-xs text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-full tabular-nums shrink-0">
          {group.files.length} {group.files.length === 1 ? "file" : "files"}
        </span>

        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {open && (
        <ul className="px-3 py-2 flex flex-col gap-0.5">
          {group.files.map((file) => (
            <MediaFileRow
              key={file.path}
              file={file}
              query={query}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search files and folders…"
        className={cn(
          "w-full h-10 pl-9 pr-9 rounded-lg text-sm",
          "bg-muted border border-border",
          "text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "transition-shadow",
        )}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function PlayDialog({
  file,
  open,
  onOpenChange,
}: {
  file: MediaFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const playFile = usePlayFile();

  const nameWithoutExt = file
    ? file.name.slice(0, file.name.lastIndexOf(".")) || file.name
    : "";

  function handlePlay() {
    if (!file) return;
    playFile.mutate(file.path);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="min-w-0 overflow-hidden">
          <DialogTitle className="truncate pr-6">{nameWithoutExt}</DialogTitle>
          <DialogDescription>
            {file?.size != null ? formatBytes(file.size) : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2 gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="text-foreground">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handlePlay} disabled={playFile.isPending}>
            <Play className="size-3.5 fill-current" />
            Play in mpv
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROOT_PATH = "/";

export default function App() {
  const { data, isLoading, isError, error } = useMediaFiles(ROOT_PATH);
  const { data: playerStatus } = usePlayerStatus();

  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.groups;

    // Normalize periods to spaces so "the movie" matches "the.movie"
    const normalize = (s: string) => s.toLowerCase().replace(/\./g, " ");
    const qNorm = normalize(q);

    return data.groups
      .map((group) => ({
        ...group,
        files: group.files.filter((f) => {
          const nameLC = f.name.toLowerCase();
          const groupLC = group.name.toLowerCase();
          return (
            nameLC.includes(q) ||
            normalize(f.name).includes(qNorm) ||
            groupLC.includes(q) ||
            normalize(group.name).includes(qNorm)
          );
        }),
      }))
      .filter((group) => group.files.length > 0);
  }, [data, query]);

  const totalFiles = filteredGroups.reduce((s, g) => s + g.files.length, 0);
  const isFiltering = query.trim().length > 0;

  function handleFileSelect(file: MediaFile) {
    setSelectedFile(file);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col w-full h-screen bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="flex items-center justify-center size-9 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Film className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base leading-none">
              Media Center
            </h1>
            {data && (
              <p className="text-xs text-muted-foreground mt-1">
                {data.groups.length}{" "}
                {data.groups.length === 1 ? "folder" : "folders"}
              </p>
            )}
          </div>
          <HeaderActions />
        </div>

        <div className="px-6 pb-4">
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Scanning for media files…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center gap-2 h-64 text-destructive">
            <AlertCircle className="size-6" />
            <p className="text-sm font-medium">{(error as Error).message}</p>
          </div>
        )}

        {data && data.groups.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
            <FileVideo className="size-8 opacity-30" />
            <p className="text-sm">No media files found.</p>
          </div>
        )}

        {data &&
          data.groups.length > 0 &&
          isFiltering &&
          filteredGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
              <Search className="size-8 opacity-30" />
              <p className="text-sm">
                No results for{" "}
                <span className="font-medium text-foreground">"{query}"</span>
              </p>
              <button
                onClick={() => setQuery("")}
                className="text-xs text-primary hover:underline underline-offset-2"
              >
                Clear search
              </button>
            </div>
          )}

        {filteredGroups.length > 0 && (
          <div className="px-6 py-6 flex flex-col gap-4 w-full mx-auto">
            {isFiltering && (
              <p className="text-xs text-muted-foreground px-1">
                {totalFiles} {totalFiles === 1 ? "result" : "results"} for{" "}
                <span className="font-medium text-foreground">"{query}"</span>
              </p>
            )}
            {filteredGroups.map((group) => (
              <DirectoryGroup
                key={group.path}
                group={group}
                query={query}
                onSelect={handleFileSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Player bar — only shown when mpv is active */}
      {playerStatus?.playing && <PlayerBar status={playerStatus} />}

      {/* Play dialog */}
      <PlayDialog
        file={selectedFile}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
