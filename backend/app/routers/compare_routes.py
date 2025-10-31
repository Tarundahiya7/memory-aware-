from fastapi import APIRouter
from app.models.schemas import SystemConfig
from app.core.scheduler import compare_schedulers

router = APIRouter(prefix="/simulate", tags=["Comparison"])

@router.post("/compare")
def compare(config: SystemConfig):
    return compare_schedulers(config)
