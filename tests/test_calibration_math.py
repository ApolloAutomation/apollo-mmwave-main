"""The pure threshold arithmetic behind the empty-room calibration."""

from __future__ import annotations

import pytest

from custom_components.apollo_mmwave import calibration, calibration_math
from custom_components.apollo_mmwave.calibration_math import (
    Bounds,
    ChannelResult,
    ChannelSamples,
    Margins,
    compute_channel,
    nearest_rank_percentile,
)

DEFAULT_MARGINS = Margins(absolute=10, percent=25)


def _compute(
    ticks: list[float],
    *,
    event_peak: float | None = None,
    bounds: Bounds | None = None,
    margins: Margins = DEFAULT_MARGINS,
    old: float | None = 50.0,
) -> ChannelResult:
    return compute_channel(
        ChannelSamples(ticks=tuple(ticks), event_peak=event_peak),
        old,
        bounds or Bounds(),
        margins,
    )


def test_compute_channel_peak_plus_absolute_margin() -> None:
    """A quiet gate gets the peak plus the absolute headroom."""
    result = _compute([10, 12, 30, 12, 10])

    assert result.peak == 30
    assert result.new == 40
    assert result.samples == 5
    assert result.old == 50.0
    assert result.flags == ()


def test_compute_channel_relative_margin_wins() -> None:
    """Above 40 points the percentage headroom is the larger one."""
    assert _compute([60] * 5).new == 75


def test_compute_channel_clamps_and_flags_off() -> None:
    """A proposal past the top of the range is clamped and flagged off."""
    result = _compute([95] * 5)

    assert result.new == 100
    assert "off" in result.flags


def test_compute_channel_rounds_up_to_step() -> None:
    """The proposal is rounded up to the entity's step, never down."""
    result = _compute([31] * 5, bounds=Bounds(0, 100, 5))

    assert result.new == 45


def test_compute_channel_flags_spike_but_uses_peak() -> None:
    """One outlier flags a spike, and the threshold still comes from the peak."""
    result = _compute([3] * 29 + [70])

    assert result.peak == 70
    assert result.p95 == 3
    assert result.new == 88
    assert "spike" in result.flags


def test_compute_channel_event_peak_raises_peak_but_not_count() -> None:
    """A value caught between ticks raises the peak without counting as a sample."""
    result = _compute([10] * 5, event_peak=30)

    assert result.peak == 30
    assert result.new == 40
    assert result.samples == 5


def test_compute_channel_no_data_below_min_samples() -> None:
    """Too few ticks is no data, whatever the event listener saw."""
    result = _compute([10, 12, 30, 12], event_peak=90)

    assert result.new is None
    assert result.peak is None
    assert result.flags == ("no_data",)
    assert result.samples == 4


def test_compute_channel_ignores_non_numeric_samples() -> None:
    """The caller filters, but a stray NaN must not poison the maths."""
    result = _compute([10, float("nan"), 12, 30, 12, 10])

    assert result.samples == 5
    assert result.new == 40


def test_compute_channel_honours_patched_min_samples(monkeypatch) -> None:
    """Tests can lower MIN_SAMPLES on the module instead of passing it."""
    monkeypatch.setattr(calibration_math, "MIN_SAMPLES", 2)

    assert _compute([10, 12]).new == 22


@pytest.mark.parametrize(
    "name", ["MIN_SAMPLES", "SPIKE_ABS", "SPIKE_RATIO", "MAX_SNAPSHOTS"]
)
def test_relocated_constants_cannot_be_patched_on_calibration(
    monkeypatch, name
) -> None:
    """A patch on a copy in `calibration` would do nothing, so it fails loudly."""
    assert not hasattr(calibration, name)
    with pytest.raises(AttributeError):
        monkeypatch.setattr(calibration, name, 1)


def test_compute_channel_clamps_to_lower_bound() -> None:
    """A range starting above the proposal clamps it up to the floor."""
    result = _compute([0] * 5, bounds=Bounds(20, 100, 1))

    assert result.new == 20


def test_compute_channel_both_margins_zero_returns_the_peak() -> None:
    """With no headroom the proposal equals the peak (the service refuses this)."""
    assert _compute([12] * 5, margins=Margins(0, 0)).new == 12


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ([1, 2, 3, 4, 5], 5),
        ([3] * 29 + [70], 3),
        ([7], 7),
    ],
)
def test_nearest_rank_percentile(values, expected) -> None:
    """The 95th percentile is the nearest-rank value, never interpolated."""
    assert nearest_rank_percentile(values, 0.95) == expected
