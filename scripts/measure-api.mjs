// Measures how fast the live API answers what the mobile app loads, alone and with several people at once.
// Read-only: it logs in and only makes GET requests.
//
//   node scripts/measure-api.mjs [https://api.example.com]
//
// Asks for the email and password (not echoed, never printed or saved). Defaults to the production API.
import { createInterface } from "node:readline";

const API = (process.argv[2] ?? "https://api.jaipuriodhani.com").replace(/\/+$/, "");

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "");
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

const email = process.env.AV_EMAIL ?? (await ask("Email: "));
const password = process.env.AV_PASSWORD ?? (await ask("Password: ", true));

const login = await fetch(`${API}/auth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
if (!login.ok) {
  console.error(`Login failed (${login.status}): ${(await login.text()).slice(0, 200)}`);
  process.exit(1);
}
const { token } = await login.json();
const headers = { Authorization: `Bearer ${token}` };

async function get(path) {
  const t = performance.now();
  const res = await fetch(`${API}${path}`, { headers });
  const body = Buffer.from(await res.arrayBuffer());
  return { path, status: res.status, ms: performance.now() - t, bytes: body.length, body };
}

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// What the app's main screens ask for.
const SCREENS = ["/dashboard", "/jobs", "/jobs?pending=true", "/returns?skip=0&take=30", "/clients", "/clients?simple=true", "/products", "/designs", "/materials", "/sub-bills", "/main-bills", "/settings", "/photos?take=30"];

console.log(`\nAPI: ${API}\n\n1) Each screen's data, one at a time (median of 3)`);
const ref = {};
for (const path of SCREENS) {
  const runs = [];
  let last;
  for (let i = 0; i < 3; i++) runs.push((last = await get(path)).ms);
  ref[path] = median(runs);
  console.log(`   ${path.padEnd(28)} ${String(last.status).padEnd(4)} ${fmt(median(runs)).padStart(7)}   ${kb(last.bytes).padStart(8)}`);
}

// Photo thumbnails, the way a list screen loads them: all at once.
let thumbs = [];
const photos = await get("/photos?take=30");
try {
  thumbs = JSON.parse(photos.body.toString()).rows.map((p) => `/photos/${p.id}/thumb`);
} catch {}
const loadThumbs = async () => {
  const t = performance.now();
  const rs = await Promise.all(thumbs.map(get));
  return { ms: performance.now() - t, slowest: Math.max(...rs.map((r) => r.ms)), bytes: rs.reduce((n, r) => n + r.bytes, 0), bad: rs.filter((r) => r.status !== 200).length };
};
if (thumbs.length) {
  const one = await get(thumbs[0]);
  console.log(`\n2) Photos\n   one thumbnail                ${fmt(one.ms)}   ${kb(one.bytes)}`);
  const all = await loadThumbs();
  console.log(`   ${thumbs.length} thumbnails at once        ${fmt(all.ms)}   ${kb(all.bytes)}${all.bad ? `   (${all.bad} failed)` : ""}`);
} else console.log("\n2) Photos: none found, skipped");

// One "person" = opening the main screens and the photo list, the way the app does on start.
async function person() {
  const t = performance.now();
  const rs = await Promise.all(["/dashboard", "/jobs", "/returns?skip=0&take=30", "/clients?simple=true", "/settings"].map(get));
  if (thumbs.length) await loadThumbs();
  return { ms: performance.now() - t, worst: rs.reduce((a, r) => (r.ms > a.ms ? r : a)) };
}

console.log("\n3) Several people opening the app at the same moment");
for (const n of [1, 2, 4]) {
  const rs = await Promise.all(Array.from({ length: n }, person));
  const worst = rs.reduce((a, r) => (r.worst.ms > a.worst.ms ? r : a)).worst;
  console.log(`   ${n} ${n === 1 ? "person: " : "people: "}  everything loaded in ${fmt(Math.max(...rs.map((r) => r.ms)))}   slowest call ${worst.path} ${fmt(worst.ms)}`);
}

const health = await get("/health");
console.log(`\nServer: ${health.body.toString()}\n`);
