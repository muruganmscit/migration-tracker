import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import { applicationsRouter } from "./routes/applications";
import { reposRouter } from "./routes/repos";
import { importRouter } from "./routes/import";
import { emailTemplatesRouter } from "./routes/emailTemplates";
import { reportsRouter } from "./routes/reports";
import { wavesRouter } from "./routes/waves";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/applications", applicationsRouter);
app.use("/api/repos", reposRouter);
app.use("/api/import", importRouter);
app.use("/api/email-templates", emailTemplatesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/waves", wavesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Harness Migration Portal API listening on :${port}`);
});
