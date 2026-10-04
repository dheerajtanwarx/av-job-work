import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

export default function setup() {
  config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, "../../../packages/db"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
