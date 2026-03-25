import { Router } from "express";
import {
  depositHandler,
  withdrawHandler,
  getTransactionHandler,
  updateNotesHandler,
  searchTransactionsHandler,
} from "../controllers/transactionController";
import { TimeoutPresets, haltOnTimedout } from "../middleware/timeout";

import { validateTransaction } from "../controllers/transactionController";

export const transactionRoutes = Router();

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

// Quick read operation
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
