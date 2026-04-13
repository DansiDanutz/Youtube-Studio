"""
Storage — S3/MinIO wrapper for YuteStudio assets.

Each render droplet (Dexter/Nano/Memo/Sienna) has its own bucket-prefix via
env vars:

    RENDER_DEXTER_ENDPOINT / RENDER_DEXTER_BUCKET / RENDER_DEXTER_ACCESS_KEY / RENDER_DEXTER_SECRET_KEY
    RENDER_NANO_*
    RENDER_MEMO_*
    RENDER_SIENNA_*

If a droplet has no env configured, we fall back to a local filesystem backend
rooted at $YUTE_LOCAL_STORAGE (default: /tmp/yute-assets/). That keeps offline
tests and smoke runs hermetic.

Public API:
    put_bytes(droplet, project_id, filename, data, content_type="application/octet-stream") -> url
    url_for(droplet, project_id, filename) -> url   (used for idempotency checks)
    exists(droplet, project_id, filename) -> bool
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

log = logging.getLogger(__name__)

Droplet = Literal["dexter", "nano", "memo", "sienna"]
_VALID_DROPLETS: tuple[Droplet, ...] = ("dexter", "nano", "memo", "sienna")


@dataclass
class _DropletConfig:
    name: Droplet
    endpoint: str | None
    bucket: str | None
    access_key: str | None
    secret_key: str | None
    region: str
    public_base: str | None  # override for presigned URLs

    @property
    def has_s3(self) -> bool:
        return bool(self.endpoint and self.bucket and self.access_key and self.secret_key)


_LOCK = threading.Lock()
_S3_CLIENTS: dict[Droplet, object] = {}


def _env_for(d: Droplet) -> _DropletConfig:
    k = d.upper()
    return _DropletConfig(
        name=d,
        endpoint=os.environ.get(f"RENDER_{k}_ENDPOINT"),
        bucket=os.environ.get(f"RENDER_{k}_BUCKET"),
        access_key=os.environ.get(f"RENDER_{k}_ACCESS_KEY"),
        secret_key=os.environ.get(f"RENDER_{k}_SECRET_KEY"),
        region=os.environ.get(f"RENDER_{k}_REGION", "us-east-1"),
        public_base=os.environ.get(f"RENDER_{k}_PUBLIC_BASE"),
    )


def _local_root() -> Path:
    root = Path(os.environ.get("YUTE_LOCAL_STORAGE", "/tmp/yute-assets"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _validate(droplet: str) -> Droplet:
    if droplet not in _VALID_DROPLETS:
        raise ValueError(f"unknown droplet {droplet!r}; expected one of {_VALID_DROPLETS}")
    return droplet  # type: ignore[return-value]


def _object_key(project_id: str, filename: str) -> str:
    # Namespaced per-project to keep listings tidy.
    safe = filename.lstrip("/").replace("..", "_")
    return f"runs/{project_id}/{safe}"


def _s3_client(cfg: _DropletConfig):
    """Lazy, thread-safe boto3 client keyed per droplet."""
    if not cfg.has_s3:
        return None
    with _LOCK:
        if cfg.name in _S3_CLIENTS:
            return _S3_CLIENTS[cfg.name]
        try:
            import boto3  # type: ignore
        except ImportError:
            log.warning("boto3 not installed — falling back to local storage for %s", cfg.name)
            return None
        client = boto3.client(
            "s3",
            endpoint_url=cfg.endpoint,
            aws_access_key_id=cfg.access_key,
            aws_secret_access_key=cfg.secret_key,
            region_name=cfg.region,
        )
        _S3_CLIENTS[cfg.name] = client
        return client


def put_bytes(
    droplet: str,
    project_id: str,
    filename: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload bytes and return a URL usable by downstream stages.

    S3 mode  → https://<public_base>/<key>  (or endpoint/bucket/key)
    Local    → file://<absolute-path>
    """
    d = _validate(droplet)
    cfg = _env_for(d)
    key = _object_key(project_id, filename)

    client = _s3_client(cfg)
    if client is not None:
        client.put_object(
            Bucket=cfg.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return _s3_url(cfg, key)

    # Local fallback — useful for tests and pre-production.
    path = _local_root() / d / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"file://{path.resolve()}"


def url_for(droplet: str, project_id: str, filename: str) -> str:
    d = _validate(droplet)
    cfg = _env_for(d)
    key = _object_key(project_id, filename)
    if cfg.has_s3:
        return _s3_url(cfg, key)
    return f"file://{(_local_root() / d / key).resolve()}"


def exists(droplet: str, project_id: str, filename: str) -> bool:
    d = _validate(droplet)
    cfg = _env_for(d)
    key = _object_key(project_id, filename)

    client = _s3_client(cfg)
    if client is not None:
        try:
            client.head_object(Bucket=cfg.bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001
            return False

    return (_local_root() / d / key).exists()


def _s3_url(cfg: _DropletConfig, key: str) -> str:
    if cfg.public_base:
        return f"{cfg.public_base.rstrip('/')}/{key}"
    endpoint = (cfg.endpoint or "").rstrip("/")
    return f"{endpoint}/{cfg.bucket}/{key}"
