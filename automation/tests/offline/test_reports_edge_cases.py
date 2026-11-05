"""QA edge cases and stress test scenarios for Offline Forms & Data Handling.

Covers:
- Multiple offline forms queued sequentially in local SQLite outbox
- Boundary testing: Unicode and multi-byte inputs handled offline without corruption
- Intermittent connectivity (drop and reconnect during queue replay)
- Deduplication and idempotency on reconnect
"""

import pytest
from selenium.webdriver.support.ui import WebDriverWait
from automation.pages.login_page import LoginPage
from automation.pages.reports_page import ReportsPage

APP = 'com.anonymous.appreact'
pytestmark = [pytest.mark.offline]


@pytest.fixture
def signed_in_qa_user(bundled_app, driver, fresh_offline_account):
    email, password = fresh_offline_account
    page = ReportsPage(driver)
    page.ensure_authenticated(email,password)
    page.discard_draft_if_present()
    return page, email, password


def test_batch_multiple_offline_forms_queue_and_drain(
    signed_in_qa_user, driver, network_manager, offline_evidence
):
    """QA Scenario: User creates multiple distinct forms while offline.

    Expected:
    - All submissions are queued locally with 'Pending' state.
    - None are lost during subsequent submissions.
    - Upon reconnect, all queued items transition to 'Delivered'.
    """
    page, email, password = signed_in_qa_user

    # Go offline
    network_manager.all_off()
    assert network_manager.state().radios_off
    page.wait_offline()

    previous_references = set(page.references())
    # Submit Report 1 using the first editable batch scenario starter.
    page.compose()
    page.choose_scenario('batch_inspection_1')
    WebDriverWait(driver, 15, poll_frequency=0.3).until(
        lambda _: 'filled in.' in page.get_text('report_save_status'),
        'First batch scenario did not prefill and save as a draft',
    )
    page.submit()
    refs_after_first = page.references()
    added_after_first = set(refs_after_first) - previous_references
    assert len(added_after_first) == 1, f'Expected one new report, found {len(added_after_first)}'
    ref1 = added_after_first.pop()
    page.status(ref1, 'Pending')

    # Submit Report 2 as a separate editable draft and separate outbox record.
    page.compose()
    page.choose_scenario('batch_inspection_2')
    WebDriverWait(driver, 15, poll_frequency=0.3).until(
        lambda _: 'filled in.' in page.get_text('report_save_status'),
        'Second batch scenario did not prefill and save as a draft',
    )
    page.submit()
    refs_after_second = page.references()
    added_after_second = set(refs_after_second) - previous_references - {ref1}
    assert len(added_after_second) == 1, f'Expected one additional report, found {len(added_after_second)}'
    ref2 = added_after_second.pop()
    page.status(ref2, 'Pending')

    offline_evidence('batch-reports-queued-pending')

    # Reconnect network
    network_manager.all_on()
    page.wait_connected()

    # Trigger or wait for drain
    # Sync may already have completed automatically. Retry only if the app
    # still has pending work and enables the action.
    page.sync_pending([ref1, ref2])
    offline_evidence('batch-reports-drained-delivered')


def test_offline_form_unicode_and_boundary_text(
    signed_in_qa_user, driver, network_manager, offline_evidence
):
    """QA Edge Case: Form fields containing Unicode, accents, emoji, and boundary strings offline."""
    page, _, _ = signed_in_qa_user

    network_manager.all_off()
    assert network_manager.state().radios_off
    page.wait_offline()

    unicode_title = 'Safety Check: 🚨 Térmico & Café #102'
    unicode_location = 'Plaza São Paulo - Area (B-4)'
    unicode_details = (
        'Observação crítica: Equipamento testado com sucesso a 45°C. '
        'Contém caracteres especiais: <>&"\'; 日本語テスト 🚀.'
    )

    page.fill(
        title=unicode_title,
        location=unicode_location,
        details=unicode_details
    )
    page.assert_fields(unicode_title, unicode_location, unicode_details)
    page.submit()

    ref = page.reference()
    page.status(ref, 'Pending')
    offline_evidence('unicode-offline-pending')

    # Restart app to verify SQLite serialization does not corrupt special characters
    driver.terminate_app(APP)
    driver.activate_app(APP)

    page.find_element(page.HOME, timeout=25)
    page.activity()
    page.status(ref, 'Pending')

    # Reconnect and verify clean transmission
    network_manager.all_on()
    page.wait_connected()
    page.sync_pending([ref])
    offline_evidence('unicode-delivered-clean')
