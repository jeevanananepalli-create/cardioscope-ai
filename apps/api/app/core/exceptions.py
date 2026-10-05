"""API errors and handlers. Responses never contain tracebacks or file paths."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from apps.api.app.core.logging import get_logger
from ml.src.data.preprocessing import FeatureMatrixError
from ml.src.features.feature_schema import LeakageError


class ApiError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str, details: list[dict[str, str]] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []


class ModelUnavailableError(ApiError):
    status_code = 503
    code = "MODEL_UNAVAILABLE"


class ExplanationError(ApiError):
    status_code = 500
    code = "EXPLANATION_FAILED"


class InvalidInputError(ApiError):
    status_code = 422
    code = "INVALID_INPUT"


def error_body(
    code: str, message: str, details: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or []}}


def _field_name(location: tuple) -> str:
    parts = [str(p) for p in location if p not in ("body", "features")]
    return ".".join(parts) if parts else "request"


def _friendly(error: dict[str, Any]) -> str:
    kind, context = error.get("type", ""), error.get("ctx") or {}
    if kind == "missing":
        return "This field is required."
    if kind == "extra_forbidden":
        return "This field is not accepted."
    if kind == "greater_than_equal":
        return f"Must be at least {context.get('ge'):g}."
    if kind == "less_than_equal":
        return f"Must be at most {context.get('le'):g}."
    if kind == "literal_error":
        return f"Must be one of: {context.get('expected', 'the allowed values')}."
    if kind == "json_invalid":
        return "The request body is not valid JSON."
    if kind == "finite_number" or kind.endswith(("_type", "_parsing")):
        return "Must be a valid value of the expected type (a number for measurements)."
    return str(error.get("msg", "Invalid value.")).removeprefix("Value error, ")


def register_exception_handlers(app: FastAPI) -> None:
    logger = get_logger()

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError):
        return JSONResponse(
            error_body(exc.code, exc.message, exc.details), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError):
        details = [
            {"field": _field_name(tuple(error.get("loc", ()))), "message": _friendly(error)}
            for error in exc.errors()
        ]
        missing = sum(1 for d in details if d["message"] == "This field is required.")
        if missing and missing == len(details):
            message = f"Patient data is incomplete: {missing} required field(s) missing."
        else:
            message = (
                f"The request has {len(details)} invalid field(s). Correct them and try again."
            )
        return JSONResponse(error_body("INVALID_INPUT", message, details), status_code=422)

    @app.exception_handler(FeatureMatrixError)
    async def handle_feature_error(request: Request, exc: FeatureMatrixError):
        return JSONResponse(error_body("INVALID_INPUT", str(exc)), status_code=422)

    @app.exception_handler(LeakageError)
    async def handle_leakage(request: Request, exc: LeakageError):
        message = "LAD, LCX, RCA and Cath are prediction targets and cannot be inputs."
        return JSONResponse(error_body("INVALID_INPUT", message), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        message = {404: "Resource not found.", 405: "Method not allowed."}.get(
            exc.status_code, "Request failed."
        )
        return JSONResponse(error_body(code, message), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        # Log the exception type only: the message could echo patient values.
        logger.error(
            "unhandled error on %s %s: %s", request.method, request.url.path, type(exc).__name__
        )
        return JSONResponse(
            error_body("INTERNAL_ERROR", "An unexpected error occurred. Please try again."),
            status_code=500,
        )
