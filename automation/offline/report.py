"""Self-contained HTML and JSON results for offline Appium cases."""

import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path

CASES = {
    'test_demo_offline_capture_restore_and_send': ('DEMO-001', 'Offline capture and server receipt',
        'Android emulator, embedded build, published submission rules, online signup',
        'Delivery inspection; work outcome; risk; contact; follow-up date; checklist; sign-off; details',
        'Show Quick Settings offline; complete structured report; queue; relaunch; restore connectivity; verify Firebase document',
        'Full report survives restart; exact structured payload reaches the original reference; receipt survives relaunch'),
    'test_report_draft_survives_offline_restart': ('FORM-002', 'Draft persistence',
        'Authenticated account and embedded app', 'Report text, outcome, risk, contact, follow-up, checklist and sign-off',
        'Disable connectivity; complete structured form; await saved message; relaunch',
        'All text and selected controls restored without submission'),
    'test_login_requires_network': ('AUTH-001', 'Offline login blocked',
        'Registered account; signed out; radios disabled', 'Registered credentials',
        'Submit offline; restore connectivity; retry the same credentials', 'Offline error; no access offline; successful login after reconnect'),
}
CASES.update({
    'test_online_report_has_server_receipt': ('FORM-003', 'Online server-confirmed submission',
        'Signed in, online, published Firestore rules', 'Delivery report with all fields',
        'Fill; submit; await confirmation; read Firebase document', 'Exact report reaches server'),
    'test_reconnection_sends_pending_without_restart': ('FORM-004', 'Automatic reconnect delivery',
        'Signed in and embedded build', 'Delivery report with all fields',
        'Disable network; submit; restore network without restart', 'Pending becomes confirmed automatically; server contains report'),
})
CASES['test_inline_validation_blocks_invalid_report_submission'] = (
    'FORM-VALIDATION-MATRIX', 'Inline validation and invalid submission prevention',
    'Signed in', 'Empty and below-minimum values for title, location and details',
    'Verify required markers; submit each invalid variant; inspect inline errors; verify values; inspect activity',
    'Required markers are visible; exact field-specific message appears; values remain; no report is queued')
CASES['test_corrected_inline_validation_can_be_saved_offline'] = (
    'FORM-VALIDATION-RECOVERY', 'Correct inline validation and save offline',
    'Signed in; emulator network controls available', 'Short title, then corrected valid report',
    'Go offline; submit short title; correct it; verify error clears; submit valid report',
    'Field error clears on correction; exactly one valid report is saved as pending')
CASES['test_report_follow_up_validation_and_offline_save'] = (
    'FORM-STRUCTURED-VALIDATION', 'Conditional follow-up and contact validation',
    'Signed in; Android emulator with network controls',
    'Malformed phone; missing and invalid due date; corrected structured report',
    'Submit invalid data; inspect inline messages; correct values; queue while offline',
    'Invalid structured values block submission; corrected report is saved once with its summary')



def write_reports(results, destination: Path, since=0):
    destination.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(timezone.utc).isoformat()
    worker = os.environ.get('PYTEST_XDIST_WORKER') or os.environ.get('FARM_WORKER_ID')
    result_file = destination / (f'results-{worker}.json' if worker else 'results.json')
    structured = []
    for test_name, status, detail, evidence in results:
        case = CASES[test_name]
        case_id, scenario, preconditions, data, steps, expected = case
        actual = detail or status
        platform_shots = list((destination.parent / 'android').glob(f'*/{test_name}/*.png'))
        platform_shots += list((destination.parent / 'ios').glob(f'*/{test_name}/*.png'))
        screenshots = sorted(path for path in set([*evidence, *platform_shots])
                             if path.stat().st_mtime >= since)
        shots = [str(path.relative_to(destination.parent)) for path in screenshots]
        platform = os.environ.get('FARM_PLATFORM')
        device_id = (os.environ.get('IOS_UDID') if platform == 'ios' else os.environ.get('ANDROID_UDID')) or os.environ.get('IOS_UDID') or 'default'
        structured.append({
            'id': case_id, 'scenario': scenario, 'preconditions': preconditions,
            'test_data': data, 'steps': steps, 'expected': expected,
            'actual': actual, 'status': status, 'screenshots': shots,
            'device': device_id,
            'observed_utc': generated,
        })
    structured.sort(key=lambda case: (case['id'], case['device']))
    rows = []
    for case in structured:
        links = ' '.join(
            f'<a href="../{html.escape(path)}">Screenshot</a>'
            for path in case['screenshots']
        )
        rows.append('<tr>' + ''.join(
            f'<td>{html.escape(str(case.get(key, "")))}</td>' for key in
            ('id', 'device', 'scenario', 'preconditions', 'test_data',
             'steps', 'expected', 'actual', 'status', 'observed_utc')
        ) + f'<td>{links}</td></tr>')
    result_file.write_text(json.dumps({
        'generated_utc': generated, 'cases': structured,
    }, indent=2))
    (destination / (f'index-{worker}.html' if worker else 'index.html')).write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<title>OwnOne offline Appium results</title><style>
body{font:14px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccd;padding:.6rem;vertical-align:top}th{background:#e9f2fa}
tr:nth-child(even){background:#f7fafc}td{max-width:20rem;overflow-wrap:anywhere}
</style><h1>OwnOne offline Appium results</h1><p>Latest result per case and device. Generated UTC: ''' +
        html.escape(generated) + ' · Current run only</p><table><thead><tr>' + ''.join(
            f'<th>{heading}</th>' for heading in
            ('ID', 'Device', 'Scenario', 'Preconditions', 'Test data', 'Steps',
             'Expected', 'Actual', 'Status', 'Observed UTC', 'Evidence')
        ) + '</tr></thead><tbody>' + ''.join(rows) + '</tbody></table></html>')
