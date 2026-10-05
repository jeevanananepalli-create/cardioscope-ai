from fastapi import APIRouter

from apps.api.app.api.v1 import explanations, health, predictions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(predictions.router)
api_router.include_router(explanations.router)
