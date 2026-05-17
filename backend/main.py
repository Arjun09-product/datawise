from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import ingest, analysis, store

app = FastAPI(title="Datawise API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(analysis.router)
app.include_router(store.router)

from routers import api_shim
app.include_router(api_shim.router)


@app.get("/health")
def health():
    return {"status": "ok"}
