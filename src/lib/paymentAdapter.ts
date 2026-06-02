"use client";

export type PaymentIntentStatus = "not_required" | "requires_payment" | "stubbed";

export type PaymentIntentInput = {
  amount: number;
  currency?: "SAR";
  requestId: string;
  serviceId?: string;
};

export type PaymentIntentResult = {
  id: string;
  amount: number;
  currency: "SAR";
  status: PaymentIntentStatus;
  provider: "stub";
};

export async function createPaymentIntentStub(input: PaymentIntentInput): Promise<PaymentIntentResult> {
  const amount = Math.max(0, input.amount);
  return {
    id: amount > 0 ? `pi_stub_${input.requestId}` : `pi_not_required_${input.requestId}`,
    amount,
    currency: input.currency ?? "SAR",
    status: amount > 0 ? "requires_payment" : "not_required",
    provider: "stub",
  };
}
