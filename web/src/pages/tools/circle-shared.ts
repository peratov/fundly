import type { CircleBody } from "../../../../shared/schemas";
import { formatMoney } from "../../../../shared/money";
import { ApiError } from "../../lib/api";

export type Circle = CircleBody;

export interface CircleView {
  slug: string;
  organizerName: string;
  circle: Circle;
  payments: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export const CURRENCY_OPTIONS = ["GHS", "NGN", "KES", "UGX", "ZAR", "USD", "GBP", "EUR"] as const;

/** Each friend gets a stable colour from this set, by position. */
export const MEMBER_COLORS = [
  // Teal and slate, alternating, so neighbours on the wheel stay easy to tell apart.
  { bg: "#0d9488", grad: "from-brand-500 to-brand-700" },
  { bg: "#475569", grad: "from-slate-500 to-slate-700" },
  { bg: "#14b8a6", grad: "from-brand-400 to-brand-600" },
  { bg: "#1e293b", grad: "from-slate-700 to-slate-900" },
  { bg: "#115e59", grad: "from-brand-700 to-brand-900" },
  { bg: "#64748b", grad: "from-slate-400 to-slate-600" },
  { bg: "#2f6f69", grad: "from-grape-400 to-grape-600" },
  { bg: "#334155", grad: "from-slate-600 to-slate-800" },
];
export const colorFor = (index: number) => MEMBER_COLORS[index % MEMBER_COLORS.length];

export const fmt = (minor: number, currency: string) => formatMoney(minor, currency).replace(/\.00$/, "");

export const newId = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- organiser tokens (kept on this device only)

const TOKENS_KEY = "fundly-circle-tokens";

export function getToken(slug: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}") as Record<string, string>)[slug] ?? null;
  } catch {
    return null;
  }
}

export function saveToken(slug: string, token: string) {
  try {
    const all = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}") as Record<string, string>;
    all[slug] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* private mode: the owner link still works */
  }
}

export function myCircles(): string[] {
  try {
    return Object.keys(JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}"));
  } catch {
    return [];
  }
}

/** Calls the public circle API, sending the organiser's edit token when we have one. */
export async function circleApi<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Edit-Token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Something went wrong", data?.error?.details);
  return data as T;
}

export function shareUrl(slug: string) {
  return `${location.origin}/c/${slug}`;
}

export function ownerUrl(slug: string, token: string) {
  // The token lives in the fragment, which browsers never send to servers or put in logs.
  return `${location.origin}/c/${slug}#edit=${token}`;
}

export function whatsappLink(text: string, phone?: string) {
  const digits = phone?.replace(/\D/g, "");
  return `https://wa.me/${digits ?? ""}?text=${encodeURIComponent(text)}`;
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
