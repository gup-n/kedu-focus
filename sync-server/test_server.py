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

    def request(self, method, body=None, headers=None, path="/kedu-focus-backup.json"):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        auth = base64.b64encode(b"kedu:secret").decode()
        request_headers = {
            "Authorization": f"Basic {auth}",
            "Origin": "https://gup-n.github.io",
            **(headers or {}),
        }
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_preflight_allows_the_github_pages_origin_and_private_network(self):
        status, headers, _ = self.request("OPTIONS", headers={"Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://gup-n.github.io")
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")

    def test_preflight_allows_capacitor_android_origin(self):
        status, headers, _ = self.request("OPTIONS", headers={"Origin": "https://localhost"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://localhost")

    def test_requires_authentication(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.request("GET", "/kedu-focus-backup.json", headers={"Origin": "https://gup-n.github.io"})
        response = connection.getresponse()
        self.assertEqual(response.status, 401)
        self.assertEqual(response.getheader("X-Kedu-Sync-Server"), "1")
        connection.close()

    def test_identifies_a_running_server_even_before_the_first_upload(self):
        status, headers, _ = self.request("GET")
        self.assertEqual(status, 404)
        self.assertEqual(headers["X-Kedu-Sync-Server"], "1")
        self.assertEqual(headers["X-Kedu-Sync-Empty"], "1")
        self.assertEqual(headers["Access-Control-Expose-Headers"], "ETag, Last-Modified, X-Kedu-Sync-Server, X-Kedu-Sync-Empty, X-Kedu-Sync-Archived-Version")

    def test_wrong_filename_is_not_reported_as_an_empty_backup(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        auth = base64.b64encode(b"kedu:secret").decode()
        connection.request("GET", "/wrong.json", headers={"Authorization": f"Basic {auth}", "Origin": "https://gup-n.github.io"})
        response = connection.getresponse()
        self.assertEqual(response.status, 404)
        self.assertEqual(response.getheader("X-Kedu-Sync-Server"), "1")
        self.assertIsNone(response.getheader("X-Kedu-Sync-Empty"))
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
        self.assertIn("X-Kedu-Sync-Archived-Version", headers)
        self.assertEqual(self.config.previous_file.read_bytes(), first)
        self.assertEqual(self.config.data_file.read_bytes(), second)
        versions = list(self.config.history_dir.glob("kedu-focus-backup.*.json"))
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0].read_bytes(), first)

    def test_prunes_timestamped_history_to_the_configured_limit(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.config = SyncConfig(**{**self.config.__dict__, "history_limit": 2})
        self.server = create_server(self.config, use_tls=False)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

        current_etag = None
        for title in ("one", "two", "three", "four"):
            content = backup(title)
            request_headers = {"If-None-Match": "*"} if current_etag is None else {"If-Match": current_etag}
            status, response_headers, _ = self.request("PUT", content, request_headers)
            self.assertEqual(status, 204)
            current_etag = response_headers["ETag"]

        self.assertEqual(len(list(self.config.history_dir.glob("kedu-focus-backup.*.json"))), 2)

    def test_lists_and_downloads_immutable_history_versions(self):
        first = backup("first")
        status, headers, _ = self.request("PUT", first, {"If-None-Match": "*"})
        self.assertEqual(status, 204)
        second = backup("second")
        status, _, _ = self.request("PUT", second, {"If-Match": headers["ETag"]})
        self.assertEqual(status, 204)

        status, headers, content = self.request("GET", path="/kedu-focus-backup.json.history")
        self.assertEqual(status, 200)
        self.assertEqual(headers["X-Kedu-Sync-Server"], "1")
        manifest = json.loads(content)
        self.assertEqual(len(manifest["versions"]), 1)
        version = manifest["versions"][0]
        self.assertEqual(version["counts"]["tasks"], 1)
        self.assertEqual(version["counts"]["reviews"], 0)
        self.assertEqual(version["sizeBytes"], len(first))
        self.assertEqual(version["etag"], etag_for(first))

        status, headers, content = self.request("GET", path=f"/kedu-focus-backup.json.history/{version['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(headers["ETag"], etag_for(first))
        self.assertEqual(content, first)

    def test_history_endpoints_require_auth_and_reject_unknown_versions(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.request("GET", "/kedu-focus-backup.json.history", headers={"Origin": "https://gup-n.github.io"})
        response = connection.getresponse()
        self.assertEqual(response.status, 401)
        connection.close()

        status, _, _ = self.request("GET", path="/kedu-focus-backup.json.history/missing.json")
        self.assertEqual(status, 404)
        status, _, _ = self.request("GET", path="/kedu-focus-backup.json.history/%2E%2E%2Fsecret.json")
        self.assertEqual(status, 404)

    def test_rejects_invalid_backup_and_unlisted_origin(self):
        status, _, _ = self.request("PUT", b"{}")
        self.assertEqual(status, 400)
        status, _, _ = self.request("GET", headers={"Origin": "https://evil.example"})
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
