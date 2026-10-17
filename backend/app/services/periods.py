from datetime import date


def month_bounds(month: str) -> tuple[date, date]:
    """'2026-10' -> (2026-10-01, 2026-11-01): intervalo [início, fim)."""
    year, mon = (int(p) for p in month.split("-"))
    start = date(year, mon, 1)
    return start, add_months(start, 1)


def add_months(d: date, months: int) -> date:
    """Soma meses a uma data que é dia 1."""
    total = d.year * 12 + (d.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"
