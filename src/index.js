import "dotenv/config";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import "./db.js";
import { buildRouter } from "./routes.js";

const log = pino({ level: config.logLevel });
const app = express();

app.use(helmet());
app.use(pinoHttp({ logger: log }));
app.use(buildRouter(log));

app.use((err, _req, res, _next) => {
  log.error(err, "unhandled");
  res.status(500).json({ error: "Server error" });
});

app.listen(config.port, () => {
  log.info({ port: config.port }, "listening");
});
