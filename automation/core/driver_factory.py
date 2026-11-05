"""Create explicit real or mock sessions; a real run never falls back to a mock."""
import os
import json
import subprocess
from typing import Any
from automation.core.mock_driver import MockAppiumDriver


def create_driver(platform: str = 'android', environment: str = 'qa', tenant: str = 'acme-corp', appium_url: str = 'http://127.0.0.1:4723', mock_mode: bool = False) -> Any:
    if mock_mode:
        return MockAppiumDriver(platform_name='iOS' if platform.lower() == 'ios' else 'Android', environment=environment, tenant=tenant)
    if os.environ.get('USE_MOCK_DRIVER') == '1':
        raise RuntimeError('A real Appium run was requested, but USE_MOCK_DRIVER=1 is set.')
    from appium import webdriver
    from appium.webdriver.client_config import AppiumClientConfig
    from automation.config.capabilities import build_android_options, build_ios_options
    if platform.lower() == 'ios':
        udid = os.environ.get('IOS_UDID', '').strip()
        if not udid:
            raise RuntimeError('IOS_UDID must identify a booted iOS Simulator; physical-device runs are disabled.')
        simulators = subprocess.run(
            ['xcrun', 'simctl', 'list', 'devices', 'booted', '-j'],
            check=True, capture_output=True, text=True, timeout=15,
        ).stdout
        available = [device['udid'].lower() for devices in json.loads(simulators)['devices'].values()
                     for device in devices if device.get('state') == 'Booted']
        if udid.lower() not in available:
            raise RuntimeError('IOS_UDID is not a booted iOS Simulator. Boot the simulator and set its UDID in .env.')
        options = build_ios_options(
            device_name=os.environ.get('IOS_DEVICE_NAME', 'iPhone 17'),
            platform_version=os.environ.get('IOS_PLATFORM_VERSION', '27.0'),
            udid=udid,
            wda_local_port=int(os.environ['APPIUM_WDA_PORT']) if os.environ.get('APPIUM_WDA_PORT') else None,
            mjpeg_port=int(os.environ['APPIUM_MJPEG_PORT']) if os.environ.get('APPIUM_MJPEG_PORT') else None,
            derived_data_path=os.environ.get('APPIUM_DERIVED_DATA_PATH'),
        )
    else:
        udid = os.environ.get('ANDROID_UDID', 'emulator-5554').strip()
        if not udid.startswith('emulator-'):
            raise RuntimeError('ANDROID_UDID must be an Android emulator serial. Physical-device runs are disabled.')
        android_options = {'device_name': udid}
        system_port = os.environ.get('APPIUM_SYSTEM_PORT', '').strip()
        if system_port:
            android_options['system_port'] = int(system_port)
        if os.environ.get('APPIUM_MJPEG_PORT'):
            android_options['mjpeg_port'] = int(os.environ['APPIUM_MJPEG_PORT'])
        options = build_android_options(**android_options)
        platform_version = os.environ.get('ANDROID_PLATFORM_VERSION', '').strip()
        if platform_version:
            options.set_capability('appium:platformVersion', platform_version)
    driver = webdriver.Remote(options=options, client_config=AppiumClientConfig(remote_server_addr=appium_url, direct_connection=False))
    driver.implicitly_wait(0)
    return driver
