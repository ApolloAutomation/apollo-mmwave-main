"""
Config and options flow for Apollo mmWave.

The integration is UI-configurable and has a single setup step that creates
the singleton entry. On that step the administrator chooses whether to add
the Apollo mmWave dashboard and whether only administrators can see it. The
dashboard is created right there, once, and the entry records its id and url
path; nothing creates or rewrites it later. The options flow sets an optional
explicit selection of the radars it shows (empty means automatic detection)
and writes it into that recorded dashboard only.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_CREATE_DASHBOARD,
    CONF_DASHBOARD_ADMIN_ONLY,
    CONF_DASHBOARD_DEVICES,
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DASHBOARD_URL_PATH,
    DEFAULT_CREATE_DASHBOARD,
    DEFAULT_DASHBOARD_ADMIN_ONLY,
    DOMAIN,
    ENTRY_MINOR_VERSION,
)
from .frontend import (
    async_create_dashboard,
    async_dashboard_owned,
    async_set_dashboard_devices,
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


def _ownership(dashboard_id: str | None) -> dict[str, str | None]:
    """Return the entry options that record which dashboard the entry owns."""
    return {
        CONF_DASHBOARD_ID: dashboard_id,
        CONF_DASHBOARD_URL_PATH: DASHBOARD_URL_PATH if dashboard_id else None,
    }


class ApolloMmwaveConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow to create a single Apollo mmWave entry."""

    VERSION = 1
    # 2 records the dashboard the entry owns; see async_migrate_entry.
    MINOR_VERSION = ENTRY_MINOR_VERSION

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Offer the dashboard, create it if asked, and create the entry."""
        # TODO(REVIEW_REPORT.md X18): not via the manifest.  # noqa: FIX002, TD003
        # Optionally add "single_config_entry": true to manifest.json; the abort
        # reason becomes single_instance_allowed (update test_single_instance).
        # Keep the unique-id guard below for the entry's unique-id stamp.
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            dashboard_id = None
            if user_input.get(CONF_CREATE_DASHBOARD, DEFAULT_CREATE_DASHBOARD):
                # The administrator asked for it on this form, which says what
                # it creates. A failure is logged with a pointer to the
                # Community dashboards picker and never blocks the setup: the
                # entry then simply owns no dashboard.
                dashboard_id = await async_create_dashboard(
                    self.hass,
                    require_admin=bool(
                        user_input.get(
                            CONF_DASHBOARD_ADMIN_ONLY, DEFAULT_DASHBOARD_ADMIN_ONLY
                        )
                    ),
                )
            return self.async_create_entry(
                title="Apollo mmWave", data={}, options=_ownership(dashboard_id)
            )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_CREATE_DASHBOARD, default=DEFAULT_CREATE_DASHBOARD
                ): bool,
                vol.Required(
                    CONF_DASHBOARD_ADMIN_ONLY, default=DEFAULT_DASHBOARD_ADMIN_ONLY
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
    """Options flow for the device selection of the dashboard the entry owns."""

    async def async_step_init(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Prompt for the device selection, write it into our dashboard, save."""
        options = self.config_entry.options
        dashboard_id = options.get(CONF_DASHBOARD_ID)
        url_path = options.get(CONF_DASHBOARD_URL_PATH)
        errors: dict[str, str] = {}
        if user_input is not None:
            devices = list(user_input.get(CONF_DASHBOARD_DEVICES, []))
            new_options = {**options, CONF_DASHBOARD_DEVICES: devices}
            owned = await async_dashboard_owned(self.hass, dashboard_id, url_path)
            if owned is False:
                # Deleted, or taken over: it is not ours any more, so forget it.
                new_options.update(_ownership(None))
            # Only the dashboard this entry created, and only while it is
            # still our strategy; with none, the selection is just stored.
            if owned and not await async_set_dashboard_devices(
                self.hass, dashboard_id, url_path, devices
            ):
                errors["base"] = "dashboard_not_updated"
            else:
                return self.async_create_entry(title="", data=new_options)

        current_devices = options.get(CONF_DASHBOARD_DEVICES, [])
        schema = vol.Schema(
            {
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
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
