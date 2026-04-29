"""
AscendAPI (formerly ExerciseDB) integration.
Exercise data provided by AscendAPI — https://ascendapi.com
RapidAPI: https://rapidapi.com/user/ascendapi

API key is stored in the database (api_keys table), managed via Admin UI.
Free plan: 2,000 requests/month.
"""
import logging
import json
import httpx
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.services.muscle_mapping import (
    map_muscles_to_categories,
    primary_category,
    serialize_categories,
)

logger = logging.getLogger(__name__)

PROVIDER = "ascendapi"
RAPIDAPI_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}/api/v1"
FREE_QUOTA = 2000

BODY_PARTS = [
    "chest", "back", "shoulders", "upper arms", "lower arms",
    "upper legs", "lower legs", "waist", "cardio",
]

EQUIPMENT_MAP = {
    "barbell": "Barbell", "dumbbell": "Dumbbell", "cable": "Cable",
    "machine": "Machine", "body weight": "Bodyweight",
    "resistance band": "Resistance Band", "kettlebell": "Kettlebell",
    "leverage machine": "Machine", "assisted": "Machine",
    "band": "Resistance Band",
}


def _map_equipment(equipment: str) -> str:
    return EQUIPMENT_MAP.get(equipment.lower(), "Other")


def _build_headers(api_key: str) -> dict:
    return {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": api_key,
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


async def fetch_exercises_by_body_part(
    api_key: str, body_part: str, limit: int = 25, offset: int = 0
) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/exercises",
            headers=_build_headers(api_key),
            params={"bodyPart": body_part, "limit": limit, "offset": offset},
        )
        if resp.status_code == 401:
            raise httpx.HTTPStatusError(
                "AscendAPI rejected the API key (401 Unauthorized). "
                "Verify your RapidAPI key in Admin → API Keys.",
                request=resp.request, response=resp,
            )
        if resp.status_code == 403:
            raise httpx.HTTPStatusError(
                "AscendAPI returned 403 Forbidden — the key may be disabled or not subscribed.",
                request=resp.request, response=resp,
            )
        if resp.status_code == 429:
            raise httpx.HTTPStatusError(
                "AscendAPI rate limit hit (429). Free plan is 2,000/month — check your usage.",
                request=resp.request, response=resp,
            )
        resp.raise_for_status()
        data = resp.json()
    return data.get("data", data) if isinstance(data, dict) else data


async def fetch_all_exercises(api_key: str, limit_per_part: int = 25) -> list[dict]:
    """
    Free plan: 2,000 req/month. This uses ~9 requests (1 per body part).
    Raises immediately on auth/quota errors so the seed log shows the real reason.
    """
    all_exercises = []
    seen_ids: set[str] = set()

    for part in BODY_PARTS:
        try:
            exercises = await fetch_exercises_by_body_part(api_key, part, limit=limit_per_part)
            for ex in exercises:
                ex_id = ex.get("exerciseId") or ex.get("id")
                if ex_id and ex_id not in seen_ids:
                    seen_ids.add(ex_id)
                    all_exercises.append(ex)
            logger.info("AscendAPI: fetched %d exercises for: %s", len(exercises), part)
        except httpx.HTTPStatusError as e:
            # Auth/quota errors are global — fail fast on the first one
            if e.response.status_code in (401, 403, 429):
                raise
            logger.warning("AscendAPI: failed for %s: %s", part, e)
        except Exception as e:
            logger.warning("AscendAPI: failed for %s: %s", part, e)

    return all_exercises


async def download_gif(gif_url: str, exercise_id: str) -> Optional[str]:
    """Downloads a GIF and returns local URL, or returns CDN URL on external mode/failure."""
    media_dir = get_media_dir()
    if media_dir is None:
        return gif_url

    filename = f"{exercise_id}.gif"
    dest = media_dir / filename
    local_url = f"/media/exercises/{filename}"

    if dest.exists():
        return local_url

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(gif_url, follow_redirects=True)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
        return local_url
    except Exception as e:
        logger.warning("AscendAPI: GIF download failed for %s: %s", gif_url, e)
        return gif_url


def normalize_exercise(raw: dict) -> dict:
    """Normalize AscendAPI response to Magni schema with multi-category muscle tagging."""
    body_part = raw.get("bodyPart", "")
    if isinstance(body_part, list):
        body_part = body_part[0] if body_part else ""

    target = raw.get("target", "")
    if isinstance(target, list):
        target = target[0] if target else ""

    equipment_raw = raw.get("equipment", "")
    if isinstance(equipment_raw, list):
        equipment_raw = equipment_raw[0] if equipment_raw else ""

    secondary = raw.get("secondaryMuscles", raw.get("secondary_muscles", []))
    if not isinstance(secondary, list):
        secondary = []

    instructions = raw.get("instructions", [])
    if isinstance(instructions, list):
        instructions = "\n".join(f"{i+1}. {step}" for i, step in enumerate(instructions))

    # Multi-category muscle mapping
    categories = map_muscles_to_categories(
        body_part=body_part, target=target, secondary_muscles=secondary,
    )
    primary = primary_category(body_part=body_part, target=target, secondary_muscles=secondary)

    return {
        "ascendapi_id":       raw.get("exerciseId") or raw.get("id"),
        "name":               raw.get("name", "Unknown"),
        "muscle_group":       primary,
        "muscle_groups":      serialize_categories(categories),
        "secondary_muscles":  json.dumps(secondary) if secondary else None,
        "equipment":          _map_equipment(equipment_raw),
        "instructions":       instructions or None,
        "gif_url":            raw.get("gifUrl") or raw.get("imageUrl"),
        "video_url":          raw.get("videoUrl"),
        "source":             "ascendapi",
    }


def estimate_requests(exercise_count: int, download_gifs: bool) -> dict:
    metadata_requests = len(BODY_PARTS)
    gif_requests = exercise_count if download_gifs else 0
    total = metadata_requests + gif_requests
    return {
        "provider": PROVIDER,
        "metadata_requests": metadata_requests,
        "gif_requests": gif_requests,
        "total_requests": total,
        "free_quota": FREE_QUOTA,
        "remaining_estimate": max(0, FREE_QUOTA - total),
    }
