import "@av/db"; // loads the root .env

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    /** e.g. "AV Textiles <billing@example.com>". Defaults to SMTP_USER. */
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
  },
};
