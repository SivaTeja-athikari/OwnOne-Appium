"""
Centralized environment configurations for mobile automation testing.
Guarantees test suite parity with React Native application configurations.
"""

from typing import Dict, Any

ENVIRONMENTS: Dict[str, Dict[str, Any]] = {
    "development": {
        "name": "development",
        "label": "Development (Local/Dev)",
        "api_base_url": "https://dev-api.saasplatform.internal/v1",
        "auth_endpoint": "https://dev-auth.saasplatform.internal/oauth/token",
        "request_timeout_ms": 15000,
        "is_production": False,
        "allow_mock_fallback": True,
    },
    "qa": {
        "name": "qa",
        "label": "Quality Assurance (QA)",
        "api_base_url": "https://qa-api.saasplatform.internal/v1",
        "auth_endpoint": "https://qa-auth.saasplatform.internal/oauth/token",
        "request_timeout_ms": 20000,
        "is_production": False,
        "allow_mock_fallback": True,
    },
    "staging": {
        "name": "staging",
        "label": "Staging (Pre-Prod)",
        "api_base_url": "https://staging-api.saasplatform.com/v1",
        "auth_endpoint": "https://staging-auth.saasplatform.com/oauth/token",
        "request_timeout_ms": 15000,
        "is_production": False,
        "allow_mock_fallback": False,
    },
    "production": {
        "name": "production",
        "label": "Production",
        "api_base_url": "https://api.saasplatform.com/v1",
        "auth_endpoint": "https://auth.saasplatform.com/oauth/token",
        "request_timeout_ms": 10000,
        "is_production": True,
        "allow_mock_fallback": False,
    },
}

def get_environment_config(env_name: str) -> Dict[str, Any]:
    if env_name not in ENVIRONMENTS:
        raise ValueError(f"Unknown environment: '{env_name}'. Valid options: {list(ENVIRONMENTS.keys())}")
    return ENVIRONMENTS[env_name]
