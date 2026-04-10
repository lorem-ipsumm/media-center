import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { readdir, stat, access } from "fs/promises";
import { join, resolve, extname } from "path";
import { spawn, type ChildProcess } from "child_process";
import * as net from "net";

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

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("mpv IPC timeout"));
    }, 2000);

    client.once("connect", () => client.write(msg));
    client.on("data", (chunk) => {
      raw += chunk.toString();
      const line = raw.split("\n").find((l) => l.trim());
      if (line) {
        clearTimeout(timeout);
        client.destroy();
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error("Bad JSON from mpv"));
        }
      }
    });
    client.on("error", (err) => {
      clearTimeout(timeout);
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

  // Kill existing process if we own it
  if (mpvProcess) {
    mpvProcess.kill();
    mpvProcess = null;
  }

  mpvProcess = spawn("mpv", [`--input-ipc-server=${SOCKET_PATH}`, filePath], {
    detached: false,
    stdio: "ignore",
  });

  mpvProcess.on("exit", () => {
    mpvProcess = null;
  });

  // Give mpv a moment to create the socket before the client polls status
  await new Promise((r) => setTimeout(r, 500));

  return c.json({ ok: true });
});

app.post("/player/pause", async (c) => {
  if (!(await socketExists())) {
    return c.json({ error: "mpv is not running" }, 400);
  }
  await sendMpvCommand(["set_property", "pause", true]);
  return c.json({ ok: true });
});

app.post("/player/resume", async (c) => {
  if (!(await socketExists())) {
    return c.json({ error: "mpv is not running" }, 400);
  }
  await sendMpvCommand(["set_property", "pause", false]);
  return c.json({ ok: true });
});

app.post("/player/stop", async (c) => {
  if (mpvProcess) {
    mpvProcess.kill();
    mpvProcess = null;
  } else if (await socketExists()) {
    // mpv was started by a previous server instance — send quit via IPC
    await sendMpvCommand(["quit"]).catch(() => null);
  }
  return c.json({ ok: true });
});

app.get("/player/status", async (c) => {
  if (!(await socketExists())) {
    return c.json({ playing: false });
  }

  try {
    const [paused, title, position, duration, volume, fullscreen] =
      await Promise.all([
        getMpvProperty("pause"),
        getMpvProperty("media-title"),
        getMpvProperty("time-pos"),
        getMpvProperty("duration"),
        getMpvProperty("volume"),
        getMpvProperty("fullscreen"),
      ]);

    return c.json({
      playing: true,
      paused: paused as boolean,
      title: title as string | null,
      position: position as number | null,
      duration: duration as number | null,
      volume: volume as number | null,
      fullscreen: fullscreen as boolean,
    });
  } catch {
    // Socket existed but mpv died between the access check and the command
    return c.json({ playing: false });
  }
});

app.post("/player/seek", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { position } = await c.req.json<{ position: number }>();
  // seek to absolute position in seconds
  await sendMpvCommand(["seek", position, "absolute"]);
  return c.json({ ok: true });
});

app.post("/player/volume", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { volume } = await c.req.json<{ volume: number }>();
  await sendMpvCommand([
    "set_property",
    "volume",
    Math.max(0, Math.min(130, volume)),
  ]);
  return c.json({ ok: true });
});

app.post("/player/fullscreen", async (c) => {
  const early = await requireSocket(c);
  if (early) return early;
  const { fullscreen } = await c.req.json<{ fullscreen: boolean }>();
  await sendMpvCommand(["set_property", "fullscreen", fullscreen]);
  return c.json({ ok: true });
});
