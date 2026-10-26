"""
Config and options flow for Apollo mmWave.

The integration is UI-configurable and has a single setup step that creates
the singleton entry. On that step the administrator chooses whether to add
the Apollo mmWave dashboard and whether only administrators can see it. The
dashboard is created right there, once, and the entry records its id and url
path; nothing creates or rewrites it on its own later.

The options flow is a menu of explicit actions on that recorded dashboard
only: add it when the entry owns none, remove it when it owns one, and the
optional explicit selection of the radars it shows (empty means automatic
detection). A recorded dashboard that is gone, or that the user took control
of, is forgotten rather than recreated or written to.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

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
    async_remove_dashboard,
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
    """
    Options flow: explicit administrator actions on the entry's own dashboard.

    Only the row the entry recorded is ever written to or deleted, and only
    while its config is still our strategy (``frontend._async_our_row``).
    """

    # Whether the recorded dashboard is still ours: True, False, or None when
    # the dashboards collection cannot be read. Set by the menu step.
    _owned: bool | None = None

    def _recorded(self) -> tuple[str | None, str | None]:
        options = self.config_entry.options
        return options.get(CONF_DASHBOARD_ID), options.get(CONF_DASHBOARD_URL_PATH)

    def _save(self, **changes: Any) -> config_entries.ConfigFlowResult:
        """Finish with the entry's options plus ``changes``."""
        options = dict(self.config_entry.options)
        if self._owned is False and options.get(CONF_DASHBOARD_ID):
            # Gone, or taken over: it is not ours any more, so forget it. An
            # entry with no record keeps none: one from 2.2.5 whose migration
            # could not read the dashboards yet must still adopt its old
            # dashboard at the next start.
            options.update(_ownership(None))
        options.update(changes)
        return self.async_create_entry(title="", data=options)

    async def async_step_init(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Offer the actions that fit the dashboard the entry owns, if any."""
        _ = user_input
        self._owned = await async_dashboard_owned(self.hass, *self._recorded())
        if self._owned is None:
            # Nothing is known about the dashboard, so only the selection is
            # offered, and what the entry recorded is kept.
            return await self.async_step_dashboard_devices()
        if self._owned:
            menu = ["dashboard_devices", "remove_dashboard"]
        else:
            menu = ["add_dashboard", "dashboard_devices"]
        return self.async_show_menu(step_id="init", menu_options=menu)

    async def async_step_add_dashboard(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Say what the dashboard will be, then create it once on Submit."""
        errors: dict[str, str] = {}
        if user_input is not None:
            dashboard_id = await async_create_dashboard(
                self.hass,
                require_admin=bool(
                    user_input.get(
                        CONF_DASHBOARD_ADMIN_ONLY, DEFAULT_DASHBOARD_ADMIN_ONLY
                    )
                ),
                devices=list(self.config_entry.options.get(CONF_DASHBOARD_DEVICES, [])),
            )
            if dashboard_id is not None:
                self._owned = True
                return self._save(**_ownership(dashboard_id))
            errors["base"] = "dashboard_not_created"
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_DASHBOARD_ADMIN_ONLY, default=DEFAULT_DASHBOARD_ADMIN_ONLY
                ): bool,
            }
        )
        return self.async_show_form(
            step_id="add_dashboard", data_schema=schema, errors=errors
        )

    async def async_step_remove_dashboard(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Say what will be deleted, then delete our dashboard on Submit."""
        errors: dict[str, str] = {}
        if user_input is not None:
            if await async_remove_dashboard(self.hass, *self._recorded()):
                self._owned = False
                return self._save()
            errors["base"] = "dashboard_not_removed"
        return self.async_show_form(
            step_id="remove_dashboard", data_schema=vol.Schema({}), errors=errors
        )

    async def async_step_dashboard_devices(
        self, user_input: dict | None = None
    ) -> config_entries.ConfigFlowResult:
        """Prompt for the device selection, write it into our dashboard, save."""
        errors: dict[str, str] = {}
        if user_input is not None:
            devices = list(user_input.get(CONF_DASHBOARD_DEVICES, []))
            # Only the dashboard this entry created, and only while it is
            # still our strategy; with none, the selection is just stored and
            # used if the dashboard is added here later.
            if self._owned and not await async_set_dashboard_devices(
                self.hass, *self._recorded(), devices
            ):
                errors["base"] = "dashboard_not_updated"
            else:
                return self._save(**{CONF_DASHBOARD_DEVICES: devices})

        current_devices = self.config_entry.options.get(CONF_DASHBOARD_DEVICES, [])
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
        return self.async_show_form(
            step_id="dashboard_devices", data_schema=schema, errors=errors
        )
