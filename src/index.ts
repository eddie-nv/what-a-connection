import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { healthRouter } from "./routes/health.routes";
import { giftRouter } from "./routes/gift.routes";
import { loadEnv } from "./utils/env";

const env = loadEnv();

const app = express();
app.use(express.json({ limit: "100kb" }));

app.use("/api", healthRouter);
app.use("/api", giftRouter);

app.use(express.static(resolve(process.cwd(), "public"), { index: "index.html" }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  if (!res.headersSent) res.status(500).json({ error: message });
});

app.listen(env.port, () => {
  console.log(`what-a-connection listening on http://localhost:${env.port}`);
});
