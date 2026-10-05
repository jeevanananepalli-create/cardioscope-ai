# CardioScope AI API image.
#
# The trained models are NOT baked in: they are mounted at /app/ml/models (see
# docker-compose.yml), because they are generated from a dataset that is not distributed
# with this repository. Train them first with `python -m ml.scripts.train_all`.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libgomp is needed by XGBoost and scikit-learn at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
COPY apps/api/requirements.txt apps/api/requirements.txt
COPY ml/__init__.py ml/__init__.py
COPY ml/src ml/src
COPY ml/configs ml/configs
RUN pip install . -r apps/api/requirements.txt

COPY apps/__init__.py apps/__init__.py
COPY apps/api apps/api
# Class distribution shown on the model performance page (aggregate counts only).
COPY ml/reports/metrics/class_distribution.json ml/reports/metrics/class_distribution.json

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')"

CMD ["python", "-m", "uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
