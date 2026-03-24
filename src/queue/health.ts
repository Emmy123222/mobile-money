import { Request, Response } from "express";
import { transactionQueue, getQueueStats } from "./transactionQueue";

export async function getQueueHealth(req: Request, res: Response) {
  try {
    const stats = await getQueueStats();

    const isHealthy = !stats.isPaused && stats.failed < 100;

    res.json({
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      queue: "transaction-processing",
      stats: {
        waiting: stats.waiting,
        active: stats.active,
        completed: stats.completed,
        failed: stats.failed,
        paused: stats.isPaused,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue health" });
  }
}

export async function pauseQueueEndpoint(req: Request, res: Response) {
  try {
    await transactionQueue.pause();
    res.json({ success: true, message: "Queue paused" });
  } catch (error) {
    res.status(500).json({ error: "Failed to pause queue" });
  }
}

export async function resumeQueueEndpoint(req: Request, res: Response) {
  try {
    await transactionQueue.resume();
    res.json({ success: true, message: "Queue resumed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resume queue" });
  }
}
