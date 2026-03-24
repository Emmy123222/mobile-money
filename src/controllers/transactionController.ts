import { Request, Response } from "express";
import { StellarService } from "../services/stellar/stellarService";
import { MobileMoneyService } from "../services/mobilemoney/mobileMoneyService";
import { TransactionModel } from "../models/transaction";
import { lockManager, LockKeys } from "../utils/lock";
import { addTransactionJob, getJobProgress } from "../queue";

const stellarService = new StellarService();
const mobileMoneyService = new MobileMoneyService();
const transactionModel = new TransactionModel();

export const depositHandler = async (req: Request, res: Response) => {
  try {
    const { amount, phoneNumber, provider, stellarAddress } = req.body;

    const result = await lockManager.withLock(
      LockKeys.phoneNumber(phoneNumber),
      async () => {
        const transaction = await transactionModel.create({
          type: "deposit",
          amount,
          phoneNumber,
          provider,
          stellarAddress,
          status: "pending",
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
          status: "pending",
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
    const { amount, phoneNumber, provider, stellarAddress } = req.body;

    const transaction = await transactionModel.create({
      type: "withdraw",
      amount,
      phoneNumber,
      provider,
      stellarAddress,
      status: "pending",
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

    res.json({
      transactionId: transaction.id,
      referenceNumber: transaction.referenceNumber,
      status: "pending",
      jobId: job.id,
    });
  } catch (error) {
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
    if (transaction.status === "pending") {
      jobProgress = await getJobProgress(id);
    }

    res.json({ ...transaction, jobProgress });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
};
