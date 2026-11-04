import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create HTTP server
  const server = http.createServer(app);

  // WebSocket Server
  const wss = new WebSocketServer({ server });

  // In-memory state
  let state: any = {
    users: [],
    teams: [],
    tournaments: [],
    liveMatch: null,
  };

  wss.on('connection', (ws) => {
    console.log('Client connected');

    // Send initial state
    ws.send(JSON.stringify({ type: 'INIT', data: state }));

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        
        if (parsed.type === 'UPDATE') {
          const { path, data } = parsed;
          // Update state
          state[path] = data;
          
          // Broadcast to all other clients
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'UPDATE', path, data }));
            }
          });
        } else if (parsed.type === 'SYNC_REQUEST') {
             ws.send(JSON.stringify({ type: 'INIT', data: state }));
        }
      } catch (e) {
        console.error('Error processing message', e);
      }
    });
  });

  // API routes FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
