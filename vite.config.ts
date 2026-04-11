import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import devServer from "@hono/vite-dev-server";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars ('' prefix = no filter, so non-VITE_ vars are included too)
  const env = loadEnv(mode, process.cwd(), "");

  // Merge into process.env so the Hono API can read them via process.env
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          enabled: true,
        },
        includeAssets: ["icons/apple-touch-icon.png"],
        manifest: {
          name: "Media Center",
          short_name: "Media",
          description: "Local media center controller",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b0d15",
          theme_color: "#0b0d15",
          icons: [
            {
              src: "/icons/icon-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icons/icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/icons/icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      devServer({
        entry: "api/dev.ts",
        // Exclude any path that does NOT start with /api
        exclude: [/^(?!\/api).*/],
      }), // mounts Hono at the same origin in dev
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./packages"),
      },
    },
  };
});
