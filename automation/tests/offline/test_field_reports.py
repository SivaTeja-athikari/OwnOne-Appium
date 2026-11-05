"""Manager demo: capture offline, retain locally, reconnect and confirm delivery."""
import json
import os
import subprocess
import time
from datetime import date, timedelta
import allure
import pytest
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.login_page import LoginPage
from automation.pages.reports_page import ReportsPage
from automation.offline.server_evidence import server_document
from automation.offline.server_evidence import assert_submission_rules

APP = 'com.anonymous.appreact'
DATA = ('Delivery inspection', 'Hyderabad Warehouse 02', 'Delivery received. Packaging intact. Supervisor notified.')
pytestmark = pytest.mark.offline


@pytest.fixture
def signed_in(bundled_app, driver, fresh_offline_account):
    email, password = fresh_offline_account
    page = ReportsPage(driver)
    page.ensure_authenticated(email,password)
    page.discard_draft_if_present()
    return page, email, password


def radio_evidence(driver, manager, evidence, directory, label):
    """Show OS controls in the recording and save independently verified state."""
    state = manager.state()
    (directory / f'{label}-radios.json').write_text(json.dumps(vars(state), indent=2))
    platform_name = driver.capabilities.get('platformName', '').lower()
    if platform_name == 'android':
        udid = os.environ.get('ANDROID_UDID', 'emulator-5554')
        assert udid.startswith('emulator-'), 'Only emulator evidence is authorized'
        def shell(*args):
            subprocess.run(['adb', '-s', udid, 'shell', *args], check=True, capture_output=True, timeout=15)
        def quick_settings_visible(_):
            result = subprocess.run(
                ['adb', '-s', udid, 'shell', 'dumpsys', 'window'],
                check=True, capture_output=True, text=True, timeout=15,
            )
            focused = result.stdout
            return ('com.android.systemui' in focused and
                    ('mCurrentFocus' in focused or 'mFocusedApp' in focused))
        try:
            hold_seconds = min(10.0, max(0.0, float(os.environ.get('OFFLINE_RADIO_EVIDENCE_HOLD_SECONDS', '4'))))
        except ValueError:
            hold_seconds = 4.0
        try:
            shell('cmd', 'statusbar', 'expand-settings')
            WebDriverWait(driver, 10, poll_frequency=0.5).until(quick_settings_visible)
            evidence(label + '-quick-settings')
            if hold_seconds:
                started = time.monotonic()
                WebDriverWait(driver, hold_seconds + 0.2, poll_frequency=0.1).until(
                    lambda _: time.monotonic() - started >= hold_seconds,
                    'Radio state visibility hold did not complete',
                )
        finally:
            shell('cmd', 'statusbar', 'collapse')
    else:
        evidence(f'{label}-ios-network-state')


def hold_sync_result(driver):
    """Keep the pending/confirmed result visible in the Appium recording."""
    try:
        hold_seconds = min(10.0, max(0.0, float(os.environ.get('OFFLINE_SYNC_CONFIRMATION_HOLD_SECONDS', '4'))))
    except ValueError:
        hold_seconds = 4.0
    if hold_seconds:
        started = time.monotonic()
        WebDriverWait(driver, hold_seconds + 0.2, poll_frequency=0.1).until(
            lambda _: time.monotonic() - started >= hold_seconds,
            'Sync result visibility hold did not complete',
        )


@allure.suite('02 Field reports')
@allure.title('RPT-001 · Validate, submit two samples offline and sync after reconnect')
@pytest.mark.regression
def test_demo_offline_capture_restore_and_send(signed_in, driver, network_manager,
                                               offline_evidence, artifact_dir, environment):
    page, email, password = signed_in
    # Preflight the deployed rules before spending time on the offline journey.
    assert_submission_rules(email, password, environment)
    offline_evidence('01-online-reports')

    with allure.step('Reject an empty report and verify required-field messages'):
        previous_references = set(page.references())
        page.compose()
        for field in ('title', 'location', 'details'):
            assert page.field_label(field).rstrip().endswith('*')
        page.submit()
        assert page.get_text('report_error') == 'Review the highlighted fields and try again.'
        for field, message in (
            ('title', 'Enter a report title.'),
            ('location', 'Enter the site or location.'),
            ('details', 'Describe what happened.'),
        ):
            page.assert_inline_error(field, message)
        assert page.value('report_title_input') == ''
        assert page.value('report_location_input') == ''
        assert page.value('report_details_input') == ''
        page.assert_no_submission(previous_references)
        page.compose()
        offline_evidence('01-empty-form-validation')

    with allure.step('Disable Wi-Fi and mobile data and verify offline status'):
        network_manager.all_off()
        assert network_manager.state().radios_off
        radio_evidence(driver, network_manager, offline_evidence, artifact_dir, '02-offline')
        page.wait_offline()

    with allure.step('Choose and submit a sample report offline'):
        page.fill(*DATA)
        page.submit()
        first_reference = page.reference()
        page.status(first_reference, 'Pending')
        offline_evidence('03-sample-pending-offline')

    with allure.step('Restart the app offline and verify locally stored report remains pending'):
        driver.terminate_app(APP)
        driver.activate_app(APP)
        page.wait_home()
        page.activity()
        page.status(first_reference, 'Pending')
        offline_evidence('04-report-restored-after-restart')

    with allure.step('Restore connectivity and verify report reaches the server'):
        network_manager.restore()
        assert not network_manager.state().radios_off, 'Connectivity was not restored'
        radio_evidence(driver, network_manager, offline_evidence, artifact_dir, '05-restored')
        page.wait_connected()
        page.activity()
        try:
            page.status(first_reference, 'Server confirmed')
        except Exception:
            offline_evidence('06-sync-not-confirmed')
            hold_sync_result(driver)
            raise
        offline_evidence('06-server-confirmed')
        hold_sync_result(driver)

        first_document = server_document(email, password, environment, first_reference)
        for field, expected in dict(zip(['title', 'location', 'details'], DATA), category='Delivery', priority='High').items():
            assert first_document['fields'][field]['stringValue'] == expected
        (artifact_dir / '07-server-receipt.json').write_text(json.dumps(first_document, indent=2))


def test_report_draft_survives_offline_restart(signed_in, driver, network_manager, offline_evidence):
    page, _, _ = signed_in
    network_manager.all_off()
    page.wait_offline()
    page.fill(*DATA)
    page.select_outcome('Blocked')
    page.select_risk_level('Critical')
    page.enter_emergency_contact('+14155550130')
    if not page.is_checked('report_requires_follow_up_toggle'):
        page.toggle_follow_up()
    due_date = (date.today() + timedelta(days=7)).isoformat()
    page.enter_follow_up_date(due_date)
    page.enter_work_order_reference('WO-2048')
    page.enter_next_action('Return after the replacement part arrives.')
    page.toggle_checklist_item(1)
    page.enter_sign_off_name('Alex Morgan')
    WebDriverWait(driver, 15).until(lambda _: 'Draft saved' in page.get_text('report_save_status'))
    offline_evidence('01-draft-saved')
    driver.terminate_app(APP)
    driver.activate_app(APP)
    page.wait_home()
    page.assert_fields(*DATA)
    assert page.value('report_emergency_contact_input') == '+14155550130'
    assert page.value('report_follow_up_date_input') == due_date
    assert page.value('report_sign_off_name_input') == 'Alex Morgan'
    assert page.value('report_work_order_reference_input') == 'WO-2048'
    assert page.value('report_next_action_input') == 'Return after the replacement part arrives.'
    assert page.is_checked('report_outcome_Blocked')
    assert page.is_checked('report_risk_Critical')
    assert page.is_checked('report_requires_follow_up_toggle')
    assert page.is_checked('report_checklist_toggle_1')
    assert page.dropdown_value('category') == 'Delivery'
    assert page.dropdown_value('priority') == 'High'
    offline_evidence('02-entire-draft-restored')


@pytest.mark.parametrize(('scenario_key','title','location','reference','category','priority','follow_up'), [
    ('offline_delivery','Delivery inspection · Warehouse 02','North Gate · Warehouse 02','WO-2048','Delivery','High',False),
    ('maintenance_follow_up','Preventive maintenance follow-up','Plant 4 · Loading bay','SR-318','Maintenance','Normal',True),
    ('blocked_safety_incident','Restricted access · Safety incident','East service corridor','INC-771','Incident','Urgent',True),
    ('batch_inspection_1','Batch inspection · North wing','North Wing Depot','BATCH-001','Site visit','High',False),
    ('batch_inspection_2','Batch inspection · South wing','South Wing Depot','BATCH-002','Site visit','Normal',False),
])
def test_scenario_starters_prefill_editable_draft_without_submission(
    scenario_key, title, location, reference, category, priority, follow_up,
    signed_in, driver, network_manager, offline_evidence,
):
    """Templates fill the real SQLite-backed form; they do not create Activity records."""
    page, _, _ = signed_in
    network_manager.all_off()
    page.wait_offline()
    existing_references = set(page.references())
    page.compose()
    page.choose_scenario(scenario_key)

    WebDriverWait(driver, 15, poll_frequency=0.3).until(
        lambda _: 'filled in.' in page.get_text('report_save_status'),
        'Selected scenario did not save as a local draft',
    )
    assert page.value('report_title_input') == title
    assert page.value('report_location_input') == location
    assert page.value('report_work_order_reference_input') == reference
    assert page.dropdown_value('category') == category
    assert page.dropdown_value('priority') == priority
    if follow_up:
        assert page.value('report_follow_up_date_input'), 'Follow-up scenarios must prefill a due date'
    else:
        assert not page.is_visible('report_follow_up_date_input'), 'Non-follow-up scenarios must not expose a required date'
    assert page.is_enabled('report_submit_btn'), 'A sample starter should remain a normal editable draft'

    edited_title = f'{title} · reviewed'
    page.set_text_if_changed('report_title_input', edited_title)
    assert page.value('report_title_input') == edited_title
    assert page.value('report_location_input') == location, 'Editing the title must preserve other prefilled fields'
    offline_evidence(f'scenario-{scenario_key}-editable-draft')

    page.activity()
    page.assert_no_submission(existing_references)
    page.compose()
    assert page.value('report_title_input') == edited_title, 'The edited scenario draft should remain available in the form'
    page.discard_draft_if_present()


@pytest.mark.regression
def test_report_follow_up_validation_and_offline_save(signed_in, driver, network_manager, offline_evidence):
    page, _, _ = signed_in
    network_manager.all_off()
    page.wait_offline()
    page.fill(*DATA)
    page.enter_emergency_contact('123')
    page.toggle_follow_up()
    page.submit()
    page.assert_inline_error('emergency_contact', 'Enter a valid phone number with 7–15 digits.')
    page.assert_inline_error('follow_up_date', 'Add a due date for the follow-up.')
    page.enter_emergency_contact('+14155550130')
    page.assert_inline_error_absent('emergency_contact')
    page.enter_follow_up_date('2026-02-31')
    page.assert_inline_error('follow_up_date', 'Enter a valid calendar date.')
    due_date = (date.today() + timedelta(days=7)).isoformat()
    page.enter_follow_up_date(due_date)
    page.assert_inline_error_absent('follow_up_date')
    page.select_outcome('Blocked')
    page.select_risk_level('High')
    page.toggle_checklist_item(0)
    page.enter_sign_off_name('Alex Morgan')
    page.submit()
    reference = page.reference()
    page.status(reference, 'Pending')
    expected_values = [due_date, '+14155550130', 'Alex Morgan', '1/3 checks']
    # Activity cards are taller than the viewport; scroll their content into
    # the native hierarchy before asserting the persisted offline values.
    for _ in range(6):
        source = driver.page_source
        if all(value in source for value in expected_values):
            break
        page.scroll('down')
    assert all(value in driver.page_source for value in expected_values), (
        'Saved report details were not all visible in the offline activity record'
    )
    offline_evidence('follow-up-report-pending-offline')


def test_inline_validation_blocks_invalid_report_submission(signed_in, offline_evidence):
    page, _, _ = signed_in
    previous_references = set(page.references())
    page.compose()
    for field in ('title', 'location', 'details'):
        label = page.field_label(field)
        assert label.rstrip().endswith('*'), f'{field} is required but has no visible required marker: {label!r}'
    scenarios = [
        (0, '', 'title', 'required', 'Enter a report title.'),
        (0, 'ab', 'title', 'minimum-length', 'Use at least 3 characters for the title.'),
        (1, '', 'location', 'required', 'Enter the site or location.'),
        (1, 'x', 'location', 'minimum-length', 'Enter at least 2 characters for the location.'),
        (2, '', 'details', 'required', 'Describe what happened.'),
        (2, 'too short', 'details', 'minimum-length', 'Add a little more detail (at least 10 characters).'),
    ]
    for missing, invalid_value, field, rule, expected in scenarios:
        values = list(DATA)
        values[missing] = invalid_value
        page.fill(*values)
        page.submit()
        assert page.get_text('report_error') == 'Review the highlighted fields and try again.'
        page.assert_inline_error(field, expected)
        for other_field in {'title', 'location', 'details'} - {field}:
            page.assert_inline_error_absent(other_field)
        page.assert_fields(*values)
        offline_evidence(f'validation-{field}-{rule}')
        page.assert_no_submission(previous_references)


def test_corrected_inline_validation_can_be_saved_offline(signed_in, network_manager, offline_evidence):
    page, _, _ = signed_in
    network_manager.all_off()
    page.wait_offline()
    invalid = ('ab', DATA[1], DATA[2])
    page.fill(*invalid)
    page.submit()
    page.assert_inline_error('title', 'Use at least 3 characters for the title.')
    page.type_text('report_title_input', DATA[0])
    page.assert_inline_error_absent('title')
    page.assert_fields(*DATA)
    page.submit()
    reference = page.reference()
    page.status(reference, 'Pending')
    current_references = page.references()
    assert current_references and current_references[0] == reference, (
        'Corrected form should create exactly one newest pending report'
    )
    offline_evidence('corrected-report-saved-on-device')


def test_login_requires_network(bundled_app, driver, fresh_offline_account, network_manager, offline_evidence):
    email, password = fresh_offline_account
    login = LoginPage(driver)
    ReportsPage(driver).logout()
    network_manager.all_off()
    ReportsPage(driver).wait_offline()
    login.login_as(email, password)
    assert 'internet' in login.get_error_message().lower()
    assert not login._visible(ReportsPage.HOME)
    offline_evidence('offline-login-rejected-form-visible')
    network_manager.restore()
    login.login_as(email, password)
    ReportsPage(driver).wait_home()
    offline_evidence('same-credentials-succeed-online')


@pytest.mark.ios_smoke
def test_online_report_has_server_receipt(signed_in, environment, artifact_dir, offline_evidence):
    page, email, password = signed_in
    page.fill(*DATA)
    page.submit()
    reference = page.reference()
    page.status(reference, 'Server confirmed')
    document = server_document(email, password, environment, reference)
    for field, expected in dict(zip(['title', 'location', 'details'], DATA), category='Delivery', priority='High').items():
        assert document['fields'][field]['stringValue'] == expected
    (artifact_dir / 'server-receipt.json').write_text(json.dumps(document, indent=2))
    offline_evidence('online-submission-confirmed')


def test_reconnection_sends_pending_without_restart(signed_in, network_manager, environment, offline_evidence):
    page, email, password = signed_in
    network_manager.all_off()
    page.wait_offline()
    page.fill(*DATA)
    page.submit()
    reference = page.reference()
    page.status(reference, 'Pending')
    offline_evidence('01-pending-offline')
    network_manager.restore()
    page.wait_home()
    page.activity()
    page.status(reference, 'Server confirmed')
    document = server_document(email, password, environment, reference)
    for field, expected in dict(zip(['title', 'location', 'details'], DATA), category='Delivery', priority='High').items():
        assert document['fields'][field]['stringValue'] == expected
    offline_evidence('02-automatically-sent-after-reconnection')
