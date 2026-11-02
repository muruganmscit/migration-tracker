import "dotenv/config";
import "express-async-errors";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import { applicationsRouter } from "./routes/applications";
import { reposRouter } from "./routes/repos";
import { importRouter } from "./routes/import";
import { emailTemplatesRouter } from "./routes/emailTemplates";
import { reportsRouter } from "./routes/reports";
import { wavesRouter } from "./routes/waves";

export const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/applications", applicationsRouter);
app.use("/api/repos", reposRouter);
app.use("/api/import", importRouter);
app.use("/api/email-templates", emailTemplatesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/waves", wavesRouter);

// In the Docker image the built client is served from here too, so one container runs the whole portal.
// Any other page route gets index.html, so deep links like /applications/12 work. Missing files (paths
// with an extension) still return 404 rather than the page.
const clientDist = process.env.CLIENT_DIST;
if (clientDist && fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api(\/|$))(?!.*\.[a-z0-9]+$).*/i, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});
