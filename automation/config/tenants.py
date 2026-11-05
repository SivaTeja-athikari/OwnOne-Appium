"""
Tenant metadata, business rules, feature flags, and authorized test personas.
"""

from typing import Dict, Any

TENANTS: Dict[str, Dict[str, Any]] = {
    "acme-corp": {
        "id": "acme-corp",
        "display_name": "Acme Logistics & Supply",
        "badge_text": "ACME",
        "primary_color": "#0284C7",
        "currency": "USD",
        "max_transaction_amount": 100000,
        "features": {
            "reporting": True,
            "csv_export": True,
            "biometrics": True,
            "scanner": True,
        },
        "personas": {
            "admin": "admin@enterprise.com",
            "manager": "manager@acme.com",
        },
    },
    "apex-health": {
        "id": "apex-health",
        "display_name": "Apex Healthcare Solutions",
        "badge_text": "APEX",
        "primary_color": "#059669",
        "currency": "USD",
        "max_transaction_amount": 25000,
        "features": {
            "reporting": False,
            "csv_export": False,  # Strict HIPAA restriction
            "biometrics": True,
            "scanner": True,
        },
        "personas": {
            "admin": "admin@enterprise.com",
            "cmo": "doctor@apexhealth.org",
        },
    },
    "zenith-financial": {
        "id": "zenith-financial",
        "display_name": "Zenith Capital Group",
        "badge_text": "ZENITH",
        "primary_color": "#7C3AED",
        "currency": "EUR",
        "max_transaction_amount": 1000000,
        "features": {
            "reporting": True,
            "csv_export": True,
            "biometrics": True,
            "scanner": False,
        },
        "personas": {
            "admin": "admin@enterprise.com",
            "auditor": "auditor@zenithcapital.com",
        },
    },
}

def get_tenant_config(tenant_id: str) -> Dict[str, Any]:
    if tenant_id not in TENANTS:
        raise ValueError(f"Unknown tenant: '{tenant_id}'. Valid options: {list(TENANTS.keys())}")
    return TENANTS[tenant_id]
