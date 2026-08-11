import base64
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server import SyncConfig, create_server, etag_for


def backup(title: str = "first") -> bytes:
    return json.dumps({
        "format": "focus-planner-backup",
        "schemaVersion": 1,
        "exportedAt": "2026-08-11T10:00:00.000Z",
        "data": {
            "tasks": [{"id": "task", "title": title}],
            "categories": [],
            "sessions": [],
            "reviews": [],
            "sleep": [],
            "settings": {},
            "timer": {},
        },
    }).encode()


class SyncServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.config = SyncConfig(
            host="127.0.0.1",
            port=0,
            data_dir=Path(self.temporary.name),
            filename="kedu-focus-backup.json",
            username="kedu",
            password="secret",
            allowed_origins=frozenset({"https://gup-n.github.io"}),
        )
        self.server = create_server(self.config, use_tls=False)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def request(self, method, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        auth = base64.b64encode(b"kedu:secret").decode()
        request_headers = {
            "Authorization": f"Basic {auth}",
            "Origin": "https://gup-n.github.io",
            **(headers or {}),
        }
        connection.request(method, "/kedu-focus-backup.json", body=body, headers=request_headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_preflight_allows_the_github_pages_origin_and_private_network(self):
        status, headers, _ = self.request("OPTIONS", headers={"Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://gup-n.github.io")
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")

    def test_requires_authentication(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.request("GET", "/kedu-focus-backup.json", headers={"Origin": "https://gup-n.github.io"})
        response = connection.getresponse()
        self.assertEqual(response.status, 401)
        connection.close()

    def test_creates_reads_and_conditionally_updates_the_backup(self):
        first = backup("first")
        status, headers, _ = self.request("PUT", first, {"Content-Type": "application/json", "If-None-Match": "*"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["ETag"], etag_for(first))

        status, headers, content = self.request("GET")
        self.assertEqual(status, 200)
        self.assertEqual(content, first)
        first_etag = headers["ETag"]

        status, _, _ = self.request("PUT", backup("stale"), {"If-Match": '"wrong"'})
        self.assertEqual(status, 412)

        second = backup("second")
        status, headers, _ = self.request("PUT", second, {"If-Match": first_etag})
        self.assertEqual(status, 204)
        self.assertEqual(headers["ETag"], etag_for(second))
        self.assertEqual(self.config.previous_file.read_bytes(), first)
        self.assertEqual(self.config.data_file.read_bytes(), second)

    def test_rejects_invalid_backup_and_unlisted_origin(self):
        status, _, _ = self.request("PUT", b"{}")
        self.assertEqual(status, 400)
        status, _, _ = self.request("GET", headers={"Origin": "https://evil.example"})
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
