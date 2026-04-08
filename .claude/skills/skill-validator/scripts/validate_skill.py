#!/usr/bin/env python3
"""
Skill Validator - Validates skills against Anthropic best practices.
Based on: The Complete Guide to Building Skills for Claude (Jan 2026)
"""

import os
import re
import sys
import json
import yaml
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple


@dataclass
class ValidationResult:
    """Result of a single validation check."""
    check: str
    passed: bool
    message: str
    severity: str  # critical, high, medium, low
    score_impact: int


@dataclass
class SkillValidationReport:
    """Complete validation report for a skill."""
    skill_path: str
    skill_name: str
    score: int
    rating: str
    results: List[ValidationResult]
    suggestions: List[str]


def parse_frontmatter(content: str) -> Tuple[Optional[Dict], str]:
    """Parse YAML frontmatter from SKILL.md content."""
    if not content.startswith('---'):
        return None, content

    parts = content.split('---', 2)
    if len(parts) < 3:
        return None, content

    try:
        frontmatter = yaml.safe_load(parts[1])
        body = parts[2]
        return frontmatter, body
    except yaml.YAMLError:
        return None, content


def count_words(text: str) -> int:
    """Count words in text."""
    return len(re.findall(r'\w+', text))


def validate_structure(skill_path: Path) -> List[ValidationResult]:
    """Validate skill directory structure."""
    results = []

    # Check SKILL.md exists
    skill_md = skill_path / "SKILL.md"
    if skill_md.exists():
        results.append(ValidationResult(
            check="SKILL.md exists",
            passed=True,
            message="SKILL.md found",
            severity="critical",
            score_impact=0
        ))
    else:
        # Check for case variations
        variations = ["skill.md", "SKILL.MD", "Skill.md"]
        found_wrong = None
        for var in variations:
            if (skill_path / var).exists():
                found_wrong = var
                break

        if found_wrong:
            results.append(ValidationResult(
                check="SKILL.md exists",
                passed=False,
                message=f"Found '{found_wrong}' but must be exactly 'SKILL.md'",
                severity="critical",
                score_impact=-30
            ))
        else:
            results.append(ValidationResult(
                check="SKILL.md exists",
                passed=False,
                message="SKILL.md not found",
                severity="critical",
                score_impact=-30
            ))

    # Check folder naming
    folder_name = skill_path.name
    if re.match(r'^[a-z0-9-]+$', folder_name):
        results.append(ValidationResult(
            check="Folder naming",
            passed=True,
            message=f"Folder '{folder_name}' uses kebab-case",
            severity="high",
            score_impact=0
        ))
    else:
        results.append(ValidationResult(
            check="Folder naming",
            passed=False,
            message=f"Folder '{folder_name}' should be kebab-case (lowercase, hyphens only)",
            severity="high",
            score_impact=-10
        ))

    # Check for README.md (should not exist inside skill folder)
    readme = skill_path / "README.md"
    if readme.exists():
        results.append(ValidationResult(
            check="No README.md",
            passed=False,
            message="README.md should not be inside skill folder (move to repo root)",
            severity="medium",
            score_impact=-5
        ))
    else:
        results.append(ValidationResult(
            check="No README.md",
            passed=True,
            message="No README.md inside skill folder",
            severity="medium",
            score_impact=0
        ))

    return results


def validate_frontmatter(frontmatter: Optional[Dict]) -> List[ValidationResult]:
    """Validate YAML frontmatter."""
    results = []

    if frontmatter is None:
        results.append(ValidationResult(
            check="Frontmatter exists",
            passed=False,
            message="No valid YAML frontmatter found",
            severity="critical",
            score_impact=-30
        ))
        return results

    results.append(ValidationResult(
        check="Frontmatter exists",
        passed=True,
        message="Valid YAML frontmatter found",
        severity="critical",
        score_impact=0
    ))

    # Check name field
    name = frontmatter.get('name', '')
    if not name:
        results.append(ValidationResult(
            check="Name field",
            passed=False,
            message="'name' field is required",
            severity="critical",
            score_impact=-20
        ))
    elif not re.match(r'^[a-z0-9-]+$', name):
        results.append(ValidationResult(
            check="Name field",
            passed=False,
            message=f"'name' must be kebab-case: '{name}'",
            severity="high",
            score_impact=-10
        ))
    elif 'claude' in name.lower() or 'anthropic' in name.lower():
        results.append(ValidationResult(
            check="Name field",
            passed=False,
            message="'name' cannot contain 'claude' or 'anthropic' (reserved)",
            severity="critical",
            score_impact=-20
        ))
    else:
        results.append(ValidationResult(
            check="Name field",
            passed=True,
            message=f"Name '{name}' is valid",
            severity="critical",
            score_impact=0
        ))

    # Check description field
    description = frontmatter.get('description', '')
    if not description:
        results.append(ValidationResult(
            check="Description field",
            passed=False,
            message="'description' field is required",
            severity="critical",
            score_impact=-20
        ))
    elif len(description) > 1024:
        results.append(ValidationResult(
            check="Description field",
            passed=False,
            message=f"Description too long: {len(description)} chars (max 1024)",
            severity="high",
            score_impact=-10
        ))
    elif '<' in description or '>' in description:
        results.append(ValidationResult(
            check="Description field",
            passed=False,
            message="Description contains XML tags (< or >) - not allowed",
            severity="critical",
            score_impact=-20
        ))
    else:
        results.append(ValidationResult(
            check="Description field",
            passed=True,
            message="Description field is valid",
            severity="critical",
            score_impact=0
        ))

    return results


def validate_description_quality(description: str) -> List[ValidationResult]:
    """Validate description quality (triggers, clarity)."""
    results = []

    # Check for trigger phrases
    trigger_patterns = [
        r'use when',
        r'trigger',
        r'を使用',
        r'の場合',
        r'says?["\']',
    ]
    has_triggers = any(re.search(p, description.lower()) for p in trigger_patterns)

    if has_triggers:
        results.append(ValidationResult(
            check="Trigger phrases",
            passed=True,
            message="Description includes trigger conditions",
            severity="high",
            score_impact=0
        ))
    else:
        results.append(ValidationResult(
            check="Trigger phrases",
            passed=False,
            message="Add 'Use when...' trigger phrases to description",
            severity="high",
            score_impact=-15
        ))

    # Check for negative triggers (optional but recommended)
    negative_patterns = [
        r'do not use',
        r'don\'t use',
        r'not for',
        r'使用しない',
    ]
    has_negative = any(re.search(p, description.lower()) for p in negative_patterns)

    if has_negative:
        results.append(ValidationResult(
            check="Negative triggers",
            passed=True,
            message="Description includes negative triggers (excellent)",
            severity="low",
            score_impact=5  # Bonus points
        ))
    else:
        results.append(ValidationResult(
            check="Negative triggers",
            passed=False,
            message="Consider adding 'Do NOT use for...' to prevent over-triggering",
            severity="low",
            score_impact=0
        ))

    return results


def validate_content(body: str, skill_path: Path) -> List[ValidationResult]:
    """Validate SKILL.md content."""
    results = []

    word_count = count_words(body)

    # Check word count
    if word_count <= 5000:
        results.append(ValidationResult(
            check="Content length",
            passed=True,
            message=f"Content is {word_count} words (under 5000 limit)",
            severity="medium",
            score_impact=0
        ))
    else:
        # Check if references/ exists
        refs_dir = skill_path / "references"
        if refs_dir.exists() and any(refs_dir.iterdir()):
            results.append(ValidationResult(
                check="Content length",
                passed=True,
                message=f"Content is {word_count} words but using references/ for overflow",
                severity="medium",
                score_impact=0
            ))
        else:
            results.append(ValidationResult(
                check="Content length",
                passed=False,
                message=f"Content is {word_count} words (over 5000). Move details to references/",
                severity="medium",
                score_impact=-10
            ))

    # Check for code examples
    if '```' in body:
        results.append(ValidationResult(
            check="Code examples",
            passed=True,
            message="Contains code examples",
            severity="medium",
            score_impact=0
        ))
    else:
        results.append(ValidationResult(
            check="Code examples",
            passed=False,
            message="Consider adding code examples for key operations",
            severity="medium",
            score_impact=-5
        ))

    # Check for troubleshooting section
    troubleshoot_patterns = [
        r'troubleshoot',
        r'common issues',
        r'エラー',
        r'問題',
        r'error handling',
    ]
    has_troubleshoot = any(re.search(p, body.lower()) for p in troubleshoot_patterns)

    if has_troubleshoot:
        results.append(ValidationResult(
            check="Troubleshooting",
            passed=True,
            message="Contains troubleshooting/error handling section",
            severity="low",
            score_impact=0
        ))
    else:
        results.append(ValidationResult(
            check="Troubleshooting",
            passed=False,
            message="Consider adding troubleshooting section for common issues",
            severity="low",
            score_impact=-3
        ))

    return results


def validate_skill(skill_path: str) -> SkillValidationReport:
    """Validate a skill and return a comprehensive report."""
    path = Path(skill_path)

    all_results = []

    # Structure validation
    all_results.extend(validate_structure(path))

    # Read SKILL.md if exists
    skill_md = path / "SKILL.md"
    if skill_md.exists():
        content = skill_md.read_text(encoding='utf-8')
        frontmatter, body = parse_frontmatter(content)

        # Frontmatter validation
        all_results.extend(validate_frontmatter(frontmatter))

        # Description quality
        if frontmatter and frontmatter.get('description'):
            all_results.extend(validate_description_quality(frontmatter['description']))

        # Content validation
        all_results.extend(validate_content(body, path))

        skill_name = frontmatter.get('name', path.name) if frontmatter else path.name
    else:
        skill_name = path.name

    # Calculate score
    base_score = 100
    for result in all_results:
        base_score += result.score_impact

    score = max(0, min(100, base_score))

    # Determine rating
    if score >= 90:
        rating = "Excellent"
    elif score >= 80:
        rating = "Good"
    elif score >= 70:
        rating = "Fair"
    elif score >= 60:
        rating = "Poor"
    else:
        rating = "Critical"

    # Generate suggestions
    suggestions = []
    for result in all_results:
        if not result.passed:
            suggestions.append(f"[{result.severity.upper()}] {result.message}")

    return SkillValidationReport(
        skill_path=str(path),
        skill_name=skill_name,
        score=score,
        rating=rating,
        results=all_results,
        suggestions=suggestions
    )


def print_report(report: SkillValidationReport):
    """Print validation report."""
    print(f"\n{'='*60}")
    print(f"Skill Validation Report: {report.skill_name}")
    print(f"{'='*60}")
    print(f"Path: {report.skill_path}")
    print(f"Score: {report.score}/100 ({report.rating})")
    print(f"{'='*60}")

    print("\nChecks:")
    for result in report.results:
        status = "✓" if result.passed else "✗"
        print(f"  {status} {result.check}: {result.message}")

    if report.suggestions:
        print(f"\nSuggestions for Improvement:")
        for i, suggestion in enumerate(report.suggestions, 1):
            print(f"  {i}. {suggestion}")

    print(f"\n{'='*60}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_skill.py <skill-path> [--json]")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_json = "--json" in sys.argv

    report = validate_skill(skill_path)

    if output_json:
        output = {
            "skill_path": report.skill_path,
            "skill_name": report.skill_name,
            "score": report.score,
            "rating": report.rating,
            "suggestions": report.suggestions,
            "checks": [
                {
                    "check": r.check,
                    "passed": r.passed,
                    "message": r.message,
                    "severity": r.severity
                }
                for r in report.results
            ]
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print_report(report)

    # Exit with non-zero if score < 70
    if report.score < 70:
        sys.exit(1)


if __name__ == "__main__":
    main()
