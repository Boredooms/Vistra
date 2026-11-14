"""Symmetric encryption for secrets at rest (Fernet; key derived from ENCRYPTION_KEY)."""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.errors import ProblemError


def _fernet() -> Fernet:
    k = get_settings().encryption_key
    if not k:
        raise ProblemError("INTERNAL_ERROR", 500, "Server misconfigured", "ENCRYPTION_KEY is not set")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(k.encode()).digest()))


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise ProblemError("INTERNAL_ERROR", 500, "Server misconfigured", "Stored secret cannot be decrypted") from e
