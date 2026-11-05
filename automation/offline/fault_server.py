"""Controlled HTTP endpoint for future API integration tests.

This server is not wired into the current app because no screen calls an API.
When a nonproduction API screen exists, route that endpoint here or through a
proxy and assert its request log before counting a UI fault test as valid.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FaultServer:
    def __init__(self):
        self.status = 200
        self.gate = threading.Event()
        self.gate.set()
        self.request_started = threading.Event()
        self.requests = []
        self._lock = threading.Lock()
        controller = self

        class Handler(BaseHTTPRequestHandler):
            def handle_request(self):
                length = int(self.headers.get('Content-Length', '0'))
                body = self.rfile.read(length) if length else b''
                with controller._lock:
                    controller.requests.append({
                        'method': self.command,
                        'path': self.path,
                        'idempotency_key': self.headers.get('Idempotency-Key'),
                        'body_length': len(body),
                    })
                controller.request_started.set()
                if not controller.gate.wait(timeout=30):
                    return
                payload = json.dumps({'status': controller.status}).encode()
                self.send_response(controller.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                try:
                    self.wfile.write(payload)
                except BrokenPipeError:
                    pass

            do_GET = handle_request
            do_POST = handle_request
            do_PUT = handle_request
            do_DELETE = handle_request

            def log_message(self, format, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self):
        return f'http://127.0.0.1:{self.server.server_port}'

    def start(self):
        self.thread.start()
        return self

    def hold_responses(self):
        self.request_started.clear()
        self.gate.clear()

    def release_responses(self):
        self.gate.set()

    def close(self):
        self.release_responses()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def __enter__(self):
        return self.start()

    def __exit__(self, *_):
        self.close()
