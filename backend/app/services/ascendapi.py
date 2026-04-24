"""
AscendAPI (formerly ExerciseDB) integration.
Exercise data provided by AscendAPI — https://ascendapi.com
RapidAPI: https://rapidapi.com/user/ascendapi

Fetches exercises with GIFs, videos, instructions, and muscle data.
Supports three media storage modes:
  - external: store CDN URLs only (no downloads, uses ~9 API requests)
  - local:    download GIFs to local Docker volume
  - cifs:     download GIFs to CIFS-mounted NAS share
"""
import logging
import json
import os
import httpx
from pathlib import Path
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RAPIDAPI_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}/api/v1"

BODY_PARTS = [
    "chest", "back", "shoulders", "upper arms", "lower arms",
    "upper legs", "lower legs", "waist", "cardio",
]

MUSCLE_MAP = {
    "chest": "Chest", "back": "Back", "shoulders": "Shoulders",
    "upper arms": "Biceps", "lower arms": "Biceps",
    "upper legs": "Legs", "lower legs": "Legs",
    "waist": "Core", "cardio": "Cardio", "neck": "Other",
}

EQUIPMENT_MAP = {
    "barbell": "Barbell", "dumbbell": "Dumbbell", "cable": "Cable",
    "machine": "Machine", "body weight": "Bodyweight",
    "resistance band": "Resistance Band", "kettlebell": "Kettlebell",
    "leverage machine": "Machine", "assisted": "Machine",
    "band": "Resistance Band",
}


def _map_muscle(body_part: str) -> str:
    return MUSCLE_MAP.get(body_part.lower(), "Other")


def _map_equipment(equipment: str) -> str:
    return EQUIPMENT_MAP.get(equipment.lower(), "Other")


def _get_headers() -> dict:
    # Read directly from os.environ to bypass lru_cache on get_settings()
    key = os.environ.get("ASCENDAPI_KEY", "").strip()
    if not key:
        raise ValueError("ASCENDAPI_KEY is not set in the container environment")
    return {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": key,
        "Content-Type": "application/json",
    }


def get_media_dir() -> Optional[Path]:
    """Returns the media directory Path if local/cifs storage is configured."""
    settings = get_settings()
    if settings.media_storage == "external":
        return None
    p = Path(settings.media_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def fetch_exercises_by_body_part(body_part: str, limit: int = 25, offset: int = 0) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/exercises",
            headers=_get_headers(),
            params={"bodyPart": body_part, "limit": limit, "offset": offset},
        )
        resp.raise_for_status()
        data = resp.json()
    return data.get("data", data) if isinstance(data, dict) else data


async def fetch_all_exercises(limit_per_part: int = 25) -> list[dict]:
    """
    Fetches exercises across all body parts.
    Free plan: 2,000 req/month. This uses ~9 requests (1 per body part).
    """
    all_exercises = []
    seen_ids: set[str] = set()

    for part in BODY_PARTS:
        try:
            exercises = await fetch_exercises_by_body_part(part, limit=limit_per_part)
            for ex in exercises:
                ex_id = ex.get("exerciseId") or ex.get("id")
                if ex_id and ex_id not in seen_ids:
                    seen_ids.add(ex_id)
                    all_exercises.append(ex)
            logger.info("Fetched %d exercises for: %s", len(exercises), part)
        except Exception as e:
            logger.warning("Failed to fetch exercises for %s: %s", part, e)

    return all_exercises


async def download_gif(gif_url: str, ascendapi_id: str) -> Optional[str]:
    """
    Downloads a GIF from the CDN and saves it to the media directory.
    Returns the local URL path (e.g. /media/exercises/exr_xxx.gif) or None on failure.
    """
    media_dir = get_media_dir()
    if media_dir is None:
        return gif_url  # external mode — return CDN URL unchanged

    filename = f"{ascendapi_id}.gif"
    dest = media_dir / filename
    local_url = f"/media/exercises/{filename}"

    if dest.exists():
        return local_url  # already downloaded

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(gif_url, follow_redirects=True)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
        logger.info("Downloaded GIF: %s", filename)
        return local_url
    except Exception as e:
        logger.warning("Failed to download GIF %s: %s", gif_url, e)
        return gif_url  # fall back to CDN URL


def normalize_exercise(raw: dict) -> dict:
    """Normalize AscendAPI response to our internal schema."""
    body_part = raw.get("bodyPart", "")
    if isinstance(body_part, list):
        body_part = body_part[0] if body_part else ""

    equipment_raw = raw.get("equipment", "")
    if isinstance(equipment_raw, list):
        equipment_raw = equipment_raw[0] if equipment_raw else ""

    secondary = raw.get("secondaryMuscles", raw.get("secondary_muscles", []))
    if isinstance(secondary, list):
        secondary = json.dumps(secondary)

    instructions = raw.get("instructions", [])
    if isinstance(instructions, list):
        instructions = "\n".join(f"{i+1}. {step}" for i, step in enumerate(instructions))

    return {
        "ascendapi_id":       raw.get("exerciseId") or raw.get("id"),
        "name":               raw.get("name", "Unknown"),
        "muscle_group":       _map_muscle(body_part),
        "secondary_muscles":  secondary or None,
        "equipment":          _map_equipment(equipment_raw),
        "instructions":       instructions or None,
        "gif_url":            raw.get("gifUrl") or raw.get("imageUrl"),
        "video_url":          raw.get("videoUrl"),
    }


def estimate_requests(exercise_count: int, download_gifs: bool) -> dict:
    """Estimates API request usage for a seed operation."""
    metadata_requests = len(BODY_PARTS)  # 1 per body part
    gif_requests = exercise_count if download_gifs else 0
    total = metadata_requests + gif_requests
    return {
        "metadata_requests": metadata_requests,
        "gif_requests": gif_requests,
        "total_requests": total,
        "free_quota": 2000,
        "remaining_estimate": max(0, 2000 - total),
    }
