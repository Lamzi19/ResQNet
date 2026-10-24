import pytest
from datetime import datetime, timedelta, timezone
from backend.app.services.priority_scoring_service import PriorityScoringService, DEFAULT_CONFIG


def test_immediate_threat_scoring():
    """Explicit threat to life, trapped, drowning, or rapidly rising water awards +35."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="Water rising fast and we are trapped on the roof",
        district_id="ernakulam"
    )
    # Base 20 + Threat 35 = 55 (Moderate)
    assert score == 55
    assert level == "MODERATE"
    assert any("Immediate life-threat / trapped reported: +35" in r for r in reasons)


def test_combined_critical_emergency():
    """Combined trapped, medical emergency, group size, and vulnerable flags reach Critical (>= 80)."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=4,
        has_vulnerable=True,
        message_text="Trapped on terrace, elderly grandfather having chest pain and difficulty breathing",
        district_id="wayanad",
        flood_risk_level="HIGH_WARNING"
    )
    # Base 20 + Threat 35 + Medical 30 + Group 9 (3*3) + Vulnerable 10 + Flood 10 = 114 -> capped at 100
    assert score == 100
    assert level == "CRITICAL"
    assert any("Immediate life-threat" in r for r in reasons)
    assert any("medical emergency" in r.lower() for r in reasons)
    assert any("Vulnerable people present: +10" in r for r in reasons)
    assert any("Stranded group: 4 people (+9)" in r for r in reasons)


def test_negation_handling_water_not_rising():
    """'Water is not rising' must NOT trigger the rising water (+35) rule."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="Water is not rising anymore, but we need food assistance",
        district_id="alappuzha"
    )
    # Should NOT trigger threat (+35)
    assert not any("Immediate life-threat" in r for r in reasons)
    # Should trigger general assistance (+10)
    assert any("General urgent assistance requested: +10" in r for r in reasons)
    assert score == 30  # Base 20 + Assistance 10
    assert level == "MODERATE"


def test_negation_handling_no_injuries():
    """'No injuries' must NOT trigger the medical emergency (+30) rule."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="We are safe and have no injuries, but house is surrounded by water",
        district_id="kottayam"
    )
    # Must NOT trigger medical emergency (+30)
    assert not any("medical emergency" in r.lower() for r in reasons)
    # Triggers stranded (+20)
    assert any("Stranded / unable to evacuate" in r for r in reasons)
    assert score == 40  # Base 20 + Stranded 20
    assert level == "MODERATE"


def test_negation_handling_not_trapped():
    """'Not trapped' must NOT trigger trapped (+35)."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="We are not trapped inside, standing on high ground",
        district_id="thrissur"
    )
    assert not any("Immediate life-threat" in r for r in reasons)


def test_stranded_evacuation_scoring():
    """Explicitly stranded or cut off awards +20."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="Roads are completely flooded and we are cut off from town",
        district_id="idukki"
    )
    # Base 20 + Stranded 20 + Flood 10 = 50 (Moderate)
    assert score == 50
    assert level == "MODERATE"
    assert any("Stranded / unable to evacuate reported: +20" in r for r in reasons)
    assert any("Immediate flood danger" in r for r in reasons)


def test_general_assistance_does_not_double_count_with_specific_threat():
    """General assistance (+10) is only applied if no specific higher danger rules triggered."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="Emergency help needed! We are trapped in rising water!",
        district_id="ernakulam"
    )
    # Triggers threat (+35). Must NOT also add general assistance (+10).
    assert any("Immediate life-threat / trapped reported: +35" in r for r in reasons)
    assert not any("General urgent assistance requested" in r for r in reasons)


def test_group_size_scaling_and_cap():
    """Each additional person beyond the first adds +3, capped at +15 (total 6+ people)."""
    # 3 people -> 2 additional -> +6 pts
    score_3, _, reasons_3 = PriorityScoringService.calculate_priority(
        people_count=3,
        has_vulnerable=False,
        message_text="Stranded at home"
    )
    assert any("Stranded group: 3 people (+6)" in r for r in reasons_3)

    # 10 people -> 9 additional -> capped at +15 pts
    score_10, _, reasons_10 = PriorityScoringService.calculate_priority(
        people_count=10,
        has_vulnerable=False,
        message_text="Stranded at home"
    )
    assert any("Stranded group: 10 people (+15)" in r for r in reasons_10)


def test_missing_data_safe_handling():
    """Null, empty, or missing inputs are handled safely without errors or false hazards."""
    # Completely empty message
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=0,  # Sanitized to 1
        has_vulnerable=False,
        message_text=None,
        has_location=False
    )
    assert score == 20  # Base 20
    assert level == "LOW"
    assert any("GPS location unavailable" in r for r in reasons)


def test_category_thresholds():
    """Verifies category boundaries: Low (0-29), Moderate (30-59), High (60-79), Critical (80-100)."""
    assert PriorityScoringService.score_to_level(15) == "LOW"
    assert PriorityScoringService.score_to_level(29) == "LOW"
    assert PriorityScoringService.score_to_level(30) == "MODERATE"
    assert PriorityScoringService.score_to_level(59) == "MODERATE"
    assert PriorityScoringService.score_to_level(60) == "HIGH"
    assert PriorityScoringService.score_to_level(79) == "HIGH"
    assert PriorityScoringService.score_to_level(80) == "CRITICAL"
    assert PriorityScoringService.score_to_level(100) == "CRITICAL"


def test_waiting_time_escalation():
    """Waiting time escalation adds +5 points per 15 minutes unserviced (capped at +20)."""
    # 35 minutes ago, unassigned
    created_at = datetime.now(timezone.utc) - timedelta(minutes=35)
    initial_score = 50
    escalated_score, new_level, note = PriorityScoringService.apply_waiting_time_escalation(
        created_at=created_at,
        current_score=initial_score,
        response_status="unassigned"
    )
    # 35 mins // 15 = 2 intervals -> +10 pts
    assert escalated_score == 60
    assert new_level == "HIGH"
    assert note is not None
    assert "+10 pts" in note

    # Rescued status should not escalate
    rescued_score, _, no_note = PriorityScoringService.apply_waiting_time_escalation(
        created_at=created_at,
        current_score=initial_score,
        response_status="rescued"
    )
    assert rescued_score == initial_score
    assert no_note is None


def test_explicit_safe_statement_im_hungry_but_im_safe():
    """Citizen reporting 'im hungry but im safe' must be categorized as MODERATE/LOW and NEVER CRITICAL."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="im hungry but im safe",
        district_id="ernakulam"
    )
    # Base 20 + Assistance/Supplies 10 = 30 (Moderate)
    assert score == 30
    assert level == "MODERATE"
    assert any("safe" in r.lower() for r in reasons)
    assert not any("Immediate life-threat" in r for r in reasons)
    assert not any("medical emergency" in r.lower() for r in reasons)
    assert not any("Stranded / unable to evacuate" in r for r in reasons)


def test_pure_safe_welfare_checkin():
    """Citizen reporting 'I am safe' with no needs must be categorized as LOW (score 20)."""
    score, level, reasons = PriorityScoringService.calculate_priority(
        people_count=1,
        has_vulnerable=False,
        message_text="I am safe at home, power is fine",
        district_id="alappuzha"
    )
    assert score == 20
    assert level == "LOW"
    assert any("safe" in r.lower() for r in reasons)
    assert not any("Immediate life-threat" in r for r in reasons)


def test_safe_welfare_waiting_time_escalation_capped():
    """Welfare/safe check-ins (score <= 25) must not escalate into Critical even after hours."""
    created_at = datetime.now(timezone.utc) - timedelta(hours=3)
    escalated_score, new_level, _ = PriorityScoringService.apply_waiting_time_escalation(
        created_at=created_at,
        current_score=20,
        response_status="unassigned"
    )
    # Capped at +10 for low-priority / safe incidents: 20 + 10 = 30 (MODERATE), never HIGH or CRITICAL
    assert escalated_score <= 30
    assert new_level in ["LOW", "MODERATE"]
    assert new_level != "CRITICAL"

