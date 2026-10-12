"""
Config and options flow for Apollo mmWave.

The integration is UI-configurable and has a single setup step that just
creates the singleton entry. The options flow exposes the toggle for the
auto-created dashboard and an optional explicit selection of the radars it
shows (empty means automatic detection).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DEFAULT_AUTO_CREATE_VIEW,
    DOMAIN,
)

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry

# The device selector matches `model` exactly, and each firmware image carries
# its own project name (`MSR-2_BLE`, `MSR-2_Factory`), so every variant has to
# be listed. The MTR-1 images all report `MTR-1`. Keep this in step with
# `APOLLO_MODELS` in frontend-src/src/profiles.ts, which detects the same
# hardware by lower-cased model prefix (`msr-1`, `r-pro-1`, ...): a variant
# missing here is auto-detected on the dashboard but cannot be picked in the
# options flow. tests/test_config_flow.py checks both directions.
MMWAVE_MODELS = (
    "MSR-1",
    "MSR-1_BLE",
    "MSR-1_Factory",
    "MSR-2",
    "MSR-2_BLE",
    "MSR-2_Factory",
    "MTR-1",
    "R-PRO-1-W",
    "R-PRO-1-ETH",
)


class ApolloMmwaveConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow to create a single Apollo mmWave entry."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Ask about the auto-dashboard and create the entry when submitted."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title="Apollo mmWave",
                data={},
                options={
                    CONF_AUTO_CREATE_VIEW: user_input.get(
                        CONF_AUTO_CREATE_VIEW, DEFAULT_AUTO_CREATE_VIEW
                    ),
                },
            )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_AUTO_CREATE_VIEW, default=DEFAULT_AUTO_CREATE_VIEW
                ): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,  # noqa: ARG004 - signature fixed by HA
    ) -> ApolloMmwaveOptionsFlow:
        """Return the options flow; the base class resolves its config_entry."""
        return ApolloMmwaveOptionsFlow()


class ApolloMmwaveOptionsFlow(config_entries.OptionsFlow):
    """Options flow for the auto-created dashboard toggle and device selection."""

    async def async_step_init(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Prompt for the dashboard toggle and device selection, and save."""
        if user_input is not None:
            user_input.setdefault(CONF_DASHBOARD_DEVICES, [])
            return self.async_create_entry(title="", data=user_input)

        current_auto = self.config_entry.options.get(
            CONF_AUTO_CREATE_VIEW, DEFAULT_AUTO_CREATE_VIEW
        )
        current_devices = self.config_entry.options.get(CONF_DASHBOARD_DEVICES, [])
        schema = vol.Schema(
            {
                vol.Required(CONF_AUTO_CREATE_VIEW, default=current_auto): bool,
                vol.Optional(
                    CONF_DASHBOARD_DEVICES,
                    default=list(current_devices),
                ): selector.DeviceSelector(
                    selector.DeviceSelectorConfig(
                        multiple=True,
                        # Entries OR together: only Apollo's mmWave-capable
                        # models, not every ApolloAutomation device (AIR-1,
                        # TEMP-1, …). Model strings come from the ESPHome
                        # project name (`ApolloAutomation.<MODEL>`); extend
                        # when new mmWave hardware ships. Pinned to the
                        # esphome integration: a network integration (UniFi,
                        # say) that tracks the same hardware by MAC otherwise
                        # gets the radar listed under its own name too.
                        filter=[
                            selector.DeviceFilterSelectorConfig(
                                integration="esphome",
                                manufacturer="ApolloAutomation",
                                model=model,
                            )
                            for model in MMWAVE_MODELS
                        ],
                    )
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
