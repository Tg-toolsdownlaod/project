"""Cloudflare R2 (S3-compatible) helpers."""
import re
from typing import Any, Callable, Optional

import boto3
from botocore.config import Config

from .db import r2_settings


class R2NotConfigured(RuntimeError):
    pass


def _client_and_bucket() -> tuple[Any, str, dict[str, Any]]:
    conf = r2_settings()
    missing = [
        key for key in ("access_key_id", "secret_access_key", "bucket_name")
        if not conf.get(key)
    ]
    if missing:
        raise R2NotConfigured(f"R2 is not configured: missing {', '.join(missing)}.")

    endpoint = conf["endpoint_url"]
    if not endpoint and conf.get("account_id"):
        endpoint = f"https://{conf['account_id']}.r2.cloudflarestorage.com"
    if not endpoint:
        raise R2NotConfigured("R2 is not configured: no endpoint URL or account ID.")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=conf["access_key_id"],
        aws_secret_access_key=conf["secret_access_key"],
        region_name=conf.get("region") or "auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )
    return client, conf["bucket_name"], conf


def ping() -> bool:
    """Cheap reachability check for /health — one HEAD, no listing."""
    try:
        client, bucket, _ = _client_and_bucket()
        client.head_bucket(Bucket=bucket)
        return True
    except Exception:
        return False


def test_connection() -> dict[str, Any]:
    """Lists the bucket to prove the credentials work, and sizes what is in it."""
    client, bucket, _ = _client_and_bucket()
    paginator = client.get_paginator("list_objects_v2")
    object_count = 0
    total_bytes = 0
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            object_count += 1
            total_bytes += obj.get("Size", 0)
    return {"bucket": bucket, "object_count": object_count, "total_bytes": total_bytes}


def upload(
    local_path: str,
    key: str,
    content_type: str = "video/mp4",
    on_progress: Optional[Callable[[int], None]] = None,
) -> str:
    """Uploads a staged file and returns its public URL (or the bare key)."""
    client, bucket, conf = _client_and_bucket()
    client.upload_file(
        local_path,
        bucket,
        key,
        ExtraArgs={"ContentType": content_type},
        Callback=on_progress,
    )
    public = (conf.get("public_url") or "").rstrip("/")
    return f"{public}/{key}" if public else key


def build_key(pattern: str, group: str, topic: str, ep: Optional[int], file_name: str) -> str:
    """Renders the configured folder pattern into a safe object key."""
    ep_text = str(ep).zfill(3) if ep is not None else "000"
    rendered = (
        pattern.replace("{group}", _slug(group))
        .replace("{topic}", _slug(topic or "general"))
        .replace("{ep}", ep_text)
    )
    suffix = file_name.rsplit(".", 1)[-1] if "." in file_name else "mp4"
    return f"{rendered.strip('/')}.{suffix}"


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^\w\-. ]+", "", value or "", flags=re.UNICODE).strip()
    return re.sub(r"\s+", "-", cleaned) or "untitled"
