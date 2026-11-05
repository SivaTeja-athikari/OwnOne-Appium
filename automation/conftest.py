"""
Pytest configuration, CLI flags, driver lifecycle fixtures, and failure hooks.
"""

import os
import base64
import logging
import subprocess
import time
import re
import hashlib
from pathlib import Path
import pytest
from typing import Generator, Any
from automation.config.environments import get_environment_config
from automation.config.tenants import get_tenant_config
from automation.core.driver_factory import create_driver
from automation.offline.test_data import fresh_email


pytest_plugins = ["automation.core.account_fixtures"]

def reports_root():
    return Path(os.environ.get("FARM_ARTIFACT_ROOT", str(Path(__file__).parent / "reports")))

def report_dir_for(request, platform):
    directory = reports_root() / platform
    node = getattr(request, 'node', request)
    if '/offline/' in str(node.path):
        device = os.environ.get('ANDROID_UDID' if platform == 'android' else 'IOS_UDID', 'default')
        directory /= re.sub(r'[^A-Za-z0-9_.-]', '_', device)
    worker = os.environ.get('PYTEST_XDIST_WORKER') or os.environ.get('FARM_WORKER_ID')
    if worker:
        directory /= worker
    name = getattr(node, 'name', None) or 'shared-app-session'
    if os.environ.get('FARM_ARTIFACT_ROOT'):
        identity = getattr(node, 'nodeid', name)
        name = re.sub(r'[^A-Za-z0-9_.-]', '_', name)[:80] + '-' + hashlib.sha256(identity.encode()).hexdigest()[:12]
    return directory / name

def pytest_addoption(parser):
    parser.addoption(
        "--farm-worker", action="store_true", default=False,
        help="Use isolated function-scoped sessions and accounts on a leased farm device",
    )
    parser.addoption(
        "--reuse-app-session",
        action="store_true",
        default=False,
        help="Keep one Appium app session for a linear authenticated workflow suite",
    )
    parser.addoption(
        "--environment",
        action="store",
        default="qa",
        help="Target test environment: development, qa, staging, production",
    )
    parser.addoption(
        "--company",
        action="store",
        default="acme-corp",
        help="Target company/tenant: acme-corp, apex-health, zenith-financial",
    )
    parser.addoption(
        "--platform",
        action="store",
        default="android",
        help="Target mobile platform: android, ios",
    )
    parser.addoption(
        "--appium-url",
        action="store",
        default=os.environ.get("APPIUM_URL", "http://127.0.0.1:4723"),
        help="Appium 3 server endpoint",
    )
    parser.addoption(
        "--real",
        "--real-device",
        action="store_true",
        default=False,
        help="Execute tests on an emulator or simulator via Appium",
    )
    parser.addoption(
        "--mock-driver",
        action="store_true",
        default=False,
        help="Use mock driver for CI/headless verification without active mobile emulator",
    )

@pytest.fixture(scope="session")
def environment(request) -> str:
    return request.config.getoption("--environment")

@pytest.fixture(scope="session")
def company(request) -> str:
    return request.config.getoption("--company")

@pytest.fixture(scope="session")
def platform(request) -> str:
    return request.config.getoption("--platform")

@pytest.fixture(scope="session")
def environment_config(environment: str):
    return get_environment_config(environment)

@pytest.fixture(scope="session")
def tenant_config(company: str):
    return get_tenant_config(company)

def _app_driver_scope(fixture_name, config):
    return "session" if config.getoption("--reuse-app-session") and not config.getoption("--farm-worker") else "function"


@pytest.fixture(scope=_app_driver_scope)
def driver(request, environment: str, company: str, platform: str) -> Generator[Any, None, None]:
    appium_url = request.config.getoption("--appium-url")
    is_real = request.config.getoption("--real")
    is_mock = request.config.getoption("--mock-driver")

    # Device tests use a real session unless --mock-driver is explicitly requested.
    if is_real and is_mock:
        raise pytest.UsageError("Choose either --real or --mock-driver, not both.")
    mock_mode = is_mock
    is_real = not is_mock
    if is_real and platform.lower() == 'android':
        android_udid = os.environ.get('ANDROID_UDID', 'emulator-5554')
        if not android_udid.startswith('emulator-'):
            raise pytest.UsageError(
                'Android automation is restricted to emulators; physical devices are not permitted.'
            )

    drv = create_driver(
        platform=platform,
        environment=environment,
        tenant=company,
        appium_url=appium_url,
        mock_mode=mock_mode,
    )

    recording = False
    report_dir = report_dir_for(request, platform)
    report_dir.mkdir(parents=True, exist_ok=True)
    try:
        if is_real:
            app_id = 'com.anonymous.appreact'
            if platform.lower() == 'android':
                udid = os.environ.get('ANDROID_UDID', 'emulator-5554')
                # Clear any system shade left by a prior interrupted radio test.
                result = subprocess.run(
                    ['adb', '-s', udid, 'shell', 'cmd', 'statusbar', 'collapse'],
                    capture_output=True, text=True, timeout=15,
                )
                if result.returncode:
                    logging.getLogger(__name__).warning(
                        'Could not collapse Android status panel before test: %s',
                        result.stderr.strip(),
                    )
            drv.terminate_app(app_id)
            drv.activate_app(app_id)
            from automation.pages.login_page import LoginPage
            login_page = LoginPage(drv)
            login_page.ensure_login()
            if environment != 'production':
                login_page.select_environment(environment)
                # Switching can restore a session from the target environment.
                login_page.ensure_login()
            if os.environ.get('APPIUM_RECORD_SCREEN', '0') == '1':
                try:
                    drv.start_recording_screen(timeLimit='180')
                    recording = True
                except Exception as exc:
                    print(f'[Recording] Not available: {exc}')
        yield drv
    except Exception:
        # Generator fixture setup can fail before pytest reaches `yield`; take
        # evidence here so the failure does not leave only an empty later test.
        if is_real:
            try:
                drv.get_screenshot_as_file(str(report_dir / 'setup_failure.png'))
            except Exception as exc:
                print(f'[Screenshot] Could not capture setup failure: {exc}')
        raise
    finally:
        if is_real:
            try:
                (report_dir / 'final-page.xml').write_text(drv.page_source)
                drv.save_screenshot(str(report_dir / 'final-screen.png'))
                if recording:
                    (report_dir / 'recording.mp4').write_bytes(base64.b64decode(drv.stop_recording_screen()))
                import allure
                for evidence_file in sorted(report_dir.iterdir()):
                    if evidence_file.suffix.lower() == '.png':
                        allure.attach.file(
                            str(evidence_file), name=evidence_file.stem,
                            attachment_type=allure.attachment_type.PNG,
                        )
                    elif evidence_file.suffix.lower() == '.mp4':
                        allure.attach.file(
                            str(evidence_file), name=evidence_file.stem,
                            attachment_type=allure.attachment_type.MP4,
                        )
            except Exception as exc:
                print(f'[Artifacts] Could not save evidence: {exc}')

        # Include setup failures as well as test-call failures in evidence.
        failed = (
            getattr(request.node, 'rep_call', None)
            and request.node.rep_call.failed
        ) or (
            getattr(request.node, 'rep_setup', None)
            and request.node.rep_setup.failed
        )
        if failed:
            screenshot_path = str(report_dir / 'failure.png')
            try:
                drv.get_screenshot_as_file(screenshot_path)
                print(f'\n[Screenshot] Saved failure artifact to {screenshot_path}')
            except Exception as exc:
                print(f'\n[Screenshot] Error capturing screenshot: {exc}')
        try:
            drv.quit()
        except Exception as exc:
            print(f'[Driver] Could not quit Appium session: {exc}')

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)
    if '/offline/' in str(item.path) and rep.when in ('call', 'setup', 'teardown'):
        if rep.when in ('setup', 'teardown') and rep.passed:
            return
        from automation.offline.report import CASES
        from pathlib import Path
        name = item.name
        if name in CASES:
            evidence = sorted(report_dir_for(item, item.config.getoption('--platform')).glob('*.png'))
            detail = str(getattr(rep.longrepr, 'reprcrash', rep.longrepr)) if rep.failed else rep.outcome
            records = getattr(item.config, '_offline_results', [])
            status = 'ERROR' if rep.when in ('setup', 'teardown') and rep.failed else rep.outcome.upper()
            if rep.when == 'teardown':
                records = [record for record in records if record[0] != name]
            records.append((name, status, detail, evidence))
            item.config._offline_results = records


def _adb_shell(udid, *args):
    return subprocess.run(
        ['adb', '-s', udid, 'shell', *args],
        check=True, capture_output=True, text=True, timeout=20,
    ).stdout.strip()


def _restore_session_android_radios(config):
    initial = getattr(config, '_android_initial_radios', None)
    if not initial:
        return
    udid = initial['udid']
    _adb_shell(udid, 'cmd', 'connectivity', 'airplane-mode', 'disable')
    _adb_shell(udid, 'svc', 'wifi', 'enable' if initial['wifi'] else 'disable')
    _adb_shell(udid, 'svc', 'data', 'enable' if initial['data'] else 'disable')
    _adb_shell(udid, 'cmd', 'connectivity', 'airplane-mode',
               'enable' if initial['airplane_mode'] else 'disable')
    _adb_shell(udid, 'cmd', 'statusbar', 'collapse')


def pytest_sessionstart(session):
    config = session.config
    if (not config.getoption('--collect-only') and config.getoption('--real') and not config.getoption('--mock-driver')
            and config.getoption('--platform').lower() == 'android'):
        udid = os.environ.get('ANDROID_UDID', 'emulator-5554')
        if not udid.startswith('emulator-'):
            raise pytest.UsageError(
                'Android automation is restricted to emulators; physical devices are not permitted.'
            )
        try:
            initial = {
                'udid': udid,
                'airplane_mode': _adb_shell(udid, 'settings', 'get', 'global', 'airplane_mode_on') == '1',
                'wifi': _adb_shell(udid, 'settings', 'get', 'global', 'wifi_on') == '1',
                'data': _adb_shell(udid, 'settings', 'get', 'global', 'mobile_data') == '1',
            }
            config._android_initial_radios = initial
            _adb_shell(udid, 'cmd', 'connectivity', 'airplane-mode', 'disable')
            _adb_shell(udid, 'svc', 'wifi', 'enable')
            _adb_shell(udid, 'svc', 'data', 'enable')
            _adb_shell(udid, 'cmd', 'statusbar', 'collapse')
        except (OSError, subprocess.SubprocessError) as exc:
            raise pytest.UsageError(
                f'Could not establish an online Android emulator baseline: {exc}'
            ) from exc

    if not config.getoption("--collect-only"):
        directory = reports_root() / 'offline'
        directory.mkdir(parents=True, exist_ok=True)
        session.config._offline_started = time.time()
        try:
            worker = os.environ.get('PYTEST_XDIST_WORKER') or os.environ.get('FARM_WORKER_ID')
            handler = logging.FileHandler(directory / (f'execution-{worker}.log' if worker else 'execution.log'), mode='w')
            handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s %(message)s'))
            logging.getLogger('offline.network').addHandler(handler)
            logging.getLogger('offline.network').setLevel(logging.INFO)
            session.config._offline_log_handler = handler
        except OSError:
            session.config._offline_log_handler = None


def pytest_sessionfinish(session, exitstatus):
    try:
        records = getattr(session.config, '_offline_results', None)
        if records is not None:
            from automation.offline.report import write_reports
            write_reports(records, reports_root() / 'offline',
                          since=getattr(session.config, '_offline_started', 0))
    finally:
        handler = getattr(session.config, '_offline_log_handler', None)
        if handler:
            logging.getLogger('offline.network').removeHandler(handler)
            handler.close()
        try:
            _restore_session_android_radios(session.config)
        except (OSError, subprocess.SubprocessError) as exc:
            logging.getLogger(__name__).error('Could not restore emulator radios after session: %s', exc)
            session.exitstatus = pytest.ExitCode.TESTS_FAILED


@pytest.fixture
def artifact_dir(request, platform):
    directory = report_dir_for(request, platform)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


@pytest.fixture
def register_account(driver, environment, platform):
    """Create accounts through the UI; no seeded users or direct storage writes."""
    from automation.pages.login_page import LoginPage
    from automation.pages.signup_page import SignupPage
    from automation.pages.reports_page import ReportsPage

    def register(tenant_ids, prefix='tester'):
        login = LoginPage(driver)
        signup = SignupPage(driver)
        dashboard = ReportsPage(driver)
        login.ensure_login()
        if environment != 'production':
            login.select_environment(environment)
            login.ensure_login()
        tenant_suffix = '.'.join(tenant_ids)
        readable_suffix = re.sub(r'[^A-Za-z]', '', prefix) or 'Tester'
        email = fresh_email('Appium', readable_suffix.title())
        password = 'OfflineTest2026!'
        login.open_signup()
        signup.create_account('Appium Registered User', email, password, tenant_ids)
        try:
            login.find_element(login.SUCCESS_MESSAGE, timeout=30)
        except Exception:
            if not signup.is_visible(signup.ERROR_BOX, timeout=2) or 'already exists' not in signup.get_text(signup.ERROR_BOX).lower():
                raise
            if platform.lower() == 'android' and not hasattr(driver, 'elements'):
                driver.back()
            else:
                signup.click('signup_login_link')
            login.ensure_login()
            login.login_as(email, password)
            existing_dashboard = ReportsPage(driver)
            existing_dashboard.find_element(existing_dashboard.HOME)
            existing_dashboard.logout()
        return email, password
    return register
