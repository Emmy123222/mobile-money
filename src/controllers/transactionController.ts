import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { StellarService } from "../services/stellar/stellarService";
import { MobileMoneyService } from "../services/mobilemoney/mobileMoneyService";
import { TransactionModel, TransactionStatus } from "../models/transaction";
import { lockManager, LockKeys } from "../utils/lock";
import { TransactionLimitService } from "../services/transactionLimit/transactionLimitService";
import { KYCService } from "../services/kyc/kycService";
import { addTransactionJob, getJobProgress } from "../queue";

// ------------------ Services ------------------
// Initialize services (will be used in future implementations)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stellarService = new StellarService();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mobileMoneyService = new MobileMoneyService();
const transactionModel = new TransactionModel();
const kycService = new KYCService();
const transactionLimitService = new TransactionLimitService(
  kycService,
  transactionModel,
);

// ------------------ Validation Middleware ------------------
export const transactionSchema = z.object({
  amount: z.number().positive({ message: "Amount must be a positive number" }),
  phoneNumber: z
    .string()
    .regex(/^\+?\d{10,15}$/, { message: "Invalid phone number format" }),
  provider: z.enum(["mtn", "airtel", "orange"], {
    message: "Provider must be one of: mtn, airtel, orange",
  }),
  stellarAddress: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, { message: "Invalid Stellar address format" }),
  userId: z.string().nonempty({ message: "userId is required" }),
});

export const validateTransaction = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    transactionSchema.parse(req.body);
    next();
  } catch (err: any) {
    const message =
      err.errors?.map((e: any) => e.message).join(", ") || "Invalid input";
    return res.status(400).json({ error: message });
  }
};

// ------------------ Handlers ------------------
export const depositHandler = async (req: Request, res: Response) => {
  try {
    const { amount, phoneNumber, provider, stellarAddress, userId, notes } =
      req.body;

    // Validate transaction limit
    const limitCheck = await transactionLimitService.checkTransactionLimit(
      userId,
      parseFloat(amount),
    );

    if (!limitCheck.allowed) {
      return res.status(400).json({
        error: "Transaction limit exceeded",
        details: {
          kycLevel: limitCheck.kycLevel,
          dailyLimit: limitCheck.dailyLimit,
          currentDailyTotal: limitCheck.currentDailyTotal,
          remainingLimit: limitCheck.remainingLimit,
          message: limitCheck.message,
          upgradeAvailable: limitCheck.upgradeAvailable,
        },
      });
    }

    // Use distributed lock to prevent duplicate transactions from same phone number
    const result = await lockManager.withLock(
      LockKeys.phoneNumber(phoneNumber),
      async () => {
        const transaction = await transactionModel.create({
          type: "deposit",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
          status: TransactionStatus.Pending,
          tags: [],
          notes,
        });

        const job = await addTransactionJob({
          transactionId: transaction.id,
          type: "deposit",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
        });

        return {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          status: TransactionStatus.Pending,
          jobId: job.id,
        };
      },
      15000,
    );

    res.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unable to acquire lock")
    ) {
      return res
        .status(409)
        .json({
          error: "Transaction already in progress for this phone number",
        });
    }
    res.status(500).json({ error: "Transaction failed" });
  }
};

export const withdrawHandler = async (req: Request, res: Response) => {
  try {
    const { amount, phoneNumber, provider, stellarAddress, userId, notes } =
      req.body;

    // Validate transaction limit
    const limitCheck = await transactionLimitService.checkTransactionLimit(
      userId,
      parseFloat(amount),
    );

    if (!limitCheck.allowed) {
      return res.status(400).json({
        error: "Transaction limit exceeded",
        details: {
          kycLevel: limitCheck.kycLevel,
          dailyLimit: limitCheck.dailyLimit,
          currentDailyTotal: limitCheck.currentDailyTotal,
          remainingLimit: limitCheck.remainingLimit,
          message: limitCheck.message,
          upgradeAvailable: limitCheck.upgradeAvailable,
        },
      });
    }

    const result = await lockManager.withLock(
      LockKeys.phoneNumber(phoneNumber),
      async () => {
        const transaction = await transactionModel.create({
          type: "withdraw",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
          status: TransactionStatus.Pending,
          tags: [],
          notes,
        });

        const job = await addTransactionJob({
          transactionId: transaction.id,
          type: "withdraw",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
        });

        return {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          status: TransactionStatus.Pending,
          jobId: job.id,
        };
      },
      15000,
    );

    res.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unable to acquire lock")
    ) {
      return res.status(409).json({
        error: "Transaction already in progress for this phone number",
      });
    }
    res.status(500).json({ error: "Transaction failed" });
  }
};

// ------------------ Other Handlers (no validation needed) ------------------
export const getTransactionHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const transaction = await transactionModel.findById(id);
    if (!transaction)
      return res.status(404).json({ error: "Transaction not found" });

    let jobProgress = null;
    if (transaction.status === TransactionStatus.Pending) {
      jobProgress = await getJobProgress(id);
    }
    const timeoutMinutes = Number(
      process.env.TRANSACTION_TIMEOUT_MINUTES || 30,
    );

    if (transaction.status === TransactionStatus.Pending) {
      const createdAt = new Date(transaction.createdAt).getTime();
      const now = Date.now();

      const diffMinutes = (now - createdAt) / (1000 * 60);

      if (diffMinutes > timeoutMinutes) {
        await transactionModel.updateStatus(id, TransactionStatus.Failed);

        console.log("Transaction timed out (on fetch)", {
          transactionId: id,
          timeoutMinutes,
          reason: "Transaction timeout",
        });

        transaction.status = TransactionStatus.Failed;
        (transaction as { reason?: string }).reason = "Transaction timeout";
      }
    }
    res.json({ ...transaction, jobProgress });
  } catch (err) {
    console.error("Failed to fetch transaction:", err);
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
};

export const cancelTransactionHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const transaction = await transactionModel.findById(id);
    if (!transaction)
      return res.status(404).json({ error: "Transaction not found" });

    if (transaction.status !== TransactionStatus.Pending)
      return res
        .status(400)
        .json({
          error: `Cannot cancel transaction with status '${transaction.status}'`,
        });

    await transactionModel.updateStatus(id, TransactionStatus.Cancelled);
    const updatedTransaction = await transactionModel.findById(id);
    if (!updatedTransaction)
      return res
        .status(500)
        .json({ error: "Failed to load transaction after cancel" });

    if (process.env.WEBHOOK_URL) {
      try {
        await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "transaction.cancelled",
            data: updatedTransaction,
          }),
        });
      } catch (webhookError) {
        console.error("Webhook notification failed", webhookError);
      }
    }

    res.json({
      message: "Transaction cancelled successfully",
      transaction: updatedTransaction,
    });
  } catch (err) {
    console.error("Failed to cancel transaction:", err);
    res.status(500).json({
      error: "Failed to cancel transaction",
    });
  }
};

export const updateNotesHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (typeof notes !== "string") {
      return res.status(400).json({ error: "Notes must be a string" });
    }

    const transaction = await transactionModel.updateNotes(id, notes);
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(transaction);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update notes";
    res
      .status(
        err instanceof Error && err.message.includes("characters") ? 400 : 500,
      )
      .json({ error: message });
  }
};

export const updateAdminNotesHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    if (typeof admin_notes !== "string") {
      return res.status(400).json({ error: "Admin notes must be a string" });
    }

    const transaction = await transactionModel.updateAdminNotes(
      id,
      admin_notes,
    );
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(transaction);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update admin notes";
    res
      .status(
        err instanceof Error && err.message.includes("characters") ? 400 : 500,
      )
      .json({ error: message });
  }
};

export const searchTransactionsHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const transactions = await transactionModel.searchByNotes(q);
    res.json(transactions);
  } catch (err) {
    console.error("Search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
};
