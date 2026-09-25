import type { MomoNetwork } from "../../shared/enums";
import { hmacSha512Hex, safeEqualHex } from "../lib/crypto";

export interface ChargeRequest {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  phone: string;
  network: MomoNetwork;
  metadata: Record<string, string>;
}

export interface ChargeResult {
  status: "pending" | "succeeded" | "failed";
  /** Message for the payer, e.g. "Approve the prompt on your phone". */
  displayText?: string;
  failureReason?: string;
}

export interface WebhookEvent {
  reference: string;
  status: "succeeded" | "failed";
  amountMinor: number;
  failureReason?: string;
}

/**
 * Payment providers are behind one interface so the domain code (allocation to
 * contributions / loans) is identical for the dev simulator and real gateways,
 * and adding another gateway (Hubtel, Flutterwave...) is one new file.
 */
export interface PaymentProvider {
  readonly name: string;
  /** True when the dev-only "simulate outcome" endpoint may be used. */
  readonly simulated: boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  /** Ask the gateway for the current status (used when a webhook is late or missing). */
  verify(reference: string): Promise<WebhookEvent | null>;
  /** Parse and authenticate an incoming webhook. Returns null for invalid signatures or irrelevant events. */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
}

export function mockProvider(): PaymentProvider {
  return {
    name: "mock",
    simulated: true,
    async charge() {
      return { status: "pending", displayText: "Simulated MoMo prompt sent. Use the simulator to approve or decline." };
    },
    async verify() {
      return null;
    },
    parseWebhook() {
      return null;
    },
  };
}

/** Paystack Charge API for Ghana mobile money (MTN, Telecel, AirtelTigo). */
export function paystackProvider(secretKey: string, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const NETWORK_CODES: Record<MomoNetwork, string> = { mtn: "mtn", telecel: "vod", at: "atl" };
  const api = async (path: string, init?: RequestInit) => {
    const res = await fetchImpl(`https://api.paystack.co${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: Record<string, unknown> };
    return { ok: res.ok && json.status !== false, json };
  };

  return {
    name: "paystack",
    simulated: false,
    async charge(req) {
      const { ok, json } = await api("/charge", {
        method: "POST",
        body: JSON.stringify({
          email: req.email,
          amount: req.amountMinor,
          currency: req.currency,
          reference: req.reference,
          mobile_money: { phone: req.phone.replace(/\s+/g, ""), provider: NETWORK_CODES[req.network] },
          metadata: req.metadata,
        }),
      });
      if (!ok) return { status: "failed", failureReason: json.message ?? "Payment gateway rejected the charge" };
      const status = String(json.data?.status ?? "");
      if (status === "success") return { status: "succeeded" };
      if (status === "failed") return { status: "failed", failureReason: String(json.data?.gateway_response ?? "Charge failed") };
      return { status: "pending", displayText: String(json.data?.display_text ?? "Approve the payment prompt on your phone.") };
    },
    async verify(reference) {
      const { ok, json } = await api(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (!ok || !json.data) return null;
      const status = String(json.data.status);
      if (status !== "success" && status !== "failed" && status !== "abandoned") return null;
      return {
        reference,
        status: status === "success" ? "succeeded" : "failed",
        amountMinor: Number(json.data.amount ?? 0),
        failureReason: status === "success" ? undefined : String(json.data.gateway_response ?? status),
      };
    },
    parseWebhook(rawBody, headers) {
      const signature = headers.get("x-paystack-signature") ?? "";
      if (!signature || !safeEqualHex(hmacSha512Hex(secretKey, rawBody), signature)) return null;
      const evt = JSON.parse(rawBody) as { event?: string; data?: { reference?: string; amount?: number; gateway_response?: string } };
      if (!evt.data?.reference) return null;
      if (evt.event === "charge.success") return { reference: evt.data.reference, status: "succeeded", amountMinor: Number(evt.data.amount ?? 0) };
      if (evt.event === "charge.failed") return { reference: evt.data.reference, status: "failed", amountMinor: Number(evt.data.amount ?? 0), failureReason: evt.data.gateway_response };
      return null;
    },
  };
}
