"""Read actual Firebase receipt with the test user's credentials; never seed data."""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def request_json(url, payload=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = Request(url, data=json.dumps(payload).encode() if payload else None, headers=headers)
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def server_document(email, password, environment, reference):
    config = dict(os.environ)
    env_file = Path(__file__).resolve().parents[2] / '.env'
    for line in (env_file.read_text().splitlines() if env_file.exists() else []):
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            config.setdefault(key.strip(), value.strip().strip('\"\''))
    missing = [key for key in ('EXPO_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID') if not config.get(key)]
    if missing:
        raise RuntimeError('Missing server-verification configuration: ' + ', '.join(missing))
    identity = request_json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + config['EXPO_PUBLIC_FIREBASE_API_KEY'],
                            {'email': email, 'password': password, 'returnSecureToken': True})
    name = f"projects/{config['EXPO_PUBLIC_FIREBASE_PROJECT_ID']}/databases/(default)/documents/environments/{environment}/workspaces/acme-corp/members/{identity['localId']}/submissions/{reference}"
    return request_json('https://firestore.googleapis.com/v1/' + name, token=identity['idToken'])


def assert_submission_rules(email, password, environment):
    """Verify deployed per-member reads before changing emulator connectivity."""
    probe = 'offline-rule-probe-does-not-exist'
    try:
        server_document(email, password, environment, probe)
    except Exception as error:
        reason = getattr(error, 'code', None)
        if reason == 404:
            return
        if reason == 403:
            raise AssertionError(
                'Firestore denied the current member report path. Publish the latest '
                'repository firestore.rules to the Firebase project, then rerun.'
            ) from error
        raise AssertionError(f'Could not verify Firebase report rules: {error}') from error
    raise AssertionError('Unexpectedly found the reserved report permission probe document.')
