from fastapi import FastAPI
from app.routers import config_routes, simulation_routes, simulate_routes, compare_routes


app = FastAPI(title="Memory-Aware Scheduler Backend")

# Register routers
app.include_router(config_routes.router)
app.include_router(simulation_routes.router)
app.include_router(simulate_routes.router)
app.include_router(compare_routes.router)

@app.get("/")
def home():
    return {"message": "Backend running successfully!"}
