import { Request, Response } from "express";
import { StellarService } from "../services/stellar/stellarService";
import { MobileMoneyService } from "../services/mobilemoney/mobileMoneyService";
import { TransactionModel, TransactionStatus } from "../models/transaction";
import { lockManager, LockKeys } from "../utils/lock";
import { TransactionLimitService } from "../services/transactionLimit/transactionLimitService";
import { KYCService } from "../services/kyc/kycService";
import { addTransactionJob, getJobProgress } from "../queue";
import {
  TransactionResponse,
  TransactionDetailResponse,
  CancelTransactionResponse,
  LimitExceededErrorResponse,
} from "../types/api";

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

export const depositHandler = async (req: Request, res: Response) => {
  try {
    const { amount, phoneNumber, provider, stellarAddress, userId } = req.body;

    // Validate transaction limit
    const limitCheck = await transactionLimitService.checkTransactionLimit(
      userId,
      parseFloat(amount),
    );

    if (!limitCheck.allowed) {
      const body: LimitExceededErrorResponse = {
        error: "Transaction limit exceeded",
        details: {
          kycLevel: limitCheck.kycLevel,
          dailyLimit: limitCheck.dailyLimit,
          currentDailyTotal: limitCheck.currentDailyTotal,
          remainingLimit: limitCheck.remainingLimit,
          message: limitCheck.message,
          upgradeAvailable: limitCheck.upgradeAvailable,
        },
      };
      return res.status(400).json(body);
    }

    // Use distributed lock to prevent duplicate transactions from same phone number
    const result = await lockManager.withLock(
      LockKeys.phoneNumber(phoneNumber),
      async (): Promise<TransactionResponse> => {
        const transaction = await transactionModel.create({
          type: "deposit",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
          status: TransactionStatus.Pending,
          tags: [],
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
      return res.status(409).json({
        error: "Transaction already in progress for this phone number",
      });
    }
    res.status(500).json({ error: "Transaction failed" });
  }
};

export const withdrawHandler = async (req: Request, res: Response) => {
  try {
    const { amount, phoneNumber, provider, stellarAddress, userId } = req.body;

    // Validate transaction limit
    const limitCheck = await transactionLimitService.checkTransactionLimit(
      userId,
      parseFloat(amount),
    );

    if (!limitCheck.allowed) {
      const body: LimitExceededErrorResponse = {
        error: "Transaction limit exceeded",
        details: {
          kycLevel: limitCheck.kycLevel,
          dailyLimit: limitCheck.dailyLimit,
          currentDailyTotal: limitCheck.currentDailyTotal,
          remainingLimit: limitCheck.remainingLimit,
          message: limitCheck.message,
          upgradeAvailable: limitCheck.upgradeAvailable,
        },
      };
      return res.status(400).json(body);
    }

    // Use distributed lock to prevent duplicate transactions from same phone number
    const result = await lockManager.withLock(
      LockKeys.phoneNumber(phoneNumber),
      async (): Promise<TransactionResponse> => {
        const transaction = await transactionModel.create({
          type: "withdraw",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
          status: TransactionStatus.Pending,
          tags: [],
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

export const getTransactionHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const transaction = await transactionModel.findById(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

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
    const response: TransactionDetailResponse = { ...transaction, jobProgress };
    res.json(response);
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

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    if (transaction.status !== TransactionStatus.Pending) {
      return res.status(400).json({
        error: `Cannot cancel transaction with status '${transaction.status}'`,
      });
    }

    await transactionModel.updateStatus(id, TransactionStatus.Cancelled);
    const updatedTransaction = await transactionModel.findById(id);
    if (!updatedTransaction) {
      return res.status(500).json({
        error: "Failed to load transaction after cancel",
      });
    }

    console.log("Transaction cancelled", {
      transactionId: id,
      reason: reason || null,
      cancelledAt: new Date().toISOString(),
    });

    try {
      if (process.env.WEBHOOK_URL) {
        await fetch(process.env.WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event: "transaction.cancelled",
            data: updatedTransaction,
          }),
        });
      }
    } catch (webhookError) {
      console.error("Webhook notification failed", webhookError);
    }

    const body: CancelTransactionResponse = {
      message: "Transaction cancelled successfully",
      transaction: updatedTransaction,
    };
    return res.json(body);
  } catch (err) {
    console.error("Failed to cancel transaction:", err);
    res.status(500).json({
      error: "Failed to cancel transaction",
    });
  }
};
