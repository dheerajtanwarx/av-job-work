import { Router } from "express";

/** Unauthenticated, read-only, token-addressed views (QR challan view). Mounted before requireAuth. */
export const publicRouter = Router();
