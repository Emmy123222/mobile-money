/**
 * Fee calculation utility.
 *
 * Reads FEE_PERCENTAGE, FEE_MINIMUM, and FEE_MAXIMUM from environment variables.
 * Falls back to sensible defaults if not set.
 *
 * Example:
 *   Amount: 10000, Fee: 1.5%, Min: 50, Max: 5000
 *   Calculated: 10000 * 0.015 = 150
 *   Result: { fee: 150, total: 10150 }
 */

const FEE_PERCENTAGE = parseFloat(process.env.FEE_PERCENTAGE ?? "1.5");
const FEE_MINIMUM = parseFloat(process.env.FEE_MINIMUM ?? "50");
const FEE_MAXIMUM = parseFloat(process.env.FEE_MAXIMUM ?? "5000");

export interface FeeResult {
  fee: number;
  total: number;
}

export function calculateFee(amount: number): FeeResult {
  let fee = amount * (FEE_PERCENTAGE / 100);

  if (fee < FEE_MINIMUM) fee = FEE_MINIMUM;
  if (fee > FEE_MAXIMUM) fee = FEE_MAXIMUM;

  return {
    fee: parseFloat(fee.toFixed(2)),
    total: parseFloat((amount + fee).toFixed(2)),
  };
}
