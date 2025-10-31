from fastapi import APIRouter
from app.models.schemas import SystemConfig
from fastapi.responses import JSONResponse


router = APIRouter(
    prefix="/config",
    tags=["Configuration"],
)

@router.post("/submit")
def receive_config(config: SystemConfig):
    """
    Receives and validates simulation input JSON.
    """
    return {"message": "Configuration received successfully!", "data": config}
