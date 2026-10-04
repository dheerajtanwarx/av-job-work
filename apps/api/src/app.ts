import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./env.js";
import { blockViewersFromWriting, requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { csrfProtection, loginRateLimit, publicRateLimit } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";
import { entriesRouter, jobsRouter } from "./routes/jobs.js";
import { clientsRouter, designsRouter, jobWorkTypesRouter, materialsRouter, productsRouter, stockRouter } from "./routes/masters.js";
import { photosRouter } from "./routes/photos.js";
import { publicRouter } from "./routes/public.js";
import { reportsRouter } from "./routes/reports.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // The web app proxies /api/* to us: trust its X-Forwarded-For so rate limits are per visitor, not per proxy.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.post("/auth/login", loginRateLimit());
  app.use("/auth", authRouter);
  app.use("/public", publicRateLimit(), publicRouter);

  app.use(requireAuth);
  app.use(blockViewersFromWriting);
  app.use("/clients", clientsRouter);
  app.use("/products", productsRouter);
  app.use("/job-work-types", jobWorkTypesRouter);
  app.use("/designs", designsRouter);
  app.use("/materials", materialsRouter);
  app.use("/", stockRouter);
  app.use("/", photosRouter);
  app.use("/jobs", jobsRouter);
  app.use("/", entriesRouter);
  app.use("/", billingRouter);
  app.use("/", reportsRouter);

  app.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
