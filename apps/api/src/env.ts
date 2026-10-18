import "@av/db"; // loads the root .env

export const env = {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  /** Google OAuth "Web application" client ID. Empty: "Continue with Google" is hidden on web and mobile. */
  googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  /** Calendar days (today, overdue, aging) are counted in this time zone. */
  businessTz: process.env.BUSINESS_TZ || "Asia/Kolkata",
  /** Where uploaded photos are stored (local disk driver). */
  uploadDir: process.env.UPLOAD_DIR || new URL("../../../uploads/", import.meta.url).pathname,
  /** Cloudflare R2 photo storage. When all four are set, photos go there instead of uploadDir. */
  r2: {
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  /** apps/api/assets. Resolved from this file, which sits one level below apps/api in both src/ and the dist/ bundle. */
  assetsDir: new URL("../assets/", import.meta.url).pathname,
  /** Public base URL of the web app, used in QR codes. */
  publicWebUrl: process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "http://localhost:3000",
  /** WhatsApp Business Cloud API (Meta). Sending is skipped – and the app falls back to sharing from the device – until token and phone number id are set. */
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    /** Approved message templates with a DOCUMENT header (see README → WhatsApp). */
    templateReturn: process.env.WHATSAPP_TEMPLATE_RETURN || "return_receipt",
    templateIssue: process.env.WHATSAPP_TEMPLATE_ISSUE || "material_issue",
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "en",
  },
};
