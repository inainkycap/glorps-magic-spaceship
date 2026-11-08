"""Years: years-ago and era labels, the same as the frontend's game/time.ts.

Years are astronomical-style integers like the species files: 1600 = 1600 CE, -2000 = 2000
BCE, and there is NO year 0 (1 BCE is followed by 1 CE).
"""
PRESENT_YEAR = 2026
DEEP_TIME_YEARS_AGO = 10_000  # older than this, eras read "N yrs ago" rather than a year


def years_ago(year: int) -> int:
    """2026 -> 0, 1600 -> 426, -1 (1 BCE) -> 2026, -2000 -> 4025."""
    y = -1 if year == 0 else year
    return max(0, PRESENT_YEAR - y if y >= 1 else PRESENT_YEAR - y - 1)


def _group(n: float) -> str:
    return f"{round(n):,}"


def format_years(n: float) -> str:
    """'1 yr', '270 yrs', '12,000 yrs', '2.5 million yrs', '66 million yrs'."""
    a = abs(n)
    if a < 1e6:
        return f"{_group(a)} {'yr' if round(a) == 1 else 'yrs'}"
    v, word = (a / 1e9, "billion") if a >= 1e9 else (a / 1e6, "million")
    v = round(v, 1) if v < 10 else round(v)
    v = int(v) if float(v).is_integer() else v
    return f"{v} {word} yrs"


def format_era(year: int) -> str:
    """THE era label (same as the frontend's formatEra): 'today', '1987', '900 CE',
    '1,000 BC', '12,000 yrs ago', '66 million yrs ago'."""
    ago = years_ago(year)
    if ago <= 0:
        return "today"
    if ago >= DEEP_TIME_YEARS_AGO:
        return f"{format_years(ago)} ago"
    if year >= 1000:
        return str(year)
    if year >= 1:
        return f"{year} CE"
    return f"{_group(1 if year == 0 else -year)} BC"
