import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
