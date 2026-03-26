import { Router } from "express";
import {
  depositHandler,
  withdrawHandler,
  getTransactionHandler,
  validateTransaction,
  getTransactionHistoryHandler,
  updateNotesHandler,
  searchTransactionsHandler,
} from "../controllers/transactionController";
import { TimeoutPresets, haltOnTimedout } from "../middleware/timeout";

export const transactionRoutes = Router();

// --- Transaction History (New) ---
// GET /api/transactions
transactionRoutes.get(
  "/",
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHistoryHandler
);

// Deposit route
transactionRoutes.post(
  "/deposit",
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  depositHandler,
);

// Withdraw route
transactionRoutes.post(
  "/withdraw",
  TimeoutPresets.long,
  haltOnTimedout,
  validateTransaction,
  withdrawHandler,
);

// Get single transaction
transactionRoutes.get(
  "/:id",
  TimeoutPresets.quick,
  haltOnTimedout,
  getTransactionHandler,
);

// Notes and search
transactionRoutes.patch(
  "/:id/notes",
  TimeoutPresets.quick,
  haltOnTimedout,
  updateNotesHandler,
);

transactionRoutes.get(
  "/search",
  TimeoutPresets.quick,
  haltOnTimedout,
  searchTransactionsHandler,
);
