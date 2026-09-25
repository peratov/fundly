import type { Context } from "hono";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, "bad_request", msg, details);
export const unauthorized = (msg = "Please sign in") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You don't have permission to do that") => new AppError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const unprocessable = (msg: string, details?: unknown) => new AppError(422, "unprocessable", msg, details);

function fromZod(err: z.ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const first = err.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  return new AppError(422, "validation_failed", `${where}${first?.message ?? "Invalid input"}`, { fields });
}

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
