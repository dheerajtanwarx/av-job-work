import { connectDb, disconnectDb, syncIndexes } from "../src/index.js";

/** Creates every collection and makes its indexes match the schemas (run after changing an index). */
connectDb()
  .then(async () => {
    for (const [name, result] of await syncIndexes()) console.log(`${name}: ${result.length ? `dropped ${result.join(", ")}` : "ok"}`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
