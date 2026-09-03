import os from "node:os";
import path from "node:path";

import "dotenv/config";

const str = (name, fallback = "") => (process.env[name] ?? "").trim() || fallback;
const int = (name, fallback) => {
  const parsed = Number.parseInt(str(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  apiKey: str("BACKEND_API_KEY"),
  corsOrigins: str("CORS_ORIGINS", "*").split(",").map((o) => o.trim()).filter(Boolean),
  port: int("PORT", 8000),

  supabaseUrl: str("SUPABASE_URL"),
  supabaseServiceKey: str("SUPABASE_SERVICE_ROLE_KEY"),

  telegramApiId: str("TELEGRAM_API_ID"),
  telegramApiHash: str("TELEGRAM_API_HASH"),
  telegramPhone: str("TELEGRAM_PHONE"),
  telegramSession: str("TELEGRAM_SESSION_STRING"),

  r2AccountId: str("R2_ACCOUNT_ID"),
  r2AccessKeyId: str("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: str("R2_SECRET_ACCESS_KEY"),
  r2BucketName: str("R2_BUCKET_NAME"),
  r2EndpointUrl: str("R2_ENDPOINT_URL"),
  r2PublicUrl: str("R2_PUBLIC_URL"),
  r2Region: str("R2_REGION", "auto"),

  workerInterval: int("WORKER_INTERVAL", 30),
  maxConcurrentDownloads: int("MAX_CONCURRENT_DOWNLOADS", 0),
  // Default per platform, so Windows does not end up with a stray C:\tmp.
  downloadDir: str("DOWNLOAD_DIR") || path.join(os.tmpdir(), "tg-downloads"),
};
