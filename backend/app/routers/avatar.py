import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/avatar", tags=["avatar"])

class StreamRequest(BaseModel):
    source_url: str

@router.post("/token")
async def get_heygen_token():
    """Proxy to get a HeyGen (LiveAvatar) Access Token."""
    api_key = "b9681733-1ffb-11f1-a99e-066a7fa2e369"
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.heygen.com/v1/streaming.create_token",
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json"
            }
        )
        if response.status_code != 200:
            logger.error(f"HeyGen Token Error: {response.text}")
            raise HTTPException(status_code=500, detail="Failed to get Avatar token")
            
        data = response.json()
        return {"token": data["data"]["token"]}
