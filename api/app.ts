// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function ts(): string {
  return new Date().toISOString();
}

function log(tag: string, msg: string, data?: unknown): void {
  const extra = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${ts()}] [${tag}] ${msg}${extra}`);
}

function logError(tag: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts()}] [${tag}] ERROR ${msg}: ${detail}`);
}

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { readdir, stat, access } from "fs/promises";
import { join, resolve, extname } from "path";
import { spawn, exec, type ChildProcess } from "child_process";
import * as net from "net";
import { promisify } from "util";

const execAsync = promisify(exec);

const SOCKET_PATH = "/tmp/mpv-media-center.sock";

let mpvProcess: ChildProcess | null = null;

async function socketExists(): Promise<boolean> {
  try {
    await access(SOCKET_PATH);
    return true;
  } catch {
    return false;
  }
}

function sendMpvCommand(command: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH);
    const msg = JSON.stringify({ command }) + "\n";
    let raw = "";

    const cmdName = String(command[0]);
    const cmdArgs = command.slice(1);
    log("IPC", `>> ${cmdName}`, cmdArgs.length ? cmdArgs : undefined);

    const timeout = setTimeout(() => {
      client.destroy();
      const err = new Error("mpv IPC timeout");
      logError("IPC", `timeout waiting for response to ${cmdName}`, err);
      reject(err);
    }, 2000);

    client.once("connect", () => client.write(msg));
    client.on("data", (chunk) => {
      raw += chunk.toString();

      // mpv sends newline-delimited JSON. Each line is either an unsolicited
      // event notification {"event":"..."} or a command response
      // {"error":"success","data":...}. We must skip events and wait for the
      // actual response — otherwise a seek event firing before the response
      // causes us to resolve with the wrong object, misreporting status and
      // masking real errors (including end-file / EOF which makes mpv quit).
      let newlineIdx: number;
      while ((newlineIdx = raw.indexOf("\n")) !== -1) {
        const line = raw.slice(0, newlineIdx).trim();
        raw = raw.slice(newlineIdx + 1);

        if (!line) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          const err = new Error(`Bad JSON from mpv: ${line}`);
          logError("IPC", `bad JSON during ${cmdName}`, err);
          clearTimeout(timeout);
          client.destroy();
          reject(err);
          return;
        }

        // Skip event notifications — they are not command responses.
        const asObj = parsed as Record<string, unknown>;
        if (asObj && typeof asObj === "object" && "event" in asObj) {
          const eventName = String(asObj.event);
          log("IPC", `  (event skipped: ${eventName})`);
          if (eventName === "end-file") {
            // mpv is about to exit — log the reason so we can see it in context
            log(
              "IPC",
              `  end-file reason: ${String(asObj.reason ?? "unknown")}`,
            );
          }
          continue;
        }

        // This is the command response.
        clearTimeout(timeout);
        client.destroy();

        if (cmdName !== "get_property") {
          log("IPC", `<< ${cmdName}`, parsed);
        } else if (asObj?.error && asObj.error !== "success") {
          log(
            "IPC",
            `<< ${cmdName} (${String(cmdArgs[0])}) error`,
            asObj.error,
          );
        }

        resolve(parsed);
        return;
      }
    });
    client.on("error", (err) => {
      clearTimeout(timeout);
      logError("IPC", `socket error during ${cmdName}`, err);
      reject(err);
    });
  });
}

async function requireSocket(c: Context) {
  if (!(await socketExists())) {
    return c.json({ error: "mpv is not running" }, 400);
  }
  return null;
}

async function getMpvProperty(prop: string): Promise<unknown> {
  const res = (await sendMpvCommand(["get_property", prop])) as {
    data: unknown;
    error: string;
  };
  if (res.error !== "success") return null;
  return res.data;
}

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".mpg",
  ".mpeg",
  ".m2v",
  ".3gp",
  ".ogv",
  ".ts",
  ".mts",
  ".m2ts",
  ".vob",
  ".divx",
]);

const isVideoFile = (name: string) =>
  VIDEO_EXTENSIONS.has(extname(name).toLowerCase());

export const app = new Hono().basePath("/api");

// Enable CORS for all routes
app.use("/*", cors());

app.get("/hello", (c) => c.json({ message: "Hello from hono API route" }));
app.post("/echo", async (c) => c.json({ body: await c.req.json() }));

app.get("/browse", async (c) => {
  const rawPath = process.env.MEDIA_PATH as string;
  const dirPath = resolve(rawPath);

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dirPath, entry.name);
        let size: number | null = null;

        if (entry.isFile()) {
          try {
            const info = await stat(fullPath);
            size = info.size;
          } catch {
            // ignore stat errors for individual files
          }
        }

        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory()
            ? "directory"
            : entry.isSymbolicLink()
              ? "symlink"
              : "file",
          size,
        };
      }),
    );

    items.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });

    return c.json({ path: dirPath, items });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    const status = code === "ENOENT" ? 404 : code === "EACCES" ? 403 : 500;
    return c.json({ error: message }, status);
  }
});

app.get("/media", async (c) => {
  const rawPath = process.env.MEDIA_PATH as string;
  const rootPath = resolve(rawPath);

  try {
    const topEntries = await readdir(rootPath, { withFileTypes: true });

    const groups = await Promise.all(
      topEntries.map(async (entry) => {
        const entryPath = join(rootPath, entry.name);

        if (entry.isDirectory()) {
          let files: { name: string; path: string; size: number | null }[] = [];
          try {
            const children = await readdir(entryPath, { withFileTypes: true });
            files = await Promise.all(
              children
                .filter((child) => child.isFile() && isVideoFile(child.name))
                .map(async (child) => {
                  const filePath = join(entryPath, child.name);
                  let size: number | null = null;
                  try {
                    size = (await stat(filePath)).size;
                  } catch {
                    /* ignore */
                  }
                  return { name: child.name, path: filePath, size };
                }),
            );
            files.sort((a, b) => a.name.localeCompare(b.name));
          } catch {
            /* ignore unreadable dirs */
          }

          return { name: entry.name, path: entryPath, files };
        }

        if (entry.isFile() && isVideoFile(entry.name)) {
          let size: number | null = null;
          try {
            size = (await stat(entryPath)).size;
          } catch {
            /* ignore */
          }
          return {
            name: "",
            path: rootPath,
            files: [{ name: entry.name, path: entryPath, size }],
          };
        }

        return null;
      }),
    );

    const result = groups
      .filter((g) => g !== null && g.files.length > 0)
      .sort((a, b) => a!.name.localeCompare(b!.name));

    return c.json({ path: rootPath, groups: result });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    const status = code === "ENOENT" ? 404 : code === "EACCES" ? 403 : 500;
    return c.json({ error: message }, status);
  }
});

// ---------------------------------------------------------------------------
// Player routes
// ---------------------------------------------------------------------------

app.post("/player/play", async (c) => {
  const { path: filePath } = await c.req.json<{ path: string }>();
  log("PLAY", `request to play`, { path: filePath });

  // Kill existing process if we own it
  if (mpvProcess) {
    log("PLAY", "killing existing mpv process before starting new one");
    mpvProcess.kill();
    mpvProcess = null;
  }

  log("PLAY", "spawning mpv", {
    args: [`--input-ipc-server=${SOCKET_PATH}`, filePath],
  });
  mpvProcess = spawn("mpv", [`--input-ipc-server=${SOCKET_PATH}`, filePath], {
    detached: false,
    stdio: "ignore",
  });

  log("PLAY", `mpv spawned with pid ${mpvProcess.pid}`);

  mpvProcess.on("exit", (code, signal) => {
    log("MPV", `process exited`, { pid: mpvProcess?.pid, code, signal });
    mpvProcess = null;
  });

  mpvProcess.on("error", (err) => {
    logError("MPV", "process error", err);
  });

  // Give mpv a moment to create the socket before the client polls status
  await new Promise((r) => setTimeout(r, 500));

  return c.json({ ok: true });
});

app.post("/player/pause", async (c) => {
  log("PAUSE", "request received");
  if (!(await socketExists())) {
    log("PAUSE", "socket not found — mpv is not running");
    return c.json({ error: "mpv is not running" }, 400);
  }
  await sendMpvCommand(["set_property", "pause", true]);
  return c.json({ ok: true });
});

app.post("/player/resume", async (c) => {
  log("RESUME", "request received");
  if (!(await socketExists())) {
    log("RESUME", "socket not found — mpv is not running");
    return c.json({ error: "mpv is not running" }, 400);
  }
  await sendMpvCommand(["set_property", "pause", false]);
  return c.json({ ok: true });
});

app.post("/player/stop", async (c) => {
  log("STOP", "request received");
  if (mpvProcess) {
    log("STOP", `killing owned mpv process (pid ${mpvProcess.pid})`);
    mpvProcess.kill();
    mpvProcess = null;
  } else if (await socketExists()) {
    log("STOP", "mpv not owned by this server — sending quit via IPC");
    await sendMpvCommand(["quit"]).catch((err) =>
      logError("STOP", "quit IPC failed", err),
    );
  } else {
    log("STOP", "mpv is not running — nothing to stop");
  }
  return c.json({ ok: true });
});

app.get("/player/status", async (c) => {
  if (!(await socketExists())) {
    return c.json({ playing: false });
  }

  try {
    const [
      paused,
      title,
      position,
      duration,
      volume,
      fullscreen,
      trackList,
      speed,
    ] = await Promise.all([
      getMpvProperty("pause"),
      getMpvProperty("media-title"),
      getMpvProperty("time-pos"),
      getMpvProperty("duration"),
      getMpvProperty("volume"),
      getMpvProperty("fullscreen"),
      getMpvProperty("track-list"),
      getMpvProperty("speed"),
    ]);

    type RawTrack = {
      id: number;
      type: string;
      title?: string;
      lang?: string;
      selected: boolean;
    };

    const subtitles = ((trackList as RawTrack[]) ?? [])
      .filter((t) => t.type === "sub")
      .map((t) => ({
        id: t.id,
        title: t.title ?? null,
        lang: t.lang ?? null,
        selected: t.selected,
      }));

    return c.json({
      playing: true,
      paused: paused as boolean,
      title: title as string | null,
      position: position as number | null,
      duration: duration as number | null,
      volume: volume as number | null,
      fullscreen: fullscreen as boolean,
      subtitles,
      speed: speed as number | null,
    });
  } catch (err) {
    // Socket existed but mpv died between the access check and the command
    logError(
      "STATUS",
      "property fetch failed — mpv likely died mid-request",
      err,
    );
    return c.json({ playing: false });
  }
});

app.post("/player/seek", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { position } = await c.req.json<{ position: number }>();

  // Fetch current duration so we can warn when seeking at/past EOF — this is
  // the most common reason mpv silently exits on some files (imprecise or
  // missing duration metadata causes the seek bar to compute a position beyond
  // the actual end of the stream).
  const duration = (await getMpvProperty("duration").catch(() => null)) as
    | number
    | null;

  if (duration != null) {
    const remaining = duration - position;
    if (position >= duration) {
      log(
        "SEEK",
        `WARNING: seek position ${position.toFixed(2)}s is at or past reported duration ${duration.toFixed(2)}s — mpv will likely hit EOF and exit`,
      );
    } else if (remaining < 2) {
      log(
        "SEEK",
        `WARNING: seek position ${position.toFixed(2)}s is within ${remaining.toFixed(2)}s of end (duration ${duration.toFixed(2)}s)`,
      );
    } else {
      log(
        "SEEK",
        `absolute seek to ${position.toFixed(2)}s / ${duration.toFixed(2)}s`,
      );
    }
  } else {
    log("SEEK", `absolute seek to ${position.toFixed(2)}s (duration unknown)`);
  }

  const seekRes = (await sendMpvCommand(["seek", position, "absolute"])) as {
    error?: string;
  };
  if (seekRes?.error && seekRes.error !== "success") {
    log("SEEK", `seek command failed`, {
      error: seekRes.error,
      position,
      duration,
    });
    return c.json({ error: `seek failed: ${seekRes.error}` }, 500);
  }

  return c.json({ ok: true });
});

app.post("/player/skip", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { seconds } = await c.req.json<{ seconds: number }>();
  log("SKIP", `relative skip ${seconds}s`);
  await sendMpvCommand(["seek", seconds, "relative"]);
  return c.json({ ok: true });
});

app.post("/player/subtitle", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { id } = await c.req.json<{ id: number | "no" }>();
  log("SUBTITLE", `setting sid to`, { id });
  await sendMpvCommand(["set_property", "sid", id]);
  return c.json({ ok: true });
});

app.post("/player/volume", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { volume } = await c.req.json<{ volume: number }>();
  const clamped = Math.max(0, Math.min(130, volume));
  log("VOLUME", `setting volume to ${clamped} (requested ${volume})`);
  await sendMpvCommand(["set_property", "volume", clamped]);
  return c.json({ ok: true });
});

app.post("/player/speed", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { speed } = await c.req.json<{ speed: number }>();
  const clamped = Math.max(0.01, speed);
  log("SPEED", `setting speed to ${clamped} (requested ${speed})`);
  await sendMpvCommand(["set_property", "speed", clamped]);
  return c.json({ ok: true });
});

app.post("/player/fullscreen", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { fullscreen } = await c.req.json<{ fullscreen: boolean }>();
  log("FULLSCREEN", `setting fullscreen to ${fullscreen}`);
  await sendMpvCommand(["set_property", "fullscreen", fullscreen]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// System routes
// ---------------------------------------------------------------------------

app.post("/system/set-display-mode", async (c) => {
  const cmd = "xrandr --output HDMI-A-0 --mode 1920x1080";
  log("DISPLAY", `running: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) log("DISPLAY", `stdout: ${stdout.trim()}`);
    if (stderr) log("DISPLAY", `stderr: ${stderr.trim()}`);
    return c.json({ ok: true });
  } catch (err) {
    logError("DISPLAY", "xrandr command failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});
