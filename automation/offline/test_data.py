"""Readable, safe email addresses for UI registration tests."""

from secrets import randbelow


def fresh_email(first_name: str, last_name: str) -> str:
    """Use a human-readable address; eight digits reduce collisions across independent runs."""
    if not (first_name.isalpha() and last_name.isalpha()):
        raise ValueError('Test email names must contain letters only')
    return f'{first_name.lower()}.{last_name.lower()}.{10000000 + randbelow(90000000)}@example.com'
