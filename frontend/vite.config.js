import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const apiBaseUrl = process.env.VITE_API_BASE_URL || "http://localhost:5000/api";

function firebaseConfigPlugin() {
  return {
    name: "firebase-config",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/firebase-config.json" || req.url === "/firebase-config.json/") {
          try {
            const base = apiBaseUrl.replace(/\/api\/?$/, "");
            const r = await fetch(`${base}/api/env/public`);
            const json = await r.json();
            const data = json?.data || {};
            const config = {
              apiKey: data.FIREBASE_API_KEY || "",
              authDomain: data.FIREBASE_AUTH_DOMAIN || "",
              projectId: data.FIREBASE_PROJECT_ID || "",
              storageBucket: data.FIREBASE_STORAGE_BUCKET || "",
              messagingSenderId: data.FIREBASE_MESSAGING_SENDER_ID || "",
              appId: data.FIREBASE_APP_ID || "",
            };
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(config));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({}));
          }
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), firebaseConfigPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "@emotion/react",
      "@emotion/styled",
      "@mui/material",
      "@mui/x-date-pickers",
      "mapbox-gl",
      "react-map-gl",
    ],
  },
  server: {
    host: "0.0.0.0", // Allow access from network
    port: 5173, // Default Vite port
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
