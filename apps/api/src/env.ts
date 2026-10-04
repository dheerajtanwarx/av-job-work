import "@av/db"; // loads the root .env

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
};
