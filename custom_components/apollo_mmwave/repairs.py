"""
Repairs for Apollo mmWave.

One repair is fixable here: the dashboard this integration created is a saved
copy (someone took control of it), so it misses every card added since. It is
raised and cleared by ``frontend.async_check_saved_copy``, which only reads.
The fix is a confirmation step, and nothing is written until the
administrator submits it; the options flow offers the same restore
(``frontend.async_restore_saved_copy``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import voluptuous as vol
from homeassistant.components.repairs import ConfirmRepairFlow, RepairsFlow

from .const import ISSUE_DASHBOARD_SAVED_COPY
from .frontend import (
    DashboardState,
    RestoreResult,
    async_check_saved_copy,
    async_dashboard_state,
    async_restore_saved_copy,
    recorded_dashboard,
)

if TYPE_CHECKING:
    from homeassistant.components.repairs import RepairsFlowResult
    from homeassistant.core import HomeAssistant


class SavedCopyRepairFlow(RepairsFlow):
    """Restore the automatic dashboard, keeping the saved copy beside it."""

    def __init__(self, entry_id: str | None) -> None:
        """Remember which entry's dashboard the repair is about."""
        self._entry_id = entry_id

    async def async_step_init(
        self, user_input: dict[str, str] | None = None
    ) -> RepairsFlowResult:
        """Start at the confirmation."""
        _ = user_input
        return await self.async_step_confirm()

    async def async_step_confirm(
        self, user_input: dict[str, str] | None = None
    ) -> RepairsFlowResult:
        """Say what Restore does, then restore on Submit."""
        entry = (
            self.hass.config_entries.async_get_entry(self._entry_id)
            if self._entry_id
            else None
        )
        if entry is None:
            # The entry went, and with it the record of which dashboard is ours.
            return self.async_abort(reason=RestoreResult.NOT_A_SAVED_COPY.value)
        if user_input is None:
            state = await async_dashboard_state(self.hass, *recorded_dashboard(entry))
            if state is not None and state is not DashboardState.SAVED_COPY:
                # Fixed some other way since it was raised.
                await async_check_saved_copy(self.hass, entry)
                return self.async_abort(reason=RestoreResult.NOT_A_SAVED_COPY.value)
            return self.async_show_form(step_id="confirm", data_schema=vol.Schema({}))
        result = await async_restore_saved_copy(self.hass, entry)
        if result is RestoreResult.RESTORED:
            return self.async_create_entry(data={})
        # An abort keeps the repair, so the administrator can try again; the
        # reason says what was and was not changed.
        return self.async_abort(reason=result.value)


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict[str, str | int | float | None] | None,
) -> RepairsFlow:
    """Return the fix flow for a repair this integration raised."""
    _ = hass
    if issue_id == ISSUE_DASHBOARD_SAVED_COPY:
        entry_id = (data or {}).get("entry_id")
        return SavedCopyRepairFlow(entry_id if isinstance(entry_id, str) else None)
    return ConfirmRepairFlow()
