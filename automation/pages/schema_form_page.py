"""Schema-driven access to configured fields, independent of labels/order."""
import json
from pathlib import Path

from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By
from automation.pages.base_page import BasePage


SCHEMA_PATH = Path(__file__).resolve().parents[2] / 'src/features/submissions/report-form-schema.json'


class SchemaFormPage:
    """Small POC page object that reads field identities/types from the app schema."""

    def __init__(self, driver, schema_path=SCHEMA_PATH):
        self.driver = driver
        self.schema = json.loads(Path(schema_path).read_text(encoding='utf-8'))
        self.fields_by_id = {field['id']: field for field in self.schema['fields']}
        if len(self.fields_by_id) != len(self.schema['fields']):
            raise ValueError(f"Duplicate field IDs in schema {self.schema.get('formId')!r}")

    def field_ids(self):
        return list(self.fields_by_id)

    def visible_fields(self):
        visible = []
        for field in self.schema['fields']:
            try:
                element = self._container(field['id'])
                if element.is_displayed():
                    visible.append(field)
            except Exception:
                # Fields hidden by the active form state (for example a
                # conditional date field) are omitted from this live view.
                continue
        return visible

    def _container(self, field_id):
        if field_id not in self.fields_by_id:
            raise KeyError(f'Unknown field schema ID: {field_id}')
        test_id = f"form_field_{field_id}"
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        if platform == 'android':
            return self.driver.find_element(
                AppiumBy.ANDROID_UIAUTOMATOR,
                f'new UiSelector().resourceId("{test_id}")',
            )
        return self.driver.find_element(AppiumBy.ACCESSIBILITY_ID, test_id)

    def input(self, field_id):
        field = self.fields_by_id[field_id]
        if field['type'] not in {'text', 'multiline', 'phone', 'date'}:
            raise ValueError(f"Unsupported text input type {field['type']!r}")
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        native_classes = (
            ['android.widget.EditText'] if platform == 'android' else
            ['XCUIElementTypeTextView', 'XCUIElementTypeTextField', 'XCUIElementTypeSecureTextField']
            if field['type'] == 'multiline' else
            ['XCUIElementTypeTextField', 'XCUIElementTypeSecureTextField', 'XCUIElementTypeTextView']
        )
        container_id = f'form_field_{field_id}'
        # Scroll the schema-identified field fully into the usable viewport.
        # React Native's native tree may omit a TextInput while it is clipped
        # beneath the fixed bottom navigation, and testID wrappers do not
        # consistently retain their native descendants on Android.
        BasePage(self.driver).scroll_to(container_id)
        container = self._container(field_id)
        if platform == 'android':
            scroll_views = [
                view for view in self.driver.find_elements(By.CLASS_NAME, 'android.widget.ScrollView')
                if view.is_displayed()
            ]
            # Forms are nested inside the screen's outer scroll view. Use the
            # smallest scroll view containing this field, so the gesture moves
            # the form instead of an outer screen wrapper or fixed navigation.
            containing = []
            for view in scroll_views:
                rect = view.rect
                field_rect = container.rect
                if (rect['y'] <= field_rect['y'] and
                        rect['y'] + rect['height'] >= field_rect['y'] + field_rect['height']):
                    containing.append((rect['width'] * rect['height'], view))
            if containing:
                scroll_view = min(containing, key=lambda pair: pair[0])[1]
                for _ in range(5):
                    field_rect = container.rect
                    viewport = scroll_view.rect
                    if field_rect['y'] + field_rect['height'] <= viewport['y'] + viewport['height'] - 100:
                        break
                    moved = self.driver.execute_script('mobile: scrollGesture', {
                        'elementId': scroll_view.id,
                        'direction': 'down',
                        'percent': 0.35,
                        'speed': 1200,
                    })
                    if not moved:
                        break
                    container = self._container(field_id)
        elif platform == 'ios':
            scroll_views = [
                view for view in self.driver.find_elements(By.CLASS_NAME, 'XCUIElementTypeScrollView')
                if view.is_displayed()
            ]
            containing = []
            for view in scroll_views:
                rect = view.rect
                field_rect = container.rect
                if (rect['y'] <= field_rect['y'] and
                        rect['y'] + rect['height'] >= field_rect['y'] + field_rect['height']):
                    containing.append((rect['width'] * rect['height'], view))
            if containing:
                scroll_view = min(containing, key=lambda pair: pair[0])[1]
                for _ in range(5):
                    field_rect = container.rect
                    viewport = scroll_view.rect
                    if field_rect['y'] + field_rect['height'] <= viewport['y'] + viewport['height'] - 100:
                        break
                    moved = self.driver.execute_script('mobile: swipe', {
                        'elementId': scroll_view.id,
                        'direction': 'up',
                        'velocity': 1200,
                    })
                    if moved is False:
                        break
                    container = self._container(field_id)
        # Try each native text-control class under the schema wrapper first.
        # iOS multiline inputs are XCUIElementTypeTextView, while Android
        # exposes all these React Native inputs as EditText.
        for native_class in native_classes:
            try:
                return container.find_element(By.XPATH, f'.//{native_class}')
            except Exception:
                continue

        # React Native / Appium may flatten native text controls out of their
        # testID wrapper. Associate the closest visible text control after the
        # schema wrapper. This uses schema identity and native role, not labels
        # or a fixed field position.
        candidates = []
        if platform == 'ios':
            for native_class in native_classes:
                candidates.extend(self.driver.find_elements(By.CLASS_NAME, native_class))
            # The schema label is dynamic; on iOS it can provide an accessible
            # name when the native tree has no useful parent/child relation.
            for candidate in self.driver.find_elements(AppiumBy.ACCESSIBILITY_ID, field['label']):
                if candidate not in candidates:
                    candidates.append(candidate)
        else:
            candidates = self.driver.find_elements(By.CLASS_NAME, native_classes[0])

        wrapper = container.rect
        below = []
        for candidate in candidates:
            try:
                tag = str(candidate.tag_name).lower()
                if platform == 'ios' and not any(name.lower() in tag for name in native_classes):
                    continue
                rect = candidate.rect
                if candidate.is_displayed() and rect['y'] >= wrapper['y'] - 8:
                    below.append((rect['y'] - wrapper['y'], candidate))
            except Exception:
                continue
        if below:
            below.sort(key=lambda pair: pair[0])
            if len(below) == 1 or below[1][0] - below[0][0] >= 8:
                return below[0][1]
        raise LookupError(f'No unambiguous native text control found for schema field {field_id!r}')

    def enter(self, field_id, value):
        """Type by stable schema ID and verify that the native field retained it."""
        field = self.input(field_id)
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        field.click()
        if platform == 'android':
            self.driver.press_keycode(29, metastate=4096)  # Ctrl+A
            self.driver.press_keycode(67)  # Backspace
            if value:
                self.driver.execute_script('mobile: type', {'text': value})
        else:
            field.clear()
            field.send_keys(value)
        field = self.input(field_id)
        actual = field.get_attribute('text' if platform == 'android' else 'value') or ''
        if actual != value:
            raise AssertionError(f'Field {field_id} did not retain the entered value')

    def value(self, field_id):
        field = self.input(field_id)
        platform = str(self.driver.capabilities.get('platformName', '')).lower()
        return field.get_attribute('text' if platform == 'android' else 'value') or ''
