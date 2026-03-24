import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { transactionRoutes } from "./routes/transactions";
import { bulkRoutes } from "./routes/bulk";
import {
  transactionDisputeRoutes,
  disputeRoutes,
} from "./routes/disputes";
import { errorHandler } from "./middleware/errorHandler";
import { connectRedis, redisClient } from "./config/redis";
import { pool } from "./config/database";
import {
  globalTimeout,
  haltOnTimedout,
  timeoutErrorHandler,
} from "./middleware/timeout";

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// Security + parsing
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(limiter);

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Liveness probe
 */
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * Readiness probe (DB + Redis)
 */
app.get("/ready", async (req, res) => {
  const checks: Record<string, string> = {
    database: "down",
    redis: "down",
  };

  let allReady = true;

  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch (err) {
    console.error("Database check failed", err);
    checks.database = "error";
    allReady = false;
  }

  try {
    if (redisClient?.isOpen) {
      await redisClient.ping();
      checks.redis = "ok";
    } else {
      checks.redis = "closed";
      allReady = false;
    }
  } catch (err) {
    console.error("Redis check failed", err);
    checks.redis = "error";
    allReady = false;
  }

  const response = {
    status: allReady ? "ready" : "not ready",
    checks,
    timestamp: new Date().toISOString(),
  };

  res.status(allReady ? 200 : 503).json(response);
});

// Timeout middleware
app.use(globalTimeout);
app.use(haltOnTimedout);

// Routes
app.use("/api/transactions", transactionRoutes);
app.use("/api/transactions", transactionDisputeRoutes);
app.use("/api/transactions/bulk", bulkRoutes);
app.use("/api/disputes", disputeRoutes);

// Error handling
app.use(timeoutErrorHandler);
app.use(errorHandler);

// Init Redis
connectRedis()
  .then(() => {
    console.log("Redis initialized");
  })
  .catch((err) => {
    console.error("Failed to connect to Redis:", err);
  });

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});