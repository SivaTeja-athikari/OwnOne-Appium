"""Scoped Toxiproxy controls for future live API and file-transfer flows."""

import json
import logging
from urllib.parse import quote
from urllib.request import Request, urlopen


class ToxiproxyControl:
    def __init__(self, api_url: str, proxy_name: str, token: str | None = None):
        self.api_url = api_url.rstrip('/')
        self.proxy_name = proxy_name
        self.token = token

    @property
    def path(self):
        return f'/proxies/{quote(self.proxy_name, safe="")}'

    def _request(self, method: str, path: str, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        request = Request(self.api_url + path, data=data, headers=headers, method=method)
        with urlopen(request, timeout=5) as response:
            body = response.read()
            return json.loads(body) if body else None

    def enabled(self) -> bool:
        return bool(self._request('GET', self.path)['enabled'])

    def set_enabled(self, enabled: bool):
        logging.getLogger('offline.network').info(
            'Set proxy %s enabled=%s', self.proxy_name, enabled)
        self._request('POST', self.path, {'enabled': enabled})
        if self.enabled() != enabled:
            raise RuntimeError(f'Proxy {self.proxy_name} did not change state')

    def add_toxic(self, name: str, kind: str, attributes: dict, stream='downstream'):
        if not name.startswith('offline_test_'):
            raise ValueError('Test toxic names must start with offline_test_')
        self._request('POST', self.path + '/toxics', {
            'name': name, 'type': kind, 'stream': stream,
            'toxicity': 1.0, 'attributes': attributes,
        })

    def clear_test_toxics(self):
        for toxic in self._request('GET', self.path + '/toxics'):
            if toxic['name'].startswith('offline_test_'):
                self._request('DELETE', self.path + '/toxics/' + quote(toxic['name'], safe=''))

    def slow(self, latency_ms=1500, jitter_ms=250):
        self.add_toxic('offline_test_latency', 'latency',
                       {'latency': latency_ms, 'jitter': jitter_ms})

    def timeout(self, timeout_ms=5000):
        self.add_toxic('offline_test_timeout', 'timeout', {'timeout': timeout_ms})

    def intermittent(self, loss_rate=0.5):
        self.add_toxic('offline_test_packet_loss', 'packet_loss',
                       {'loss_rate': loss_rate, 'correlation': 0.0})
