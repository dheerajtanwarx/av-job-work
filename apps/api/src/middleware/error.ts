import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return res.status(422).json({ message: Object.values(fieldErrors)[0] ?? "Please check the form", fieldErrors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
}
