import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Record") => new HttpError(404, `${what} not found`);
export const unprocessable = (message: string, details?: unknown) => new HttpError(422, message, details);

export function parse<T extends ZodType>(schema: T, data: unknown) {
  return schema.parse(data) as T["_zod"]["output"];
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function param(v: unknown): string {
  if (typeof v !== "string") throw notFound();
  return v;
}
