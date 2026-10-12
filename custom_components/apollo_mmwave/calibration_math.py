"""
Pure arithmetic for the empty-room gate calibration.

Nothing in this module touches Home Assistant. ``compute_channel`` turns one
gate channel's samples into a proposed threshold, and the small dataclasses
around it are the shapes ``calibration.py`` feeds in and reads back. Keeping
the maths here means it can be unit-tested with plain tuples of numbers.

Why the maximum, not a percentile: the chip compares every internal frame
(roughly ten per second) against the threshold, while Home Assistant sees a
throttled, deduplicated subsample of about one value per second plus whatever
the state-change listener catches between ticks. The observed maximum already
under-estimates the true empty-room peak, so a percentile would discard
exactly the spikes that cause false triggers. The headroom is two-part: an
absolute number of points covers integer quantisation and unseen inter-frame
jitter on quiet far gates, a relative percentage scales with level because
fluctuation grows with the signal. The 95th percentile is still computed, but
only to flag a spike, never to set the threshold.

SPEC NOTE: the spec places ``compute_channel``, its dataclasses and the
``MIN_SAMPLES``, ``SPIKE_ABS`` and ``SPIKE_RATIO`` constants in
``calibration.py`` (and ``Bounds`` in ``gates.py``). They live here so the
threshold arithmetic has its own module and direct unit tests.
``calibration.py`` and ``gates.py`` re-export the function and the
dataclasses, but not the three constants: ``compute_channel`` reads them from
this module, so tests patch ``calibration_math.MIN_SAMPLES`` (and the two
spike constants) here, and a patch on ``calibration`` fails loudly instead of
doing nothing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Fewer tick samples than this and the gate is reported "no data".
MIN_SAMPLES = 5
# Informational "spike seen" flag: the peak is both this many points above the
# 95th percentile and this many times it.
SPIKE_ABS = 25
SPIKE_RATIO = 2.0

FLAG_OFF = "off"
FLAG_SPIKE = "spike"
FLAG_NO_DATA = "no_data"
FLAG_UNUSED = "unused"
FLAG_SKIPPED = "skipped"

_PERCENT = 100.0
_P95 = 0.95


@dataclass(frozen=True)
class Bounds:
    """A number entity's range and step (both chips expose 0..100 step 1)."""

    lo: float = 0.0
    hi: float = 100.0
    step: float = 1.0


@dataclass(frozen=True)
class Margins:
    """Headroom above the observed peak: absolute points and percent of peak."""

    absolute: int
    percent: int


@dataclass(frozen=True)
class ChannelSamples:
    """
    What one gate channel produced during the listen.

    ``ticks`` are the per-tick numeric reads, in order; its length is the
    reported sample count. ``event_peak`` is the largest value the state-change
    listener saw between ticks, or None; it raises the peak but is never
    counted as a sample.
    """

    ticks: tuple[float, ...]
    event_peak: float | None


@dataclass(frozen=True)
class ChannelResult:
    """
    The outcome of ``compute_channel`` for one gate channel.

    ``samples`` is the number of tick samples (event values are never counted).
    ``flags`` is a subset of ``off``, ``spike`` and ``no_data`` here; the
    caller adds ``unused`` and ``skipped``.
    """

    peak: int | None
    p95: int | None
    old: float | None
    new: int | None
    samples: int
    flags: tuple[str, ...]
    skipped: str | None


def nearest_rank_percentile(values: list[float], fraction: float) -> float:
    """Return the nearest-rank percentile of a non-empty list."""
    ordered = sorted(values)
    rank = max(1, math.ceil(fraction * len(ordered)))
    return ordered[rank - 1]


def _as_int(value: float) -> int:
    """Collapse an integral float to int, rounding anything else up."""
    return int(value) if float(value).is_integer() else math.ceil(value)


def compute_channel(
    samples: ChannelSamples, old: float | None, bounds: Bounds, margins: Margins
) -> ChannelResult:
    """
    Propose one channel's threshold from its samples.

    Rules, in order: too few finite tick samples is ``no_data``; the peak is
    the ceiling of the largest tick or event value; the proposal is the peak
    plus the larger of the two margins, rounded up to the next step and
    clamped to the entity's range; a proposal at the top of the range is
    flagged ``off``; a tick maximum far above the 95th percentile is flagged
    ``spike`` (informational, the peak still sets the threshold).
    """
    ticks = [value for value in samples.ticks if math.isfinite(value)]
    count = len(ticks)
    if count < MIN_SAMPLES:
        return ChannelResult(
            peak=None,
            p95=None,
            old=old,
            new=None,
            samples=count,
            flags=(FLAG_NO_DATA,),
            skipped=None,
        )

    tick_max = max(ticks)
    peak_value = tick_max
    if samples.event_peak is not None and math.isfinite(samples.event_peak):
        peak_value = max(peak_value, samples.event_peak)
    peak = math.ceil(peak_value)
    p95_value = nearest_rank_percentile(ticks, _P95)
    p95 = math.ceil(p95_value)

    step = bounds.step if bounds.step > 0 else 1.0
    raw = peak + max(margins.absolute, peak * margins.percent / _PERCENT)
    stepped = math.ceil(raw / step) * step
    clamped = min(max(stepped, bounds.lo), bounds.hi)
    new = _as_int(clamped)

    flags: list[str] = []
    if new >= bounds.hi:
        flags.append(FLAG_OFF)
    if tick_max >= p95_value + SPIKE_ABS and tick_max >= SPIKE_RATIO * p95_value:
        flags.append(FLAG_SPIKE)

    return ChannelResult(
        peak=peak,
        p95=p95,
        old=old,
        new=new,
        samples=count,
        flags=tuple(flags),
        skipped=None,
    )
