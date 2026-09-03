"""Supabase access for the service.

Everything here runs with the service-role key, so it bypasses RLS. Only this
process should ever hold that key.
"""
from typing import Any, Optional

from supabase import Client, create_client

from .config import settings

_client: Optional[Client] = None


def db() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def single(table: str) -> dict[str, Any]:
    """Reads the one settings row a table is expected to hold ({} when empty)."""
    res = db().table(table).select("*").limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else {}


def upsert_single(table: str, values: dict[str, Any]) -> dict[str, Any]:
    """Updates the single settings row, inserting it when the table is empty."""
    existing = single(table)
    if existing:
        res = db().table(table).update(values).eq("id", existing["id"]).execute()
    else:
        res = db().table(table).insert(values).execute()
    rows = res.data or []
    return rows[0] if rows else {}


def telegram_settings() -> dict[str, Any]:
    """Telegram credentials, preferring environment variables over the database."""
    row = single("telegram_settings")
    return {
        "id": row.get("id"),
        "api_id": settings.telegram_api_id or row.get("api_id") or "",
        "api_hash": settings.telegram_api_hash or row.get("api_hash") or "",
        "phone": settings.telegram_phone or row.get("phone") or "",
        "session_string": settings.telegram_session or row.get("session_string") or "",
    }


def r2_settings() -> dict[str, Any]:
    """R2 credentials, preferring environment variables over the database."""
    row = single("r2_settings")
    return {
        "id": row.get("id"),
        "account_id": settings.r2_account_id or row.get("account_id") or "",
        "access_key_id": settings.r2_access_key_id or row.get("access_key_id") or "",
        "secret_access_key": settings.r2_secret_access_key or row.get("secret_access_key") or "",
        "bucket_name": settings.r2_bucket_name or row.get("bucket_name") or "",
        "endpoint_url": settings.r2_endpoint_url or row.get("endpoint_url") or "",
        "public_url": settings.r2_public_url or row.get("public_url") or "",
        "region": settings.r2_region or row.get("region") or "auto",
    }


def download_settings() -> dict[str, Any]:
    row = single("download_settings")
    return {
        "concurrent_downloads": row.get("concurrent_downloads") or 3,
        "auto_start": row.get("auto_start", True),
        "auto_r2_upload": row.get("auto_r2_upload", True),
        "r2_folder_pattern": row.get("r2_folder_pattern") or "{group}/{topic}/EP{ep}",
        "max_retries": row.get("max_retries") or 3,
        "retry_on_fail": row.get("retry_on_fail", True),
    }
