"""Platform network controls with state verification and guaranteed restoration.

Android uses current UiAutomator2 execute methods. iOS has no supported
XCUITest radio-control API; a routed test proxy is required there.
"""

from dataclasses import dataclass
import os
import re
import subprocess
import logging
import time
from typing import Mapping
from selenium.webdriver.support.ui import WebDriverWait


class NetworkControlUnavailable(RuntimeError):
    pass


logger = logging.getLogger('offline.network')


@dataclass(frozen=True)
class Connectivity:
    wifi: bool
    data: bool
    airplane_mode: bool

    @property
    def radios_off(self) -> bool:
        return not self.wifi and not self.data


class AndroidNetworkManager:
    def __init__(self, driver, timeout=15):
        self.driver = driver
        self.timeout = timeout
        self.initial = self.state()

    def state(self) -> Connectivity:
        raw: Mapping[str, bool] = self.driver.execute_script(
            'mobile: getConnectivity', {}
        )
        return Connectivity(
            wifi=bool(raw['wifi']),
            data=bool(raw['data']),
            airplane_mode=bool(raw['airplaneMode']),
        )

    def _set(self, service: str, enabled: bool) -> Connectivity:
        logger.info('Android set %s=%s', service, enabled)
        self.driver.execute_script('mobile: setConnectivity', {service: enabled})
        WebDriverWait(self.driver, self.timeout, poll_frequency=0.4).until(
            lambda _: getattr(self.state(),
                              'airplane_mode' if service == 'airplaneMode' else service) == enabled,
            f'{service} did not become {enabled}',
        )
        return self.state()

    def wifi(self, enabled: bool) -> Connectivity:
        return self._set('wifi', enabled)

    def mobile_data(self, enabled: bool) -> Connectivity:
        try:
            return self._set('data', enabled)
        except Exception as exc:
            raise NetworkControlUnavailable(
                'Mobile data control is unavailable on this Android device; '
                'use an emulator or a device that supports it.'
            ) from exc

    def airplane_mode(self, enabled: bool) -> Connectivity:
        try:
            return self._set('airplaneMode', enabled)
        except Exception as exc:
            raise NetworkControlUnavailable(
                'Airplane mode control is unavailable on this Android device.'
            ) from exc

    def all_off(self) -> Connectivity:
        self.wifi(False)
        return self.mobile_data(False)

    def all_on(self) -> Connectivity:
        """Alias for online() enabling all transports."""
        return self.online()

    def online(self) -> Connectivity:
        """Enable Android transports for online-precondition test steps."""
        if self.state().airplane_mode:
            self.airplane_mode(False)
        if not self.state().wifi:
            self.wifi(True)
        if not self.state().data:
            try:
                self.mobile_data(True)
            except NetworkControlUnavailable:
                # Wi-Fi may still provide internet on devices that restrict
                # cellular control; fail only when both transports are off.
                if not self.state().wifi:
                    raise
                logger.warning('Mobile data could not be enabled; Wi-Fi remains available')
        return self.state()

    def restore(self) -> Connectivity:
        # Disable airplane mode first so the original radio states can be restored.
        current = self.state()
        if current.airplane_mode and not self.initial.airplane_mode:
            self.airplane_mode(False)
        if self.state().wifi != self.initial.wifi:
            self.wifi(self.initial.wifi)
        if self.state().data != self.initial.data:
            self.mobile_data(self.initial.data)
        if self.state().airplane_mode != self.initial.airplane_mode:
            self.airplane_mode(self.initial.airplane_mode)
        restored = self.state()
        # UiAutomator2 can leave Android's notification shade over the app
        # after changing radios. Collapse it before the next test interacts.
        udid = self.driver.capabilities.get('appium:udid') or self.driver.capabilities.get('udid')
        if udid:
            try:
                subprocess.run(
                    ['adb', '-s', udid, 'shell', 'cmd', 'statusbar', 'collapse'],
                    check=True, capture_output=True, text=True, timeout=15,
                )
            except (OSError, subprocess.SubprocessError) as exc:
                raise NetworkControlUnavailable(
                    'Android radios were restored, but the notification shade could not be collapsed.'
                ) from exc
        return restored

    def emergency_restore(self):
        """Best-effort cleanup if toggling radios killed the Appium session."""
        udid = self.driver.capabilities.get('appium:udid') or self.driver.capabilities.get('udid')
        if not udid:
            raise NetworkControlUnavailable('Cannot restore via ADB without a device UDID')
        commands = [
            ['cmd', 'connectivity', 'airplane-mode',
             'enable' if self.initial.airplane_mode else 'disable'],
            ['svc', 'wifi', 'enable' if self.initial.wifi else 'disable'],
            ['svc', 'data', 'enable' if self.initial.data else 'disable'],
        ]
        for command in commands:
            logger.warning('Appium unavailable; ADB restore: %s', command)
            subprocess.run(['adb', '-s', udid, 'shell', *command],
                           check=True, capture_output=True, text=True, timeout=15)


class IOSNetworkManager:
    """iOS network manager supporting macOS host network interface control
    (for real/simulator NWPathMonitor drops) as well as proxy routing.
    """

    def __init__(self, proxy=None, driver=None, interface: str | None = None, timeout: float = 15.0):
        self.proxy = proxy
        self.driver = driver
        self.timeout = timeout
        if proxy is not None:
            self.mode = 'proxy'
            self.initial_enabled = proxy.enabled()
        else:
            if os.environ.get('FARM_WORKER_ID'):
                raise NetworkControlUnavailable('Farm workers cannot change host Wi-Fi; configure a dedicated verified proxy')
            if driver is None and interface is None and not os.environ.get('OFFLINE_IOS_NETWORK'):
                raise NetworkControlUnavailable(
                    'iOS requires a configured routed proxy or active driver session; '
                    'XCUITest cannot toggle or verify Wi-Fi/cellular radios.'
                )
            self.mode = 'host'
            self.interface = interface or self._detect_wifi_interface()
            if not self.interface:
                raise NetworkControlUnavailable(
                    'No active macOS Wi-Fi interface could be detected for iOS offline simulation.'
                )
            self.initial_power = self._get_power()

    @staticmethod
    def _detect_wifi_interface() -> str:
        try:
            res = subprocess.run(['scutil', '--nwi'], capture_output=True, text=True, timeout=5)
            match = re.search(r'Network interfaces:\s*(\w+)', res.stdout)
            if match:
                candidate = match.group(1)
                check = subprocess.run(['networksetup', '-getairportpower', candidate],
                                      capture_output=True, text=True, timeout=5)
                if 'Wi-Fi Power' in check.stdout:
                    return candidate
        except Exception:
            pass
        try:
            ports = subprocess.run(['networksetup', '-listallhardwareports'],
                                   capture_output=True, text=True, timeout=5)
            lines = ports.stdout.splitlines()
            for idx, line in enumerate(lines):
                if 'Wi-Fi' in line:
                    for next_line in lines[idx+1:idx+3]:
                        if 'Device:' in next_line:
                            return next_line.split(':')[1].strip()
        except Exception:
            pass
        return 'en0'

    def _get_power(self) -> bool:
        try:
            res = subprocess.run(['networksetup', '-getairportpower', self.interface],
                                 check=True, capture_output=True, text=True, timeout=5)
            return 'On' in res.stdout
        except Exception as exc:
            raise NetworkControlUnavailable(
                f'Failed to check Wi-Fi power on interface {self.interface}: {exc}'
            ) from exc

    def _wait_for_reachability(self, timeout: float = 30.0) -> bool:
        """Wait until macOS network is actually reachable with an assigned IP address and working DNS."""
        import socket
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            try:
                res = subprocess.run(['scutil', '--nwi'], capture_output=True, text=True, timeout=5)
                if 'address' in res.stdout and ('Reachable' in res.stdout):
                    try:
                        socket.getaddrinfo('identitytoolkit.googleapis.com', 443)
                        logger.info('iOS Host Wi-Fi %s confirmed reachable with working DNS', self.interface)
                        return True
                    except OSError:
                        pass
            except Exception:
                pass
            time.sleep(0.5)
        logger.warning('iOS Host Wi-Fi %s reachability wait timed out', self.interface)
        return False

    def _set_power(self, enabled: bool):
        logger.info('iOS Host set Wi-Fi %s=%s', self.interface, enabled)
        target = 'on' if enabled else 'off'
        try:
            subprocess.run(['networksetup', '-setairportpower', self.interface, target],
                           check=True, capture_output=True, text=True, timeout=10)
        except Exception as exc:
            raise NetworkControlUnavailable(
                f'Failed to set Wi-Fi power to {target} on {self.interface}: {exc}'
            ) from exc

        started = time.monotonic()
        while time.monotonic() - started < self.timeout:
            if self._get_power() == enabled:
                break
            time.sleep(0.3)
        if self._get_power() != enabled:
            raise NetworkControlUnavailable(
                f'Wi-Fi interface {self.interface} did not become {target} within {self.timeout}s'
            )
        if enabled:
            self._wait_for_reachability()

    def state(self):
        if self.mode == 'proxy':
            return Connectivity(wifi=self.proxy.enabled(), data=False, airplane_mode=False)
        power = self._get_power()
        return Connectivity(
            wifi=power,
            data=False,
            airplane_mode=not power,
        )

    def all_off(self):
        if self.mode == 'proxy':
            self.proxy.set_enabled(False)
            assert self.state().radios_off
            return False
        self._set_power(False)
        return self.state()

    def all_on(self):
        return self.online()

    def online(self):
        if self.mode == 'proxy':
            self.proxy.set_enabled(True)
            return self.state()
        if not self._get_power():
            self._set_power(True)
        return self.state()

    def restore(self):
        if self.mode == 'proxy':
            self.proxy.clear_test_toxics()
            self.proxy.set_enabled(self.initial_enabled)
            assert self.proxy.enabled() == self.initial_enabled
            return self.proxy.enabled()
        if self._get_power() != self.initial_power:
            self._set_power(self.initial_power)
        return self.state()

    def emergency_restore(self):
        """Emergency cleanup to guarantee host Wi-Fi is restored."""
        if self.mode == 'host' and hasattr(self, 'initial_power'):
            try:
                self._set_power(True)
            except Exception as exc:
                logger.error('Emergency restore failed to enable Wi-Fi on %s: %s', self.interface, exc)
