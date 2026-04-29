"""
Shared muscle mapping logic.
Maps body parts and secondary muscle names to Magni's simplified categories.

Used by both AscendAPI and WorkoutX providers to ensure consistent tagging.
An exercise can map to multiple categories (e.g. push-up → Chest + Shoulders + Core).
"""
import json
from typing import Iterable

# Canonical Magni muscle categories shown in the UI filter dropdown
CATEGORIES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Cardio", "Other"]

# Maps any input muscle/body-part name (lowercase) → Magni category
# Both APIs return similar terminology — this single map handles both.
MUSCLE_TO_CATEGORY: dict[str, str] = {
    # Chest
    "chest": "Chest",
    "pectorals": "Chest",
    "pectoralis major": "Chest",
    "pectoralis minor": "Chest",
    "serratus anterior": "Chest",

    # Back
    "back": "Back",
    "lats": "Back",
    "latissimus dorsi": "Back",
    "upper back": "Back",
    "lower back": "Back",
    "traps": "Back",
    "trapezius": "Back",
    "spine": "Back",
    "spinal erectors": "Back",
    "erector spinae": "Back",
    "rhomboids": "Back",
    "teres major": "Back",
    "infraspinatus": "Back",

    # Shoulders
    "shoulders": "Shoulders",
    "delts": "Shoulders",
    "deltoids": "Shoulders",
    "anterior deltoid": "Shoulders",
    "lateral deltoid": "Shoulders",
    "posterior deltoid": "Shoulders",
    "rotator cuff": "Shoulders",

    # Biceps
    "biceps": "Biceps",
    "biceps brachii": "Biceps",
    "brachialis": "Biceps",
    "brachioradialis": "Biceps",
    "forearms": "Biceps",
    "lower arms": "Biceps",

    # Triceps (note: AscendAPI returns "upper arms" generically — map to Biceps as default,
    # but specific tricep muscles below override it when present)
    "triceps": "Triceps",
    "triceps brachii": "Triceps",
    "upper arms": "Biceps",  # generic — when specific muscle data unavailable

    # Legs
    "legs": "Legs",
    "upper legs": "Legs",
    "lower legs": "Legs",
    "quads": "Legs",
    "quadriceps": "Legs",
    "hamstrings": "Legs",
    "glutes": "Legs",
    "gluteus maximus": "Legs",
    "gluteus medius": "Legs",
    "gluteus minimus": "Legs",
    "calves": "Legs",
    "gastrocnemius": "Legs",
    "soleus": "Legs",
    "tibialis anterior": "Legs",
    "adductors": "Legs",
    "abductors": "Legs",
    "hip flexors": "Legs",

    # Core
    "core": "Core",
    "abs": "Core",
    "abdominals": "Core",
    "rectus abdominis": "Core",
    "obliques": "Core",
    "transverse abdominis": "Core",
    "waist": "Core",

    # Cardio
    "cardio": "Cardio",
    "cardiovascular system": "Cardio",
    "heart": "Cardio",

    # Neck → Other
    "neck": "Other",
    "sternocleidomastoid": "Other",
}


def map_muscles_to_categories(
    body_part: str | None = None,
    target: str | None = None,
    secondary_muscles: Iterable[str] | None = None,
) -> list[str]:
    """
    Returns a deduplicated list of Magni categories that this exercise targets.
    Combines primary body part, target muscle, and all secondary muscles.

    Example:
        body_part="chest", target="pectorals",
        secondary=["serratus anterior", "anterior deltoid", "rectus abdominis"]
        → ["Chest", "Shoulders", "Core"]
    """
    categories: list[str] = []

    def add(value: str | None) -> None:
        if not value:
            return
        cat = MUSCLE_TO_CATEGORY.get(value.strip().lower())
        if cat and cat not in categories:
            categories.append(cat)

    add(target)         # most specific — try this first
    add(body_part)      # broad body region
    for muscle in (secondary_muscles or []):
        add(muscle)

    return categories or ["Other"]


def primary_category(
    body_part: str | None = None,
    target: str | None = None,
    secondary_muscles: Iterable[str] | None = None,
) -> str:
    """Returns the single primary category (the first in the list)."""
    cats = map_muscles_to_categories(body_part, target, secondary_muscles)
    return cats[0] if cats else "Other"


def serialize_categories(categories: list[str]) -> str:
    """JSON-serialize a category list for storage in muscle_groups column."""
    return json.dumps(categories)
