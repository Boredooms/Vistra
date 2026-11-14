"""Typed domain errors rendered as RFC 9457 problem+json."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProblemError(Exception):
    code: str
    status: int
    title: str
    detail: str = ""

    def __str__(self) -> str:
        return f"{self.code}: {self.detail or self.title}"


def origin_not_allowed(detail: str = "Origin is not registered for this application") -> ProblemError:
    return ProblemError("ORIGIN_NOT_ALLOWED", 403, "Origin not allowed", detail)


def session_expired() -> ProblemError:
    return ProblemError("SESSION_EXPIRED", 401, "Session expired", "The SDK session token has expired")


def session_revoked() -> ProblemError:
    return ProblemError("SESSION_REVOKED", 401, "Session revoked", "The SDK session was revoked")


def auth_invalid(detail: str = "Invalid credentials") -> ProblemError:
    return ProblemError("AUTH_INVALID_ISSUER", 401, "Invalid credentials", detail)


def validation_error(detail: str) -> ProblemError:
    return ProblemError("VALIDATION_ERROR", 422, "Validation error", detail)


def tool_args_invalid(detail: str) -> ProblemError:
    return ProblemError("TOOL_ARGS_INVALID", 422, "Tool arguments invalid", detail)


def policy_denied(detail: str) -> ProblemError:
    return ProblemError("POLICY_DENIED", 403, "Policy denied", detail)


def approval_required(detail: str = "Approval is required") -> ProblemError:
    return ProblemError("APPROVAL_REQUIRED", 409, "Approval required", detail)


def approval_expired(detail: str = "Approval expired or arguments changed") -> ProblemError:
    return ProblemError("APPROVAL_EXPIRED", 409, "Approval expired", detail)


def provider_unavailable(detail: str = "No model provider could serve the request") -> ProblemError:
    return ProblemError("PROVIDER_UNAVAILABLE", 503, "Provider unavailable", detail)


def provider_config_error(detail: str) -> ProblemError:
    return ProblemError("PROVIDER_CONFIGURATION_ERROR", 500, "Provider configuration error", detail)


def capability_unavailable(detail: str) -> ProblemError:
    return ProblemError("CAPABILITY_UNAVAILABLE", 422, "Capability unavailable", detail)


def not_found(what: str = "Resource") -> ProblemError:
    return ProblemError("NOT_FOUND", 404, "Not found", f"{what} not found")


def forbidden(detail: str = "Insufficient scope") -> ProblemError:
    return ProblemError("FORBIDDEN", 403, "Forbidden", detail)
