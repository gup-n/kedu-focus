#!/usr/bin/env python3
"""Minimal HTTPS sync endpoint for the Kedu focus planner.

The browser client only needs GET and PUT for one versioned JSON backup. This
server intentionally does not expose directory listings or general WebDAV file
operations.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import shutil
import signal
import ssl
import tempfile
import threading
from datetime import datetime, timezone
from dataclasses import dataclass
from email.utils import formatdate
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable
from urllib.parse import quote, urlsplit

MAX_BACKUP_BYTES = 8 * 1024 * 1024
BACKUP_FORMAT = "focus-planner-backup"
SCHEMA_VERSION = 1
SERVER_ID_HEADER = "X-Kedu-Sync-Server"
SERVER_ID = "1"
SERVER_EMPTY_HEADER = "X-Kedu-Sync-Empty"
SERVER_ARCHIVE_HEADER = "X-Kedu-Sync-Archived-Version"


@dataclass(frozen=True)
class SyncConfig:
    host: str
    port: int
    data_dir: Path
    filename: str
    username: str
    password: str
    allowed_origins: frozenset[str]
    tls_cert: Path | None = None
    tls_key: Path | None = None
    history_limit: int = 50

    @property
    def data_file(self) -> Path:
        return self.data_dir / self.filename

    @property
    def previous_file(self) -> Path:
        path = Path(self.filename)
        return self.data_dir / f"{path.stem}.previous{path.suffix}"

    @property
    def history_dir(self) -> Path:
        return self.data_dir / "history"

    @property
    def request_path(self) -> str:
        return f"/{quote(self.filename)}"

    @property
    def pid_file(self) -> Path:
        return self.data_dir / "kedu-sync.pid"


def config_from_environment() -> SyncConfig:
    filename = os.environ.get("KEDU_SYNC_FILENAME", "kedu-focus-backup.json").strip()
    if not filename or Path(filename).name != filename:
        raise ValueError("KEDU_SYNC_FILENAME must be a plain filename without directories")
    username = os.environ.get("KEDU_SYNC_USERNAME", "").strip()
    password = os.environ.get("KEDU_SYNC_PASSWORD", "")
    if not username or not password:
        raise ValueError("KEDU_SYNC_USERNAME and KEDU_SYNC_PASSWORD are required")
    origins = frozenset(
        value.strip().rstrip("/")
        for value in os.environ.get("KEDU_SYNC_ALLOWED_ORIGINS", "https://gup-n.github.io").split(",")
        if value.strip()
    )
    cert = os.environ.get("KEDU_SYNC_TLS_CERT", "").strip()
    key = os.environ.get("KEDU_SYNC_TLS_KEY", "").strip()
    return SyncConfig(
        host=os.environ.get("KEDU_SYNC_HOST", "0.0.0.0"),
        port=int(os.environ.get("KEDU_SYNC_PORT", "8443")),
        data_dir=Path(os.environ.get("KEDU_SYNC_DATA_DIR", "~/.local/share/kedu-focus-sync")).expanduser(),
        filename=filename,
        username=username,
        password=password,
        allowed_origins=origins,
        tls_cert=Path(cert).expanduser() if cert else None,
        tls_key=Path(key).expanduser() if key else None,
        history_limit=max(1, int(os.environ.get("KEDU_SYNC_HISTORY_LIMIT", "50"))),
    )


def etag_for(content: bytes) -> str:
    return f'"{hashlib.sha256(content).hexdigest()}"'


def validate_backup(content: bytes) -> None:
    try:
        payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("request body is not valid UTF-8 JSON") from error
    if not isinstance(payload, dict) or payload.get("format") != BACKUP_FORMAT:
        raise ValueError("request body is not a Kedu backup")
    if payload.get("schemaVersion") != SCHEMA_VERSION or not isinstance(payload.get("exportedAt"), str):
        raise ValueError("unsupported or incomplete Kedu backup envelope")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("backup data must be an object")
    for key in ("tasks", "categories", "sessions", "reviews", "sleep"):
        if not isinstance(data.get(key), list):
            raise ValueError(f"backup data.{key} must be an array")
    if not isinstance(data.get("settings"), dict) or not isinstance(data.get("timer"), dict):
        raise ValueError("backup settings and timer must be objects")


def archive_version(config: SyncConfig, content: bytes) -> str:
    """Store the replaced active backup as an immutable timestamped version."""
    config.history_dir.mkdir(parents=True, exist_ok=True)
    path = Path(config.filename)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    digest = hashlib.sha256(content).hexdigest()[:10]
    filename = f"{path.stem}.{stamp}.{digest}{path.suffix}"
    archive = config.history_dir / filename
    archive.write_bytes(content)
    os.chmod(archive, 0o600)
    versions = sorted(config.history_dir.glob(f"{path.stem}.*{path.suffix}"), key=lambda item: item.stat().st_mtime, reverse=True)
    for stale in versions[config.history_limit:]:
        stale.unlink(missing_ok=True)
    return filename


def handler_factory(config: SyncConfig) -> type[BaseHTTPRequestHandler]:
    write_lock = threading.Lock()

    class SyncHandler(BaseHTTPRequestHandler):
        server_version = "KeduLanSync/1.0"

        def log_message(self, message: str, *args: object) -> None:
            print(f"{self.address_string()} - {message % args}")

        def _origin_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin.rstrip("/") in config.allowed_origins

        def _cors_headers(self) -> None:
            origin = self.headers.get("Origin")
            if origin and origin.rstrip("/") in config.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Expose-Headers", f"ETag, Last-Modified, {SERVER_ID_HEADER}, {SERVER_EMPTY_HEADER}, {SERVER_ARCHIVE_HEADER}")

        def _send(self, status: HTTPStatus, body: bytes = b"", content_type: str = "text/plain; charset=utf-8", extra: dict[str, str] | None = None) -> None:
            self.send_response(status)
            self._cors_headers()
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(SERVER_ID_HEADER, SERVER_ID)
            if body:
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)

        def _error(self, status: HTTPStatus, message: str) -> None:
            self._send(status, json.dumps({"error": message}, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def _authorized(self) -> bool:
            header = self.headers.get("Authorization", "")
            if not header.startswith("Basic "):
                return False
            try:
                supplied = base64.b64decode(header[6:], validate=True).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                return False
            return hmac.compare_digest(supplied, f"{config.username}:{config.password}")

        def _guard(self) -> bool:
            if urlsplit(self.path).path != config.request_path:
                self._error(HTTPStatus.NOT_FOUND, "not found")
                return False
            if not self._origin_allowed():
                self._error(HTTPStatus.FORBIDDEN, "origin is not allowed")
                return False
            if not self._authorized():
                self.send_response(HTTPStatus.UNAUTHORIZED)
                self._cors_headers()
                self.send_header("WWW-Authenticate", 'Basic realm="Kedu LAN Sync", charset="UTF-8"')
                self.send_header(SERVER_ID_HEADER, SERVER_ID)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return False
            return True

        def do_OPTIONS(self) -> None:
            if urlsplit(self.path).path != config.request_path:
                self._error(HTTPStatus.NOT_FOUND, "not found")
                return
            if not self._origin_allowed():
                self._error(HTTPStatus.FORBIDDEN, "origin is not allowed")
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self._cors_headers()
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, If-None-Match")
            self.send_header("Access-Control-Max-Age", "7200")
            self.send_header(SERVER_ID_HEADER, SERVER_ID)
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()

        def do_HEAD(self) -> None:
            self._serve_backup()

        def do_GET(self) -> None:
            self._serve_backup()

        def _serve_backup(self) -> None:
            if not self._guard():
                return
            try:
                content = config.data_file.read_bytes()
                modified = config.data_file.stat().st_mtime
            except FileNotFoundError:
                self._send(
                    HTTPStatus.NOT_FOUND,
                    json.dumps({"error": "backup has not been created"}).encode(),
                    "application/json; charset=utf-8",
                    {SERVER_EMPTY_HEADER: "1"},
                )
                return
            self._send(
                HTTPStatus.OK,
                content,
                "application/json; charset=utf-8",
                {"ETag": etag_for(content), "Last-Modified": formatdate(modified, usegmt=True)},
            )

        def do_PUT(self) -> None:
            if not self._guard():
                return
            try:
                length = int(self.headers.get("Content-Length", ""))
            except ValueError:
                self._error(HTTPStatus.LENGTH_REQUIRED, "Content-Length is required")
                return
            if length <= 0 or length > MAX_BACKUP_BYTES:
                self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, f"backup must be between 1 and {MAX_BACKUP_BYTES} bytes")
                return
            content = self.rfile.read(length)
            try:
                validate_backup(content)
            except ValueError as error:
                self._error(HTTPStatus.BAD_REQUEST, str(error))
                return

            with write_lock:
                try:
                    current = config.data_file.read_bytes()
                except FileNotFoundError:
                    current = None
                current_etag = etag_for(current) if current is not None else None
                if self.headers.get("If-None-Match") == "*" and current is not None:
                    self._error(HTTPStatus.PRECONDITION_FAILED, "backup already exists")
                    return
                expected = self.headers.get("If-Match")
                if expected is not None and expected != current_etag:
                    self._error(HTTPStatus.PRECONDITION_FAILED, "backup changed since it was read")
                    return

                config.data_dir.mkdir(parents=True, exist_ok=True)
                archived_version = None
                if current is not None:
                    archived_version = archive_version(config, current)
                    shutil.copy2(config.data_file, config.previous_file)
                    os.chmod(config.previous_file, 0o600)
                handle, temporary_name = tempfile.mkstemp(prefix=".kedu-sync-", suffix=".json", dir=config.data_dir)
                try:
                    with os.fdopen(handle, "wb") as temporary:
                        temporary.write(content)
                        temporary.flush()
                        os.fsync(temporary.fileno())
                    os.chmod(temporary_name, 0o600)
                    os.replace(temporary_name, config.data_file)
                finally:
                    if os.path.exists(temporary_name):
                        os.unlink(temporary_name)
            extra = {"ETag": etag_for(content)}
            if archived_version:
                extra[SERVER_ARCHIVE_HEADER] = archived_version
            self._send(HTTPStatus.NO_CONTENT, extra=extra)

    return SyncHandler


def create_server(config: SyncConfig, *, use_tls: bool = True) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((config.host, config.port), handler_factory(config))
    if use_tls:
        if not config.tls_cert or not config.tls_key:
            server.server_close()
            raise ValueError("KEDU_SYNC_TLS_CERT and KEDU_SYNC_TLS_KEY are required")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(config.tls_cert, config.tls_key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def main() -> None:
    config = config_from_environment()
    server = create_server(config)
    try:
        config.data_dir.mkdir(parents=True, exist_ok=True)
        config.pid_file.write_text(str(os.getpid()), encoding="ascii")
        stop: Callable[[int, object], None] = lambda *_: threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        print(f"Kedu LAN sync listening on https://{config.host}:{config.port}{config.request_path}")
        print(f"Data file: {config.data_file}")
        server.serve_forever()
    finally:
        server.server_close()
        try:
            if config.pid_file.read_text(encoding="ascii").strip() == str(os.getpid()):
                config.pid_file.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()
