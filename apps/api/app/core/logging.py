"""Logging setup. Request bodies and patient values are never logged."""

from __future__ import annotations

import logging

LOGGER_NAME = "cardioscope.api"


def configure_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
        logger.propagate = False
    logger.setLevel(level.upper())
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)
