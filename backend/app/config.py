"""Environment-backed configuration for the userbot service."""
import os
import tempfile

from dotenv import load_dotenv

load_dotenv()


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _get_int(name: str, default: int) -> int:
    raw = _get(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


class Settings:
    api_key = _get("BACKEND_API_KEY")
    cors_origins = [o.strip() for o in _get("CORS_ORIGINS", "*").split(",") if o.strip()]
    port = _get_int("PORT", 8000)

    supabase_url = _get("SUPABASE_URL")
    supabase_service_key = _get("SUPABASE_SERVICE_ROLE_KEY")

    telegram_api_id = _get("TELEGRAM_API_ID")
    telegram_api_hash = _get("TELEGRAM_API_HASH")
    telegram_phone = _get("TELEGRAM_PHONE")
    telegram_session = _get("TELEGRAM_SESSION_STRING")

    r2_account_id = _get("R2_ACCOUNT_ID")
    r2_access_key_id = _get("R2_ACCESS_KEY_ID")
    r2_secret_access_key = _get("R2_SECRET_ACCESS_KEY")
    r2_bucket_name = _get("R2_BUCKET_NAME")
    r2_endpoint_url = _get("R2_ENDPOINT_URL")
    r2_public_url = _get("R2_PUBLIC_URL")
    r2_region = _get("R2_REGION", "auto")

    worker_interval = _get_int("WORKER_INTERVAL", 30)
    max_concurrent_downloads = _get_int("MAX_CONCURRENT_DOWNLOADS", 0)
    # Default per platform, so Windows does not end up with a stray C:\tmp.
    download_dir = _get("DOWNLOAD_DIR") or os.path.join(tempfile.gettempdir(), "tg-downloads")


settings = Settings()
