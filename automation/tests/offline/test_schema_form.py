"""Real-device smoke checks for schema-defined client fields."""
import pytest
from selenium.webdriver.support.ui import WebDriverWait

from automation.pages.reports_page import ReportsPage
from automation.pages.schema_form_page import SchemaFormPage
from automation.offline.server_evidence import assert_submission_rules, server_document


pytestmark = [pytest.mark.offline, pytest.mark.schema_form]


def test_added_schema_field_is_submitted_under_published_firestore_rules(
    driver, fresh_offline_account, bundled_app, environment,
):
    email, password = fresh_offline_account
    reports = ReportsPage(driver)
    reports.ensure_authenticated(email, password)
    assert_submission_rules(email, password, environment)
    reports.compose()

    form = SchemaFormPage(driver)
    field = next(
        definition for definition in form.schema['fields']
        if definition.get('custom') and definition['type'] in {'text', 'multiline', 'phone', 'date'}
    )
    entered = 'ASSET-4072'
    form.enter(field['id'], entered)

    # Use the established valid baseline for the app's fixed business-required
    # report fields; the added client field above remains schema-discovered.
    reports.fill(
        'Schema client field test',
        'North Test Site',
        'Testing a dynamic client-configured field submission.',
    )

    reports.submit()
    if reports._visible('report_error'):
        raise AssertionError(f'Report form rejected the generic schema values: {reports.get_text("report_error")}')
    reference = reports.reference()
    reports.status(reference, 'Server confirmed')
    receipt = server_document(email, password, environment, reference)
    fields = receipt['fields']
    assert fields['customFields']['mapValue']['fields'][field['id']]['stringValue'] == entered
    assert fields['formSchemaId']['stringValue'] == form.schema['formId']
    assert fields['formSchemaVersion']['integerValue'] == str(form.schema['version'])
