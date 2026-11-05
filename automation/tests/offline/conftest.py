"""Isolated real-device offline fixtures; no mock result can count as a pass."""

import os
import logging
from pathlib import Path
import pytest
from automation.offline.network_manager import (
    AndroidNetworkManager, IOSNetworkManager,
)
from automation.offline.proxy import ToxiproxyControl
from automation.core.account_fixtures import require_online_precondition


@pytest.fixture(autouse=True)
def require_device_evidence(request):
    if request.config.getoption('--mock-driver'):
        pytest.skip('Report workflow results require an actual emulator/simulator session')


@pytest.fixture
def network_manager(driver, platform, request):
    if request.config.getoption('--mock-driver'):
        pytest.skip('Offline device evidence requires a real Appium session')
    if platform.lower() == 'android':
        manager = AndroidNetworkManager(driver)
    else:
        api_url = os.environ.get('OFFLINE_PROXY_API_URL')
        proxy_name = os.environ.get('OFFLINE_PROXY_NAME')
        if api_url and proxy_name and os.environ.get('OFFLINE_PROXY_VERIFIED') == '1':
            manager = IOSNetworkManager(proxy=ToxiproxyControl(
                api_url, proxy_name, os.environ.get('OFFLINE_PROXY_TOKEN')))
        else:
            manager = IOSNetworkManager(driver=driver)
    try:
        if platform.lower() != 'android' or request.node.name != 'test_off_018_android_radio_modes':
            require_online_precondition(driver)
        yield manager
    finally:
        try:
            manager.restore()
        except Exception:
            if hasattr(manager, 'emergency_restore'):
                manager.emergency_restore()
            raise


@pytest.fixture
def offline_evidence(driver, artifact_dir):
    def capture(name):
        destination = Path(artifact_dir) / f'{name}.png'
        driver.save_screenshot(str(destination))
        try:
            import allure
            allure.attach.file(
                str(destination), name=name,
                attachment_type=allure.attachment_type.PNG,
            )
        except Exception as exc:
            logging.getLogger(__name__).warning('Could not attach screenshot to Allure: %s', exc)
        return destination
    return capture


@pytest.fixture
def bundled_app():
    if os.environ.get('OFFLINE_BUNDLED_BUILD') != '1':
        pytest.skip('Offline UI flows require a build with embedded JS, not Metro')
