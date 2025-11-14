from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..db.base import get_session
from ..db.models import Run
from ..models.schemas import SaveRunRequest

router = APIRouter(prefix="/runs", tags=["Runs"])

@router.get("/")
def list_runs(db: Session = Depends(get_session)):
    rows = db.query(Run).order_by(Run.id.desc()).limit(200).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "created_at": getattr(r.created_at, "isoformat", lambda: str(r.created_at))(),
            "input": r.input,
            "results": r.results,
        }
        for r in rows
    ]

@router.post("/")
def save_run(req: SaveRunRequest, db: Session = Depends(get_session)):
    name = req.name or "Run"
    row = Run(name=name, input=req.input.model_dump(), results=req.results)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "created_at": getattr(row.created_at, "isoformat", lambda: str(row.created_at))(),
        "input": row.input,
        "results": row.results,
    }
