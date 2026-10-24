"""
PriorityScoringService: Transparent, Deterministic, and Auditable Emergency Distress Triage.

Principles:
1. Explainable rule-based scoring based on the citizen's message and structured inputs.
2. The citizen is NOT forced to select severity. The system calculates an authoritative 0-100 priority score.
3. Strict negation handling: "water is not rising" or "no injuries" must NOT trigger danger rules.
4. Categories:
   - CRITICAL: 80 - 100
   - HIGH:     60 - 79
   - MODERATE: 30 - 59
   - LOW:       0 - 29
5. Waiting-time escalation: Unserviced incidents accrue priority over time (+5 pts / 15 mins, max +20)
   to ensure lower-priority calls are never indefinitely starved or forgotten.
6. Configurable weights dictionary allows tuning without rewriting application code.
"""

import re
from datetime import datetime, timezone
from typing import List, Tuple, Optional, Dict, Any


DEFAULT_CONFIG: Dict[str, Any] = {
    # Base score for any registered distress call
    "base_score": 20,

    # Emergency message indicators
    "threat_to_life_weight": 35,
    "medical_emergency_weight": 30,
    "stranded_evacuation_weight": 20,
    "general_assistance_weight": 10,

    # Structured context indicators
    "per_additional_person_weight": 3,
    "max_person_bonus": 15,  # Up to 5 additional people (total 6+)
    "vulnerable_people_weight": 10,
    "flood_danger_weight": 10,

    # Caps and limits
    "max_score": 100,
    "min_score": 5,

    # Category thresholds
    "critical_threshold": 80,
    "high_threshold": 60,
    "moderate_threshold": 30,

    # Waiting-time escalation
    "escalation_interval_mins": 15,
    "escalation_pts_per_interval": 5,
    "max_escalation_pts": 20,
}


# Negation words checked within preceding 3-word window
NEGATION_PATTERN = re.compile(
    r"\b(not|no|never|neither|without|none|nobody|nowhere|nothing|ain'?t|aren'?t|isn'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|can'?t|cannot|couldn'?t|won'?t|wouldn'?t)\b",
    re.IGNORECASE
)


class PriorityScoringService:
    config = DEFAULT_CONFIG

    # Keywords for Immediate Life-Threat, Trapped, Drowning, or Rapidly Rising Water (+35)
    THREAT_KEYWORDS = [
        "trapped", "submerged", "submerging", "drowning", "swept away", "washed away",
        "water rising", "rising water", "rising fast", "rising rapidly", "water is rising",
        "water entering", "on the roof", "on roof", "reaching roof", "roof", "terrace",
        "attic", "neck deep", "chest deep", "waist deep", "current is strong",
        "strong current", "flash flood", "collapse", "collapsing", "landslide",
        "mudslide", "boat capsized", "sinking"
    ]

    # Keywords for Injury, Inability to Breathe, Urgent Medical Need (+30)
    MEDICAL_KEYWORDS = [
        "injured", "injury", "bleeding", "broken bone", "fracture", "head injury",
        "unconscious", "fainted", "cannot breathe", "can't breathe", "difficulty breathing",
        "asthma", "heart attack", "chest pain", "cardiac", "stroke", "diabetic",
        "insulin", "dialysis", "oxygen", "in labor", "giving birth", "pregnant",
        "convulsion", "seizure", "snake bite", "electrocution", "electric shock"
    ]

    # Keywords for Stranded or Unable to Evacuate (+20)
    STRANDED_KEYWORDS = [
        "stranded", "marooned", "cut off", "isolated", "cannot leave", "can't leave",
        "cannot evacuate", "can't evacuate", "surrounded by water", "blocked road",
        "no way out", "roads flooded", "stuck inside", "stuck at home", "house surrounded"
    ]

    # Keywords for Explicit Safety / Welfare confirmation
    SAFE_KEYWORDS = [
        "im safe", "i am safe", "we are safe", "safe now", "safe here",
        "safe at home", "currently safe", "safe and sound", "not in danger",
        "no danger", "all safe", "i am fine", "im fine", "we are fine",
        "doing fine", "unharmed", "no emergency", "no flood"
    ]

    # Keywords for Food / Water / Supplies Requests (+10)
    SUPPLIES_KEYWORDS = [
        "hungry", "need food", "food", "drinking water", "water bottle",
        "starving", "groceries", "rations", "blanket", "blankets", "clothes", "dry clothes"
    ]

    # Keywords for General Urgent Assistance (+10)
    ASSISTANCE_KEYWORDS = [
        "help", "emergency", "urgent", "urgently", "rescue", "assist", "assistance",
        "please assist", "need assistance", "food assistance", "send boat", "send team",
        "save us", "distress", "critical"
    ]

    @classmethod
    def check_keyword_with_negation(cls, text: str, keywords: List[str]) -> bool:
        """
        Returns True if at least one keyword appears in text and is NOT preceded
        by a negation word within the immediate clause (up to 3 words, stopping at
        punctuation like comma, period, or 'but').
        """
        text_lower = text.lower()
        for kw in keywords:
            for match in re.finditer(re.escape(kw), text_lower):
                start_pos = match.start()
                # Check up to 30 characters before the match within the same clause
                preceding_snippet = text_lower[max(0, start_pos - 35):start_pos]
                # Split by clause boundaries (comma, period, semicolon, exclamation, or 'but'/'however')
                clause_parts = re.split(r"[\.,;!\?]\s*|\b(?:but|however|although)\b", preceding_snippet, flags=re.IGNORECASE)
                immediate_clause = clause_parts[-1] if clause_parts else preceding_snippet
                # If a negation word immediately precedes this keyword in the same clause, it is negated
                if NEGATION_PATTERN.search(immediate_clause):
                    continue
                # Found positive unnegated match
                return True
        return False

    @classmethod
    def calculate_priority(
        cls,
        severity: Optional[str] = None,  # Retained for signature compatibility, but NOT used as authoritative score
        people_count: int = 1,
        has_vulnerable: bool = False,
        district_id: Optional[str] = None,
        message_text: Optional[str] = None,
        category: Optional[str] = None,
        has_location: bool = True,
        flood_risk_level: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, str, List[str]]:
        """
        Calculates an authoritative 0-100 triage score with transparent, human-readable rationale explanations.
        Does NOT rely on citizen-selected severity.
        """
        cfg = config or cls.config
        score = cfg.get("base_score", 20)
        reasons: List[str] = []

        text = (message_text or "").strip()
        cat = (category or "").lower().strip()
        has_text = bool(text and len(text) > 0)

        # -----------------------------------------------------------------
        # 1. Emergency Message Danger Indicators (mutually exclusive / tiered)
        # -----------------------------------------------------------------
        # Check explicit safety statements first
        is_safe_statement = (
            (has_text and cls.check_keyword_with_negation(text, cls.SAFE_KEYWORDS)) or
            cat in ["safe", "welfare"]
        )

        has_threat = False
        has_medical = False
        has_stranded = False
        has_supplies = False

        if is_safe_statement:
            # Citizen explicitly reported safe / out of immediate danger
            has_threat = False
            # Allow detection of stranded or medical conditions if explicitly stated in other clauses
            has_medical = cls.check_keyword_with_negation(text, cls.MEDICAL_KEYWORDS) if has_text else False
            has_stranded = cls.check_keyword_with_negation(text, cls.STRANDED_KEYWORDS) if has_text else False
            has_supplies = (cls.check_keyword_with_negation(text, cls.SUPPLIES_KEYWORDS) or cat in ["supplies", "food"]) if has_text else False
            reasons.append("Citizen explicitly reported safe / no immediate life-threat")
        elif has_text:
            # Natural language text is authoritative over default wire categories
            has_threat = cls.check_keyword_with_negation(text, cls.THREAT_KEYWORDS)
            has_medical = cls.check_keyword_with_negation(text, cls.MEDICAL_KEYWORDS)
            has_stranded = cls.check_keyword_with_negation(text, cls.STRANDED_KEYWORDS)
            has_supplies = cls.check_keyword_with_negation(text, cls.SUPPLIES_KEYWORDS) or cat in ["supplies", "food"]
        else:
            # Fallback to category only when no text was provided
            has_threat = cat in ["trapped", "collapse"]
            has_medical = cat in ["injured", "medical"]
            has_stranded = cat in ["stranded", "evacuation"]
            has_supplies = cat in ["supplies", "food"]

        # Threat to Life / Trapped / Drowning / Rising Water (+35)
        if has_threat:
            pts = cfg["threat_to_life_weight"]
            score += pts
            reasons.append(f"Immediate life-threat / trapped reported: +{pts}")

        # Medical Emergency / Injury / Breathing (+30)
        if has_medical:
            pts = cfg["medical_emergency_weight"]
            score += pts
            reasons.append(f"Urgent medical emergency / injury reported: +{pts}")

        # Stranded / Unable to Evacuate (+20)
        if has_stranded:
            pts = cfg["stranded_evacuation_weight"]
            score += pts
            reasons.append(f"Stranded / unable to evacuate reported: +{pts}")

        # General Urgent Assistance or Food/Supplies (+10) — only if none of the above specific danger rules fired
        if not (has_threat or has_medical or has_stranded):
            if has_supplies or (text and cls.check_keyword_with_negation(text, cls.ASSISTANCE_KEYWORDS + cls.SUPPLIES_KEYWORDS)) or cat in ["supplies", "food"]:
                pts = cfg["general_assistance_weight"]
                score += pts
                reasons.append(f"General urgent assistance requested: +{pts}")

        # -----------------------------------------------------------------
        # 2. Structured Context Indicators
        # -----------------------------------------------------------------
        # Stranded group size: +3 per person beyond the first, up to cap
        safe_people_count = max(1, people_count or 1)
        if safe_people_count > 1 and not is_safe_statement:
            additional = safe_people_count - 1
            pts = min(cfg["max_person_bonus"], additional * cfg["per_additional_person_weight"])
            score += pts
            reasons.append(f"Stranded group: {safe_people_count} people (+{pts})")

        # Vulnerable people present (+10)
        if has_vulnerable:
            pts = cfg["vulnerable_people_weight"]
            score += pts
            reasons.append(f"Vulnerable people present: +{pts}")

        # Immediate Flood Danger Context (+10)
        # Triggered if verified flood risk warning in catchment or explicit flood danger reported (unless citizen reported safe)
        flood_keywords = [
            "flood", "flooding", "flood danger", "water entered house", "flood level rising",
            "water level rising", "rising rapidly", "flash flood", "water entering"
        ]
        is_flood_danger = (
            not is_safe_statement and (
                flood_risk_level in ["HIGH_WARNING", "EXTREME_WARNING", "RED_ALERT"] or
                cat in ["flood_danger", "flood"] or
                (has_text and cls.check_keyword_with_negation(text, flood_keywords))
            )
        )
        if is_flood_danger:
            pts = cfg["flood_danger_weight"]
            score += pts
            dist_label = f" in {district_id.replace('_', ' ').title()}" if district_id and district_id != "unspecified" else ""
            reasons.append(f"Immediate flood danger{dist_label}: +{pts}")

        # Missing Location Flag (informational audit trail, does not invent facts)
        if not has_location:
            reasons.append("GPS location unavailable: Requires manual responder radio/phone verification")

        # Bound score between 5 and 100
        final_score = max(cfg.get("min_score", 5), min(cfg.get("max_score", 100), score))
        category_level = cls.score_to_level(final_score, cfg)

        return final_score, category_level, reasons

    @classmethod
    def apply_waiting_time_escalation(
        cls,
        created_at: datetime,
        current_score: int,
        response_status: str,
        config: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, str, Optional[str]]:
        """
        Escalates unserviced incidents over time to prevent starvation.
        Adds +5 points for every 15 minutes an incident sits unassigned (capped at +20).
        """
        cfg = config or cls.config
        if response_status not in ["unassigned", "open"]:
            return current_score, cls.score_to_level(current_score, cfg), None

        now = datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        elapsed_mins = max(0, int((now - created_at).total_seconds() / 60))
        interval = cfg.get("escalation_interval_mins", 15)
        intervals = elapsed_mins // interval
        if intervals > 0:
            max_boost = 10 if current_score <= 25 else cfg.get("max_escalation_pts", 20)
            boost = min(max_boost, intervals * cfg.get("escalation_pts_per_interval", 5))
            escalated_score = min(cfg.get("max_score", 100), current_score + boost)
            note = f"Waiting time escalation: {elapsed_mins}m unserviced (+{boost} pts)"
            return escalated_score, cls.score_to_level(escalated_score, cfg), note

        return current_score, cls.score_to_level(current_score, cfg), None

    @classmethod
    def score_to_level(cls, score: int, config: Optional[Dict[str, Any]] = None) -> str:
        cfg = config or cls.config
        if score >= cfg.get("critical_threshold", 80):
            return "CRITICAL"
        elif score >= cfg.get("high_threshold", 60):
            return "HIGH"
        elif score >= cfg.get("moderate_threshold", 30):
            return "MODERATE"
        return "LOW"
