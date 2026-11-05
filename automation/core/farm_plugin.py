"""Machine-readable collection and complete per-phase farm evidence."""
import json
from pathlib import Path
import pytest


def pytest_addoption(parser):
    parser.addoption('--farm-collection-file')
    parser.addoption('--farm-assignment-file')
    parser.addoption('--farm-results-file')


def _write(path, data):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2))
    temporary.replace(destination)


def pytest_collection_finish(session):
    assignment = session.config.getoption('--farm-assignment-file')
    cases = [{
        'nodeid': item.nodeid,
        'network': 'network_manager' in item.fixturenames,
        'account': 'fresh_offline_account' in item.fixturenames,
        'bundled': 'bundled_app' in item.fixturenames,
    } for item in session.items]
    if assignment:
        expected = json.loads(Path(assignment).read_text())
        actual = [item['nodeid'] for item in cases]
        if not expected or actual != expected:
            raise pytest.UsageError('Farm collection differs from the assigned case list')
    destination = session.config.getoption('--farm-collection-file')
    if destination:
        _write(destination, cases)
    session.config._farm_phase_results = {item['nodeid']: {'nodeid': item['nodeid']} for item in cases}


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    report = (yield).get_result()
    record = item.config._farm_phase_results[item.nodeid]
    record[report.when] = {'outcome': report.outcome, 'seconds': report.duration}
    if getattr(report, 'wasxfail', None):
        record['xfail'] = True


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    destination = session.config.getoption('--farm-results-file')
    if destination:
        _write(destination, {
            'exitCode': int(session.exitstatus),
            'cases': list(getattr(session.config, '_farm_phase_results', {}).values()),
        })
