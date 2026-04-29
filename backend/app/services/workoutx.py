"""
WorkoutX API integration.
Exercise data provided by WorkoutX — https://workoutxapp.com
Direct API (not via RapidAPI). Auth via X-WorkoutX-Key header.
1,321 exercises with GIFs, instructions, secondary muscles.

API key stored in database (api_keys table), managed via Admin UI.
Free plan: 500 requests/month, max 10 results per request.
Basic+: 3,000 req/month, max 100 per request.
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

PROVIDER = "workoutx"
BASE_URL = "https://api.workoutxapp.com/v1"
FREE_QUOTA = 500
BASIC_QUOTA = 3000

# Same body parts as AscendAPI — both APIs use ExerciseDB-derived terminology
BODY_PARTS = [
    "chest", "back", "shoulders", "upper arms", "lower arms",
    "upper legs", "lower legs", "waist", "cardio", "neck",
]

EQUIPMENT_MAP = {
    "barbell": "Barbell", "dumbbell": "Dumbbell", "cable": "Cable",
    "machine": "Machine", "body weight": "Bodyweight",
    "resistance band": "Resistance Band", "kettlebell": "Kettlebell",
    "leverage machine": "Machine", "smith machine": "Machine",
    "ez barbell": "Barbell", "olympic barbell": "Barbell", "trap bar": "Barbell",
    "medicine ball": "Other", "stability ball": "Other", "weighted": "Other",
    "rope": "Cable", "roller": "Other", "wheel roller": "Other",
    "stationary bike": "Cardio", "stepmill machine": "Cardio",
    "skierg machine": "Cardio", "sled machine": "Other",
    "upper body ergometer": "Cardio", "tire": "Other",
}


def _map_equipment(equipment: str) -> str:
    return EQUIPMENT_MAP.get(equipment.lower(), "Other")


def _build_headers(api_key: str) -> dict:
    return {"X-WorkoutX-Key": api_key}


def get_media_dir() -> Optional[Path]:
    settings = get_settings()
    if settings.media_storage == "external":
        return None
    p = Path(settings.media_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def fetch_exercises_by_body_part(
    api_key: str, body_part: str, limit: int = 10, offset: int = 0
) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/exercises/bodyPart/{body_part}",
            headers=_build_headers(api_key),
            params={"limit": limit, "offset": offset},
        )
        # Surface auth failures clearly — don't silently return empty
        if resp.status_code == 401:
            raise httpx.HTTPStatusError(
                "WorkoutX rejected the API key (401 Unauthorized). "
                "Verify the key in Admin → API Keys. WorkoutX keys must start with 'wx_'.",
                request=resp.request, response=resp,
            )
        if resp.status_code == 403:
            raise httpx.HTTPStatusError(
                "WorkoutX returned 403 Forbidden — the key may be disabled, "
                "or you're hitting a feature not on your plan.",
                request=resp.request, response=resp,
            )
        if resp.status_code == 429:
            raise httpx.HTTPStatusError(
                "WorkoutX rate limit hit (429). Wait a minute and try again, "
                "or check your monthly quota.",
                request=resp.request, response=resp,
            )
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else data.get("data", [])


async def fetch_all_exercises(api_key: str, limit_per_part: int = 10) -> list[dict]:
    """
    Fetches exercises across all body parts.
    Free plan: max 10 per request, ~10 requests total = 100 exercises.
    Basic+: can use limit_per_part=100 for ~1,000 exercises in 10 requests.

    Raises an exception immediately on auth/quota errors so the seed log
    captures the real reason instead of silently returning 0 exercises.
    """
    all_exercises = []
    seen_ids: set[str] = set()
    first_error: Optional[Exception] = None

    for part in BODY_PARTS:
        try:
            exercises = await fetch_exercises_by_body_part(api_key, part, limit=limit_per_part)
            for ex in exercises:
                ex_id = ex.get("id")
                if ex_id and ex_id not in seen_ids:
                    seen_ids.add(ex_id)
                    all_exercises.append(ex)
            logger.info("WorkoutX: fetched %d exercises for: %s", len(exercises), part)
        except httpx.HTTPStatusError as e:
            # Auth/quota errors are global — fail fast on the first one
            if e.response.status_code in (401, 403, 429):
                if first_error is None:
                    first_error = e
                    raise  # bubble up immediately
            logger.warning("WorkoutX: failed for %s: %s", part, e)
        except Exception as e:
            logger.warning("WorkoutX: failed for %s: %s", part, e)

    return all_exercises


async def download_gif(gif_url: str, exercise_id: str, api_key: str | None = None) -> Optional[str]:
    """
    WorkoutX GIF endpoints (api.workoutxapp.com/v1/gifs/{id}) are auth-protected.
    Must pass X-WorkoutX-Key header when downloading.

    Always caches locally — WorkoutX GIFs cannot be served externally because
    the URL is auth-protected and browsers don't have the API key.
    """
    # Force local caching for WorkoutX even in 'external' mode — see above
    settings = get_settings()
    if settings.media_storage == "external":
        # Use a local cache directory anyway — WorkoutX GIFs MUST be cached
        media_dir = Path(settings.media_dir)
        media_dir.mkdir(parents=True, exist_ok=True)
    else:
        media_dir = get_media_dir()
        if media_dir is None:
            return gif_url

    filename = f"wx_{exercise_id}.gif"
    dest = media_dir / filename
    local_url = f"/media/exercises/{filename}"

    if dest.exists():
        return local_url

    try:
        # Add auth header for WorkoutX-hosted GIFs
        headers = {}
        if api_key and "workoutxapp.com" in gif_url:
            headers["X-WorkoutX-Key"] = api_key

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(gif_url, follow_redirects=True, headers=headers)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
        return local_url
    except Exception as e:
        logger.warning("WorkoutX: GIF download failed for %s: %s", gif_url, e)
        return gif_url  # fall back to original URL (won't work but won't crash)
        return gif_url


def normalize_exercise(raw: dict) -> dict:
    """Normalize WorkoutX response to Magni schema with multi-category muscle tagging."""
    body_part = raw.get("bodyPart", "") or ""
    target = raw.get("target", "") or ""
    equipment_raw = raw.get("equipment", "") or ""
    secondary = raw.get("secondaryMuscles", []) or []

    if not isinstance(secondary, list):
        secondary = []

    instructions = raw.get("instructions", [])
    if isinstance(instructions, list):
        instructions = "\n".join(f"{i+1}. {step}" for i, step in enumerate(instructions))
    elif not isinstance(instructions, str):
        instructions = ""

    categories = map_muscles_to_categories(
        body_part=body_part, target=target, secondary_muscles=secondary,
    )
    primary = primary_category(body_part=body_part, target=target, secondary_muscles=secondary)

    return {
        "workoutx_id":        raw.get("id"),
        "name":               raw.get("name", "Unknown").title(),
        "muscle_group":       primary,
        "muscle_groups":      serialize_categories(categories),
        "secondary_muscles":  json.dumps(secondary) if secondary else None,
        "equipment":          _map_equipment(equipment_raw),
        "instructions":       instructions or None,
        "gif_url":            raw.get("gifUrl"),
        "video_url":          None,  # WorkoutX doesn't provide video URLs
        "source":             "workoutx",
    }


def estimate_requests(exercise_count: int, download_gifs: bool, plan: str = "free") -> dict:
    metadata_requests = len(BODY_PARTS)
    gif_requests = exercise_count if download_gifs else 0
    total = metadata_requests + gif_requests
    quota = FREE_QUOTA if plan == "free" else BASIC_QUOTA
    return {
        "provider": PROVIDER,
        "metadata_requests": metadata_requests,
        "gif_requests": gif_requests,
        "total_requests": total,
        "free_quota": quota,
        "remaining_estimate": max(0, quota - total),
    }
