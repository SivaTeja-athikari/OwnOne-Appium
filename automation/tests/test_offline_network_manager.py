"""Fast contract checks for offline controls, independent of Appium devices."""

from automation.offline.network_manager import (
    AndroidNetworkManager, IOSNetworkManager, NetworkControlUnavailable,
)
from automation.offline.fault_server import FaultServer
from urllib.error import HTTPError
from urllib.request import urlopen
from threading import Thread
from pathlib import Path
from types import SimpleNamespace
from automation.conftest import report_dir_for


class FakeAndroidDriver:
    capabilities = {'appium:udid': 'emulator-test'}

    def __init__(self):
        self.services = {'wifi': True, 'data': True, 'airplaneMode': False}
        self.calls = []

    def execute_script(self, name, args):
        self.calls.append((name, args))
        if name == 'mobile: getConnectivity':
            return self.services.copy()
        if name == 'mobile: setConnectivity':
            self.services.update(args)
            return None
        raise AssertionError(name)


class FakeProxy:
    def __init__(self):
        self.value = True
        self.cleaned = False

    def enabled(self):
        return self.value

    def set_enabled(self, value):
        self.value = value

    def clear_test_toxics(self):
        self.cleaned = True


def test_android_radio_controls_verify_and_restore(monkeypatch):
    commands = []
    monkeypatch.setattr('automation.offline.network_manager.subprocess.run',
                        lambda command, **kwargs: commands.append(command))
    driver = FakeAndroidDriver()
    manager = AndroidNetworkManager(driver)
    manager.wifi(False)
    manager.mobile_data(False)
    assert manager.state().radios_off
    manager.airplane_mode(True)
    assert manager.state().airplane_mode
    manager.restore()
    assert driver.services == {'wifi': True, 'data': True, 'airplaneMode': False}
    assert ('mobile: setConnectivity', {'wifi': False}) in driver.calls
    assert commands == [['adb', '-s', 'emulator-test', 'shell', 'cmd', 'statusbar', 'collapse']]


def test_android_online_precondition_restores_initially_offline_state(monkeypatch):
    monkeypatch.setattr('automation.offline.network_manager.subprocess.run',
                        lambda command, **kwargs: None)
    driver = FakeAndroidDriver()
    driver.services = {'wifi': False, 'data': False, 'airplaneMode': True}
    manager = AndroidNetworkManager(driver)
    online = manager.online()
    assert online.wifi and online.data and not online.airplane_mode
    restored = manager.restore()
    assert not restored.wifi and not restored.data and restored.airplane_mode


def test_ios_requires_explicit_routed_proxy():
    try:
        IOSNetworkManager(None)
    except NetworkControlUnavailable:
        pass
    else:
        raise AssertionError('iOS radio control must not be claimed without a proxy')
    proxy = FakeProxy()
    manager = IOSNetworkManager(proxy)
    assert manager.all_off() is False
    assert manager.restore() is True
    assert proxy.cleaned


def test_ios_host_network_manager_lifecycle(monkeypatch):
    power = {'state': 'On'}
    commands = []

    def fake_run(cmd, **kwargs):
        commands.append(cmd)
        if cmd[:2] == ['networksetup', '-getairportpower']:
            return SimpleNamespace(stdout=f"Wi-Fi Power ({cmd[2]}): {power['state']}\n")
        if cmd[:2] == ['networksetup', '-setairportpower']:
            power['state'] = 'On' if cmd[3] == 'on' else 'Off'
            return SimpleNamespace(stdout='')
        if cmd == ['scutil', '--nwi']:
            return SimpleNamespace(stdout='address : 192.168.1.5\nreach : 0x00000002 (Reachable)\n')
        return SimpleNamespace(stdout='')

    monkeypatch.setattr('automation.offline.network_manager.subprocess.run', fake_run)
    driver = SimpleNamespace(capabilities={'platformName': 'iOS'})
    manager = IOSNetworkManager(driver=driver, interface='en0', timeout=2)
    assert not manager.state().radios_off
    assert manager.state().wifi is True

    manager.all_off()
    assert manager.state().radios_off
    assert manager.state().wifi is False

    manager.restore()
    assert not manager.state().radios_off
    assert manager.state().wifi is True


def test_fault_server_returns_controlled_http_errors_and_request_log():
    with FaultServer() as server:
        server.status = 503
        try:
            urlopen(server.url + '/test-path', timeout=2)
        except HTTPError as error:
            assert error.code == 503
        else:
            raise AssertionError('Expected HTTP 503')
        assert server.requests[0]['path'] == '/test-path'


def test_fault_server_can_hold_an_in_flight_response():
    with FaultServer() as server:
        server.hold_responses()
        outcomes = []

        def request():
            try:
                urlopen(server.url + '/held', timeout=5)
            except HTTPError as error:
                outcomes.append(error.code)

        worker = Thread(target=request)
        worker.start()
        try:
            assert server.request_started.wait(timeout=5)
            assert worker.is_alive()
            server.status = 500
        finally:
            server.release_responses()
            worker.join(timeout=5)
        assert outcomes == [500]


def test_offline_artifact_directory_accepts_pytest_item_or_fixture_request(monkeypatch):
    monkeypatch.setenv('ANDROID_UDID', 'physical-123')
    item = SimpleNamespace(path=Path('/project/automation/tests/offline/test_flow.py'),
                           name='test_case')
    expected = report_dir_for(item, 'android')
    assert expected.parts[-3:] == ('android', 'physical-123', 'test_case')
    assert report_dir_for(SimpleNamespace(node=item), 'android') == expected
