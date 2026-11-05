"""Farm contracts; no device, account or network mutation."""
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
import pytest
from automation.config.capabilities import get_android_capabilities, get_ios_capabilities
from automation.conftest import report_dir_for, _app_driver_scope
from automation.core.account_fixtures import offline_account_scope
from automation.offline.network_manager import IOSNetworkManager, NetworkControlUnavailable


def test_ios_parallel_capabilities_are_explicit():
    caps = get_ios_capabilities(udid='sim-one', wda_local_port=8102,
                               mjpeg_port=9102, derived_data_path='/tmp/worker-two')
    assert caps['appium:udid'] == 'sim-one'
    assert caps['appium:wdaLocalPort'] == 8102
    assert caps['appium:mjpegServerPort'] == 9102
    assert caps['appium:derivedDataPath'] == '/tmp/worker-two'
    assert 'appium:wdaLocalPort' not in get_ios_capabilities()


def test_android_os_and_ports_are_preserved():
    caps = get_android_capabilities(device_name='emulator-5556', platform_version='15',
                                    system_port=8202, mjpeg_port=9102)
    assert caps['appium:udid'] == 'emulator-5556'
    assert caps['appium:platformVersion'] == '15'
    assert caps['appium:systemPort'] == 8202
    assert caps['appium:mjpegServerPort'] == 9102


def test_farm_never_reuses_driver_or_account_across_cases():
    config = SimpleNamespace(getoption=lambda name: name in ('--farm-worker', '--reuse-app-session'))
    assert _app_driver_scope('driver', config) == 'function'
    assert offline_account_scope('fresh_offline_account', config) == 'function'


def test_parameterized_artifacts_are_safe_and_unique(tmp_path, monkeypatch):
    monkeypatch.setenv('FARM_ARTIFACT_ROOT', str(tmp_path))
    monkeypatch.setenv('FARM_WORKER_ID', 'emulator-5554')
    first = SimpleNamespace(path=Path('/repo/automation/tests/offline/a.py'),
                            name='test_case[a/b]', nodeid='a.py::test_case[a/b]')
    second = SimpleNamespace(path=first.path, name='test_case[a_b]', nodeid='a.py::test_case[a_b]')
    a, b = report_dir_for(first, 'android'), report_dir_for(second, 'android')
    assert a != b
    assert a.is_relative_to(tmp_path)
    assert '/' not in a.name
    assert report_dir_for(SimpleNamespace(node=first), 'android') == a


def test_farm_forbids_host_wifi_even_with_driver(monkeypatch):
    monkeypatch.setenv('FARM_WORKER_ID', 'sim-one')
    monkeypatch.setattr('automation.offline.network_manager.subprocess.run',
                        lambda *a, **kw: pytest.fail('Host network command must not run'))
    with pytest.raises(NetworkControlUnavailable, match='host Wi-Fi'):
        IOSNetworkManager(driver=object())


def test_proxy_network_state_has_the_same_interface_as_android(monkeypatch):
    from automation.tests.test_offline_network_manager import FakeProxy
    monkeypatch.setenv('FARM_WORKER_ID', 'sim-one')
    manager = IOSNetworkManager(proxy=FakeProxy())
    assert not manager.state().radios_off
    manager.all_off()
    assert manager.state().radios_off
    manager.restore()
    assert not manager.state().radios_off


def run_plugin(tmp_path, source, assignment=None):
    (tmp_path / 'pytest.ini').write_text('[pytest]\n')
    (tmp_path / 'test_sample.py').write_text(source)
    output = tmp_path / 'results.json'
    args = [sys.executable, '-m', 'pytest', '-p', 'automation.core.farm_plugin',
            '-p', 'no:cacheprovider', '-c', str(tmp_path / 'pytest.ini'),
            str(tmp_path / 'test_sample.py'), f'--farm-results-file={output}']
    if assignment is not None:
        manifest = tmp_path / 'assignment.json'
        manifest.write_text(json.dumps(assignment))
        args.append(f'--farm-assignment-file={manifest}')
    env = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[2]), 'PYTEST_ADDOPTS': ''}
    result = subprocess.run(args, capture_output=True, text=True, env=env, timeout=30)
    return result, json.loads(output.read_text())


def test_plugin_keeps_skips_and_teardown_failures(tmp_path):
    result, evidence = run_plugin(tmp_path, '''import pytest
@pytest.fixture
def broken():
    yield
    assert False, 'cleanup failed'
def test_cleanup(broken):
    pass
def test_skipped():
    pytest.skip('backend missing')
''')
    assert result.returncode == 1
    records = {item['nodeid'].split('::')[-1]: item for item in evidence['cases']}
    assert records['test_cleanup']['call']['outcome'] == 'passed'
    assert records['test_cleanup']['teardown']['outcome'] == 'failed'
    assert records['test_skipped']['call']['outcome'] == 'skipped'


@pytest.mark.parametrize('assignment', [[], ['test_sample.py::test_missing']])
def test_plugin_rejects_empty_or_different_assignment(tmp_path, assignment):
    result, evidence = run_plugin(tmp_path, 'def test_sample():\n    pass\n', assignment)
    assert result.returncode != 0
    assert evidence['cases'] == []
    assert 'differs' in result.stderr
