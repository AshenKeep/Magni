"""
AscendAPI (ExerciseDB) integration.
Fetches exercises with GIFs, videos, instructions, and muscle data.
API docs: https://docs.ascendapi.com
RapidAPI: https://rapidapi.com/ascendapi/api/edb-with-videos-and-images-by-ascendapi
"""
import logging
import json
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RAPIDAPI_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}/api/v1"

# Muscle group mapping from AscendAPI body parts to our muscle group names
MUSCLE_MAP = {
    "chest":        "Chest",
    "back":         "Back",
    "shoulders":    "Shoulders",
    "upper arms":   "Biceps",
    "lower arms":   "Biceps",
    "upper legs":   "Legs",
    "lower legs":   "Legs",
    "waist":        "Core",
    "cardio":       "Cardio",
    "neck":         "Other",
}

# Equipment mapping
EQUIPMENT_MAP = {
    "barbell":          "Barbell",
    "dumbbell":         "Dumbbell",
    "cable":            "Cable",
    "machine":          "Machine",
    "body weight":      "Bodyweight",
    "resistance band":  "Resistance Band",
    "kettlebell":       "Kettlebell",
    "leverage machine": "Machine",
    "assisted":         "Machine",
    "band":             "Resistance Band",
}


def _map_muscle(body_part: str) -> str:
    return MUSCLE_MAP.get(body_part.lower(), "Other")


def _map_equipment(equipment: str) -> str:
    return EQUIPMENT_MAP.get(equipment.lower(), "Other")


async def fetch_exercises_by_body_part(
    body_part: str,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """Fetch exercises for a specific body part from AscendAPI."""
    settings = get_settings()
    if not settings.ascendapi_key:
        raise ValueError("ASCENDAPI_KEY is not configured in .env")

    headers = {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": settings.ascendapi_key,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/exercises",
            headers=headers,
            params={"bodyPart": body_part, "limit": limit, "offset": offset},
        )
        resp.raise_for_status()
        data = resp.json()

    return data.get("data", data) if isinstance(data, dict) else data


async def fetch_all_exercises(limit_per_part: int = 20) -> list[dict]:
    """
    Fetches exercises across all major body parts.
    With the free plan (200 exercises), this stays within quota.
    """
    body_parts = [
        "chest", "back", "shoulders", "upper arms", "lower arms",
        "upper legs", "lower legs", "waist", "cardio",
    ]

    all_exercises = []
    seen_ids = set()

    for part in body_parts:
        try:
            exercises = await fetch_exercises_by_body_part(part, limit=limit_per_part)
            for ex in exercises:
                ex_id = ex.get("exerciseId") or ex.get("id")
                if ex_id and ex_id not in seen_ids:
                    seen_ids.add(ex_id)
                    all_exercises.append(ex)
            logger.info("Fetched %d exercises for body part: %s", len(exercises), part)
        except Exception as e:
            logger.warning("Failed to fetch exercises for %s: %s", part, e)

    return all_exercises


def normalize_exercise(raw: dict) -> dict:
    """Normalize AscendAPI exercise data into our schema format."""
    body_part = raw.get("bodyPart", raw.get("bodyParts", [""])[0] if raw.get("bodyParts") else "")
    if isinstance(body_part, list):
        body_part = body_part[0] if body_part else ""

    equipment_raw = raw.get("equipment", raw.get("equipments", [""])[0] if raw.get("equipments") else "")
    if isinstance(equipment_raw, list):
        equipment_raw = equipment_raw[0] if equipment_raw else ""

    target = raw.get("target", "")
    secondary = raw.get("secondaryMuscles", raw.get("secondary_muscles", []))
    if isinstance(secondary, list):
        secondary = json.dumps(secondary)

    instructions = raw.get("instructions", [])
    if isinstance(instructions, list):
        instructions = "\n".join(f"{i+1}. {step}" for i, step in enumerate(instructions))

    return {
        "ascendapi_id": raw.get("exerciseId") or raw.get("id"),
        "name":               raw.get("name", "Unknown"),
        "muscle_group":       _map_muscle(body_part),
        "secondary_muscles":  secondary,
        "equipment":          _map_equipment(equipment_raw),
        "instructions":       instructions or None,
        "gif_url":            raw.get("gifUrl") or raw.get("imageUrl"),
        "video_url":          raw.get("videoUrl"),
    }
