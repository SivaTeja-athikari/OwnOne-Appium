"""
Appium 3 capability builders for Android (UiAutomator2) and iOS (XCUITest).
Follows official Appium Python Client v6 & Appium 3 W3C specification.
"""

from typing import Optional, Dict, Any

def get_android_capabilities(
    app_path: Optional[str] = None,
    device_name: str = "emulator-5554",
    platform_version: Optional[str] = None,
    system_port: Optional[int] = None,
    mjpeg_port: Optional[int] = None,
    package_name: str = "com.anonymous.appreact",
    activity_name: str = ".MainActivity",
) -> Dict[str, Any]:
    caps: Dict[str, Any] = {
        "platformName": "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": device_name,
        "appium:udid": device_name,
        "appium:appPackage": package_name,
        "appium:appActivity": activity_name,
        "appium:noReset": True,
        "appium:newCommandTimeout": 300,
        "appium:adbExecTimeout": 120000,
        "appium:uiautomator2ServerInstallTimeout": 120000,
        "appium:autoGrantPermissions": True,
        "appium:ensureWebviewsHavePages": True,
        "appium:settings[waitForIdleTimeout]": 500,
    }
    if app_path:
        caps["appium:app"] = app_path
    if platform_version:
        caps["appium:platformVersion"] = platform_version
    if mjpeg_port is not None:
        caps["appium:mjpegServerPort"] = mjpeg_port
    if system_port is not None:
        caps["appium:systemPort"] = system_port
    return caps

def get_ios_capabilities(
    app_path: Optional[str] = None,
    device_name: str = "iPhone 15 Pro",
    platform_version: str = "17.4",
    bundle_id: str = "com.anonymous.appreact",
    udid: Optional[str] = None,
    wda_local_port: Optional[int] = None,
    mjpeg_port: Optional[int] = None,
    derived_data_path: Optional[str] = None,
) -> Dict[str, Any]:
    caps: Dict[str, Any] = {
        "platformName": "iOS",
        "appium:automationName": "XCUITest",
        "appium:deviceName": device_name,
        "appium:platformVersion": platform_version,
        "appium:bundleId": bundle_id,
        "appium:noReset": False,
        "appium:fullReset": False,
        "appium:newCommandTimeout": 300,
        "appium:wdaLaunchTimeout": 60000,
        # Allow controlled inputs to process each native text-change event.
        "appium:maxTypingFrequency": 10,
    }
    if wda_local_port is not None:
        caps["appium:wdaLocalPort"] = wda_local_port
    if mjpeg_port is not None:
        caps["appium:mjpegServerPort"] = mjpeg_port
    if derived_data_path:
        caps["appium:derivedDataPath"] = derived_data_path
    if udid:
        caps["appium:udid"] = udid
    if app_path:
        caps["appium:app"] = app_path
    return caps

def build_android_options(app_path: Optional[str] = None, **kwargs):
    """Builds typed UiAutomator2Options instance."""
    from appium.options.android import UiAutomator2Options

    caps = get_android_capabilities(app_path=app_path, **kwargs)
    options = UiAutomator2Options()
    options.load_capabilities(caps)
    return options

def build_ios_options(app_path: Optional[str] = None, **kwargs):
    """Builds typed XCUITestOptions instance."""
    from appium.options.ios import XCUITestOptions

    caps = get_ios_capabilities(app_path=app_path, **kwargs)
    options = XCUITestOptions()
    options.load_capabilities(caps)
    return options
