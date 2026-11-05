"""Declarative semantic locator catalog for OwnOne AppReact mobile screens.

Provides secondary semantic signatures (roles, expected text variations,
accessibility labels, placeholders, and neighbor anchors) when primary testIDs
are modified, renamed, or refactored between native builds.
"""
from dataclasses import dataclass, field
import difflib
import re
from typing import Dict, List, Optional


@dataclass(frozen=True)
class SemanticDescriptor:
    test_id: str
    role: str  # 'button', 'input', 'text', 'tab', 'switch', 'checkbox', 'radio', 'card', 'alert', 'link'
    texts: List[str] = field(default_factory=list)
    labels: List[str] = field(default_factory=list)
    placeholders: List[str] = field(default_factory=list)
    neighbor_texts: List[str] = field(default_factory=list)
    android_classes: List[str] = field(default_factory=list)
    ios_classes: List[str] = field(default_factory=list)


# Screen-specific semantic locator signatures
CATALOG_DEFINITIONS: List[SemanticDescriptor] = [
    # ==========================================
    # 1. Login Screen (src/components/forms/login-form.tsx)
    # ==========================================
    SemanticDescriptor(
        test_id="login_email_input",
        role="input",
        labels=["Email address", "Email", "login_email_input"],
        placeholders=["you@example.com", "Enter your email", "Email"],
        neighbor_texts=["Email address"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="login_password_input",
        role="input",
        labels=["Password", "login_password_input"],
        placeholders=["Enter your password", "Password"],
        neighbor_texts=["Password"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeSecureTextField", "XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="login_submit_btn",
        role="button",
        texts=["Sign in", "Signing in…", "Log in", "Sign In", "Authorize & Sign In"],
        labels=["Sign in", "login_submit_btn", "Submit"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="login_signup_link",
        role="link",
        texts=["Create an account", "Sign up", "Create account"],
        labels=["Create an account", "login_signup_link"],
        neighbor_texts=["New to OwnOne?"],
        android_classes=["android.widget.TextView", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeLink", "XCUIElementTypeButton", "XCUIElementTypeStaticText"],
    ),
    SemanticDescriptor(
        test_id="login_error_message",
        role="alert",
        labels=["login_error_message", "Error"],
        neighbor_texts=["Please enter a valid email address.", "Please enter your password."],
        android_classes=["android.widget.TextView", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeAlert", "XCUIElementTypeStaticText"],
    ),
    SemanticDescriptor(
        test_id="signup_success_message",
        role="alert",
        texts=["Account created. Sign in to start capturing reports."],
        labels=["Account created. Sign in to start capturing reports.", "signup_success_message"],
        android_classes=["android.widget.TextView", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeStaticText", "XCUIElementTypeOther"],
    ),
    SemanticDescriptor(
        test_id="env_indicator_banner",
        role="button",
        labels=["env_indicator_banner", "Environment"],
        texts=["Environment: QA", "Environment: DEV", "Environment: STAGE"],
        android_classes=["android.view.ViewGroup", "android.widget.TextView"],
        ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
    ),

    # ==========================================
    # 2. Signup Screen (src/components/forms/signup-form.tsx)
    # ==========================================
    SemanticDescriptor(
        test_id="signup_name_input",
        role="input",
        labels=["Full name", "signup_name_input"],
        placeholders=["Your full name", "Full name"],
        neighbor_texts=["Full name"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="signup_email_input",
        role="input",
        labels=["Email address", "signup_email_input"],
        placeholders=["you@example.com", "Email"],
        neighbor_texts=["Email address"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="signup_password_input",
        role="input",
        labels=["Create password", "Password", "signup_password_input"],
        placeholders=["At least 8 characters", "Create password"],
        neighbor_texts=["Create password"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeSecureTextField", "XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="signup_confirm_input",
        role="input",
        labels=["Confirm password", "signup_confirm_input"],
        placeholders=["Re-enter your password", "Confirm password"],
        neighbor_texts=["Confirm password"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeSecureTextField", "XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="signup_submit_btn",
        role="button",
        texts=["Create account", "Creating account…", "Sign up", "Register"],
        labels=["Create account", "signup_submit_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="signup_login_link",
        role="link",
        texts=["Sign in", "Log in"],
        labels=["Sign in", "signup_login_link"],
        neighbor_texts=["Already have an account?"],
        android_classes=["android.widget.TextView", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeLink", "XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="signup_draft_saved",
        role="text",
        texts=["Saved on this device only. Not submitted to the server."],
        labels=["signup_draft_saved"],
        android_classes=["android.widget.TextView"],
        ios_classes=["XCUIElementTypeStaticText"],
    ),
    SemanticDescriptor(
        test_id="signup_error_message",
        role="alert",
        labels=["signup_error_message", "Error"],
        android_classes=["android.widget.TextView", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeAlert", "XCUIElementTypeStaticText"],
    ),

    # ==========================================
    # 3. Reports Navigation & Hero (src/app/(tabs)/index.tsx)
    # ==========================================
    SemanticDescriptor(
        test_id="report_connectivity_card",
        role="card",
        texts=["WORK SAVED. PROGRESS TRACKED.", "Awaiting sync", "Server confirmed"],
        labels=["report_connectivity_card"],
        android_classes=["android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeOther"],
    ),
    SemanticDescriptor(
        test_id="report_section_compose",
        role="tab",
        texts=["New report", "Compose"],
        labels=["New report", "report_section_compose"],
        android_classes=["android.view.ViewGroup", "android.widget.TextView"],
        ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
    ),
    SemanticDescriptor(
        test_id="report_section_history",
        role="tab",
        texts=["Activity", "History"],
        labels=["Activity", "report_section_history"],
        android_classes=["android.view.ViewGroup", "android.widget.TextView"],
        ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
    ),
    SemanticDescriptor(
        test_id="report_open_scenario_picker_btn",
        role="button",
        texts=["Choose a scenario…", "Select scenario", "Scenario"],
        labels=["Choose a scenario…", "report_open_scenario_picker_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup", "android.widget.TextView"],
        ios_classes=["XCUIElementTypeButton"],
    ),

    # ==========================================
    # 4. Report Form Fields (src/features/submissions/field-reports.tsx)
    # ==========================================
    SemanticDescriptor(
        test_id="report_title_input",
        role="input",
        labels=["Report title *", "report_title_input", "Title"],
        placeholders=["e.g. Delivery completed at client site", "Report title"],
        neighbor_texts=["Report title *"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_location_input",
        role="input",
        labels=["Site / location *", "report_location_input", "Location"],
        placeholders=["e.g. Hyderabad · Warehouse 02", "Location"],
        neighbor_texts=["Site / location *"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_work_order_reference_input",
        role="input",
        labels=["Customer / work order reference (optional)", "report_work_order_reference_input"],
        placeholders=["e.g. WO-2048 or service ticket ID"],
        neighbor_texts=["Customer / work order reference"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_details_input",
        role="input",
        labels=["What happened? *", "report_details_input", "Details"],
        placeholders=["Describe the work completed and any follow-up needed"],
        neighbor_texts=["What happened? *"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextView", "XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_next_action_input",
        role="input",
        labels=["Next action / handover (optional)", "report_next_action_input"],
        placeholders=["Who needs to do what next? Add a handover note if useful."],
        neighbor_texts=["Next action / handover"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextView", "XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_emergency_contact_input",
        role="input",
        labels=["On-site contact phone (optional)", "report_emergency_contact_input"],
        placeholders=["e.g. +1 415 555 0130"],
        neighbor_texts=["On-site contact phone"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_requires_follow_up_toggle",
        role="switch",
        labels=["Requires immediate follow-up", "report_requires_follow_up_toggle"],
        texts=["Requires immediate follow-up"],
        neighbor_texts=["Requires immediate follow-up"],
        android_classes=["android.widget.Switch", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeSwitch", "XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="report_follow_up_date_input",
        role="input",
        labels=["Follow-up due date *", "report_follow_up_date_input", "Due date"],
        placeholders=["YYYY-MM-DD", "Due date"],
        neighbor_texts=["Follow-up due date *"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_sign_off_name_input",
        role="input",
        labels=["Completed by (optional)", "report_sign_off_name_input"],
        placeholders=["Name of the person completing this report"],
        neighbor_texts=["Completed by"],
        android_classes=["android.widget.EditText"],
        ios_classes=["XCUIElementTypeTextField"],
    ),
    SemanticDescriptor(
        test_id="report_submit_btn",
        role="button",
        texts=["Submit report", "Save for submission", "Saving…", "Submit"],
        labels=["Submit report", "Save for submission", "report_submit_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="report_discard_btn",
        role="button",
        texts=["Discard draft", "Discard"],
        labels=["Discard draft", "report_discard_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="report_error",
        role="alert",
        labels=["report_error", "Review the highlighted fields and try again."],
        neighbor_texts=["Review the highlighted fields and try again."],
        android_classes=["android.widget.TextView"],
        ios_classes=["XCUIElementTypeAlert", "XCUIElementTypeStaticText"],
    ),
    SemanticDescriptor(
        test_id="report_sync_now_btn",
        role="button",
        texts=["Sync now", "Sync all", "Sync"],
        labels=["Sync now", "report_sync_now_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),

    # ==========================================
    # 5. Account Screen (src/app/(tabs)/account.tsx)
    # ==========================================
    SemanticDescriptor(
        test_id="profile_identity_card",
        role="card",
        texts=["Your profile", "Account", "Profile"],
        labels=["profile_identity_card", "Your profile"],
        android_classes=["android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeOther"],
    ),
    SemanticDescriptor(
        test_id="account_logout_btn",
        role="button",
        texts=["Sign out", "Log out", "Logout", "Signing out…"],
        labels=["Sign out", "account_logout_btn", "Log out"],
        neighbor_texts=["Your profile"],
        android_classes=["android.widget.Button", "android.view.ViewGroup", "android.widget.TextView"],
        ios_classes=["XCUIElementTypeButton"],
    ),
    SemanticDescriptor(
        test_id="profile_view_reports_btn",
        role="button",
        texts=["Back to my reports", "Reports"],
        labels=["Back to my reports", "profile_view_reports_btn"],
        android_classes=["android.widget.Button", "android.view.ViewGroup"],
        ios_classes=["XCUIElementTypeButton"],
    ),
]


class LocatorCatalog:
    """Registry providing fast lookup and dynamic pattern matching for UI elements."""
    _lookup: Dict[str, SemanticDescriptor] = {desc.test_id: desc for desc in CATALOG_DEFINITIONS}

    @classmethod
    def get(cls, test_id: str) -> Optional[SemanticDescriptor]:
        if test_id in cls._lookup:
            return cls._lookup[test_id]

        # Dynamic prefix matching for parameterized test IDs
        # E.g. 'report_outcome_Blocked' -> role: radio, text: 'Blocked'
        if test_id.startswith("report_outcome_"):
            outcome_val = test_id.replace("report_outcome_", "").replace("_", " ")
            return SemanticDescriptor(
                test_id=test_id,
                role="radio",
                texts=[outcome_val],
                labels=[test_id, outcome_val],
                android_classes=["android.view.ViewGroup", "android.widget.TextView"],
                ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
            )

        # E.g. 'report_risk_High' -> role: radio, text: 'High'
        if test_id.startswith("report_risk_"):
            risk_val = test_id.replace("report_risk_", "")
            return SemanticDescriptor(
                test_id=test_id,
                role="radio",
                texts=[risk_val],
                labels=[test_id, risk_val],
                android_classes=["android.view.ViewGroup", "android.widget.TextView"],
                ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
            )

        # E.g. 'report_checklist_toggle_0' -> role: checkbox
        if test_id.startswith("report_checklist_toggle_"):
            return SemanticDescriptor(
                test_id=test_id,
                role="checkbox",
                labels=[test_id],
                android_classes=["android.view.ViewGroup", "android.widget.CheckBox"],
                ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
            )

        # E.g. 'report_section_...'
        if test_id.startswith("report_section_"):
            section_name = test_id.replace("report_section_", "").capitalize()
            return SemanticDescriptor(
                test_id=test_id,
                role="tab",
                texts=[section_name],
                labels=[test_id, section_name],
                android_classes=["android.view.ViewGroup", "android.widget.TextView"],
                ios_classes=["XCUIElementTypeButton", "XCUIElementTypeOther"],
            )

        # E.g. 'report_..._error' -> role: alert (inline error message)
        if test_id.startswith("report_") and test_id.endswith("_error"):
            field_name = test_id.replace("report_", "").replace("_error", "")
            return SemanticDescriptor(
                test_id=test_id,
                role="alert",
                labels=[test_id, f"{field_name}_error"],
                android_classes=["android.widget.TextView"],
                ios_classes=["XCUIElementTypeStaticText", "XCUIElementTypeAlert"],
            )

        def get_semantic_role(ident: str) -> Optional[str]:
            for sfx, role in [
                ("_error", "alert"),
                ("_message", "alert"),
                ("_alert", "alert"),
                ("_input", "input"),
                ("_field", "input"),
                ("_btn", "button"),
                ("_button", "button"),
                ("_link", "link"),
                ("_toggle", "switch"),
                ("_switch", "switch"),
                ("_card", "card"),
                ("_tab", "tab"),
            ]:
                if ident.endswith(sfx):
                    return role
            return None

        requested_role = get_semantic_role(test_id)

        # Fuzzy catalog fallback when testID has minor naming drift
        # e.g. 'login_email_field' -> 'login_email_input' (enforcing matching role)
        close_matches = difflib.get_close_matches(test_id, cls._lookup.keys(), n=3, cutoff=0.55)
        for cand_key in close_matches:
            cand_desc = cls._lookup[cand_key]
            if requested_role is None or cand_desc.role == requested_role:
                return cand_desc

        # Token overlap matching: e.g. ['login', 'email']
        ignored_tokens = {
            'btn', 'button', 'input', 'field', 'txt', 'view',
            'error', 'err', 'alert', 'message', 'msg', 'card', 'toggle', 'switch', 'tab'
        }
        tokens = set(re.split(r'[_ -]', test_id.lower())) - ignored_tokens
        if tokens:
            best_desc = None
            best_overlap = 0
            for key, desc in cls._lookup.items():
                if requested_role is not None and desc.role != requested_role:
                    continue
                key_tokens = set(re.split(r'[_ -]', key.lower())) - ignored_tokens
                overlap = len(tokens & key_tokens)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_desc = desc
            if best_desc and best_overlap >= 2:
                return best_desc

        return None
