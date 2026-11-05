"""
The saved-copy repair: a dashboard someone took control of, and its restore.

"Take control" turns our strategy dashboard into stored views, which keep the
cards of the release they were saved under. The integration only reads to
notice that, and raises a fixable repair. Its fix keeps the copy as a
dashboard of its own before it writes the strategy back, and nothing is
written until the administrator submits it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.components.frontend import DATA_PANELS
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.dashboard import LovelaceStorage, LovelaceYAML
from homeassistant.components.repairs import repairs_flow_manager
from homeassistant.config_entries import ConfigEntryState
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component

import custom_components.apollo_mmwave as integration
from custom_components.apollo_mmwave import frontend as apollo_frontend
from custom_components.apollo_mmwave.const import (
    CONF_DASHBOARD_DEVICES,
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DOMAIN,
    ISSUE_DASHBOARD_SAVED_COPY,
    SAVED_COPY_TITLE,
    SAVED_COPY_URL_PATH,
)
from custom_components.apollo_mmwave.frontend import (
    RestoreResult,
    _dashboards_collection,
    _is_saved_copy,
    async_check_saved_copy,
)

from .conftest import (
    USER_DASHBOARD_PATH,
    apollo_warnings,
    async_dashboard_config,
    async_owned_entry,
    async_user_dashboard,
    make_entry,
    record_dashboard_writes,
    rows_on_url_path,
    setup_integration,
)

if TYPE_CHECKING:
    from pytest_homeassistant_custom_component.common import MockConfigEntry

EN_JSON = Path(integration.__file__).parent / "translations" / "en.json"

OUR_CONFIG: dict[str, Any] = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}

# What "take control" saves from the strategy: views made of our cards.
SAVED_COPY: dict[str, Any] = {
    "title": "Apollo Radar Tuning",
    "views": [
        {
            "title": "Office",
            "path": "office",
            "type": "sections",
            "sections": [
                {
                    "type": "grid",
                    "cards": [
                        {"type": "heading", "heading": "Office"},
                        {
                            "type": "custom:apollo-radar-zone-map-card",
                            "device_id": "abc123",
                        },
                    ],
                }
            ],
        }
    ],
}

# Views that name none of our cards: the user's own dashboard now.
USERS_OWN_VIEWS: dict[str, Any] = {
    "views": [{"title": "Mine", "cards": [{"type": "markdown", "content": "Hi"}]}]
}


def _issue(hass) -> ir.IssueEntry | None:
    return ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_DASHBOARD_SAVED_COPY)


async def _save_on_our_path(hass, config: dict[str, Any]) -> None:
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(config)


async def _saved_copy_entry(
    hass, config: dict[str, Any] = SAVED_COPY, **kwargs: Any
) -> MockConfigEntry:
    """Return an entry that owns our dashboard, which someone took control of."""
    entry = await async_owned_entry(hass, **kwargs)
    await _save_on_our_path(hass, config)
    return entry


# ---------------------------------------------------------------------------
# What counts as a saved copy.
# ---------------------------------------------------------------------------


def _view(*cards: dict[str, Any]) -> dict[str, Any]:
    return {"views": [{"title": "Radar", "cards": list(cards)}]}


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        pytest.param(SAVED_COPY, True, id="card-in-a-section"),
        pytest.param(
            _view(
                {
                    "type": "vertical-stack",
                    "cards": [{"type": "custom:apollo-radar-setup-card"}],
                }
            ),
            True,
            id="card-in-a-stack",
        ),
        pytest.param(
            _view(
                {
                    "type": "entities",
                    "entities": [{"type": "custom:apollo-radar-slider-row"}],
                }
            ),
            True,
            id="row-in-an-entities-card",
        ),
        pytest.param(OUR_CONFIG, False, id="our-strategy"),
        pytest.param(USERS_OWN_VIEWS, False, id="no-card-of-ours"),
        pytest.param(
            {"views": [{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}]},
            False,
            id="our-view-strategy-builds-itself",
        ),
        pytest.param(
            {"strategy": {"type": "custom:other"}, **SAVED_COPY},
            False,
            id="another-dashboard-strategy",
        ),
        pytest.param(None, False, id="no-config"),
        pytest.param({"views": "broken"}, False, id="views-not-a-list"),
    ],
)
def test_what_counts_as_a_saved_copy(stored, expected) -> None:
    """Views naming one of our card or row types, and no strategy key."""
    assert _is_saved_copy(stored) is expected


# ---------------------------------------------------------------------------
# Detection: read only, the entry's own dashboard only, never fails setup.
# ---------------------------------------------------------------------------


async def test_a_saved_copy_raises_a_fixable_repair_and_writes_nothing(hass) -> None:
    """Setup notices the copy, raises a warning repair, and writes nothing."""
    entry = await _saved_copy_entry(hass)

    with record_dashboard_writes(hass) as writes:
        await setup_integration(hass, entry)

    assert writes == []
    issue = _issue(hass)
    assert issue is not None
    assert issue.is_fixable is True
    assert issue.severity is ir.IssueSeverity.WARNING
    assert issue.translation_key == ISSUE_DASHBOARD_SAVED_COPY
    assert issue.data == {"entry_id": entry.entry_id}
    assert await async_dashboard_config(hass) == SAVED_COPY


@pytest.mark.parametrize(
    "stored",
    [
        pytest.param(OUR_CONFIG, id="our-strategy"),
        pytest.param(USERS_OWN_VIEWS, id="no-card-of-ours"),
    ],
)
async def test_no_repair_unless_the_dashboard_is_a_saved_copy(hass, stored) -> None:
    """Our strategy, or views the user made their own, raise nothing."""
    entry = await _saved_copy_entry(hass, stored)

    await setup_integration(hass, entry)

    assert _issue(hass) is None


async def test_a_dashboard_the_entry_does_not_own_raises_no_repair(hass) -> None:
    """A saved copy on our url path or any other is not ours without a record."""
    await async_user_dashboard(hass, DASHBOARD_URL_PATH, SAVED_COPY)
    await async_user_dashboard(hass, USER_DASHBOARD_PATH, SAVED_COPY)
    entry = make_entry()

    await setup_integration(hass, entry)

    assert _issue(hass) is None


async def test_another_saved_copy_beside_ours_raises_no_repair(hass) -> None:
    """Only the recorded row is looked at, not one on another url path."""
    entry = await async_owned_entry(hass)
    await async_user_dashboard(hass, USER_DASHBOARD_PATH, SAVED_COPY)

    await setup_integration(hass, entry)

    assert _issue(hass) is None


async def test_a_yaml_dashboard_on_our_url_path_raises_no_repair(
    hass, hass_storage
) -> None:
    """A YAML dashboard holding our path is not judged as the recorded row."""
    hass_storage["lovelace_dashboards"] = {
        "version": 1,
        "minor_version": 1,
        "key": "lovelace_dashboards",
        "data": {
            "items": [
                {
                    "id": "apollo_mmwave",
                    "url_path": DASHBOARD_URL_PATH,
                    "title": DASHBOARD_TITLE,
                    "mode": "storage",
                }
            ]
        },
    }
    yaml_dashboards = {
        DASHBOARD_URL_PATH: {
            "mode": "yaml",
            "filename": "apollo-mmwave.yaml",
            "title": "My Radar",
        }
    }
    with patch.object(LovelaceYAML, "async_load", AsyncMock(return_value=SAVED_COPY)):
        assert await async_setup_component(
            hass, "lovelace", {"lovelace": {"dashboards": yaml_dashboards}}
        )
        assert isinstance(
            hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH], LovelaceYAML
        )
        await setup_integration(hass, make_entry("apollo_mmwave"))

    assert _issue(hass) is None


async def test_without_lovelace_nothing_is_raised_or_cleared(hass, caplog) -> None:
    """Unreadable dashboards are unknown: no repair, no failure, none cleared."""
    entry = make_entry("apollo_mmwave")
    await async_check_saved_copy(hass, entry)
    assert _issue(hass) is None
    assert apollo_warnings(caplog) == []

    entry = await _saved_copy_entry(hass)
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        await setup_integration(hass, entry)
        assert entry.state is ConfigEntryState.LOADED
        assert _issue(hass) is None

    await async_check_saved_copy(hass, entry)
    assert _issue(hass) is not None
    # An issue already raised is kept while nothing is known.
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        await async_check_saved_copy(hass, entry)
    assert _issue(hass) is not None
    assert apollo_warnings(caplog) == []


async def test_a_failing_check_never_fails_setup(hass, caplog) -> None:
    """An error reading the dashboards is logged and setup goes on."""
    entry = await _saved_copy_entry(hass)

    with patch.object(
        apollo_frontend, "_dashboards_collection", side_effect=RuntimeError("moved")
    ):
        await setup_integration(hass, entry)

    assert entry.state is ConfigEntryState.LOADED
    assert _issue(hass) is None
    assert any("could not read the dashboards" in w for w in apollo_warnings(caplog))


async def test_the_repair_clears_once_ours_again_or_gone(hass) -> None:
    """Back to the strategy, or deleted: the next check clears the repair."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    assert _issue(hass) is not None

    await _save_on_our_path(hass, OUR_CONFIG)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _issue(hass) is None

    await _save_on_our_path(hass, SAVED_COPY)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _issue(hass) is not None

    [row] = rows_on_url_path(hass)
    await _dashboards_collection(hass).async_delete_item(row["id"])
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _issue(hass) is None


# A dashboard the user makes on our url path: views holding one of our cards,
# or exactly our strategy.
USERS_VIEWS_WITH_OUR_CARD: dict[str, Any] = {
    "views": [
        {
            "title": "Mine",
            "cards": [
                {"type": "markdown", "content": "Hi"},
                {"type": "custom:apollo-radar-zone-map-card", "device_id": "abc123"},
            ],
        }
    ]
}


async def _delete_recorded_row(hass, entry: MockConfigEntry) -> None:
    await _dashboards_collection(hass).async_delete_item(entry.options["dashboard_id"])
    await hass.async_block_till_done()


@pytest.mark.parametrize(
    "config",
    [
        pytest.param(USERS_VIEWS_WITH_OUR_CARD, id="views-with-our-card"),
        pytest.param(OUR_CONFIG, id="our-strategy"),
    ],
)
async def test_a_dashboard_made_where_ours_was_deleted_is_not_ours(
    hass, config
) -> None:
    """
    Deleting ours forgets it, so a new one on its url path is the user's.

    Home Assistant gives the new row the id of its url path, which is the id
    the entry recorded. Kept, the record made the user's own dashboard look
    like a saved copy, offered for restore, or ours, written to.
    """
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    recorded = entry.options["dashboard_id"]

    with record_dashboard_writes(hass) as writes:
        await _delete_recorded_row(hass, entry)

    # The user's delete and Lovelace's own cleanup of its config, no more.
    assert writes == ["delete_item", "delete_config"]
    assert entry.options["dashboard_id"] is None
    assert entry.options["dashboard_url_path"] is None

    item = await async_user_dashboard(hass, DASHBOARD_URL_PATH, config)
    assert item["id"] == recorded
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert _issue(hass) is None
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["menu_options"] == ["add_dashboard", "dashboard_devices"]
    assert await async_dashboard_config(hass) == config


async def test_deleting_ours_clears_its_repair(hass) -> None:
    """A saved copy deleted while loaded takes its repair with it at once."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    assert _issue(hass) is not None

    await _delete_recorded_row(hass, entry)

    assert entry.options["dashboard_id"] is None
    assert _issue(hass) is None


async def test_deleting_another_dashboard_keeps_the_record(hass) -> None:
    """Only the recorded row's delete forgets it."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    recorded = dict(entry.options)
    other = await async_user_dashboard(hass)

    await _dashboards_collection(hass).async_delete_item(other["id"])
    await hass.async_block_till_done()

    assert dict(entry.options) == recorded


async def test_a_delete_while_unloaded_keeps_the_record(hass) -> None:
    """Nothing watches once the entry is unloaded (the documented catch)."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    recorded = dict(entry.options)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    await _delete_recorded_row(hass, entry)

    assert dict(entry.options) == recorded


async def test_a_failure_to_forget_never_fails_the_delete(hass, caplog) -> None:
    """The user's delete goes through, and the log says what went wrong."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)

    with patch.object(
        hass.config_entries, "async_update_entry", side_effect=RuntimeError("busy")
    ):
        await _delete_recorded_row(hass, entry)

    assert rows_on_url_path(hass) == []
    assert any("could not forget the deleted" in w for w in apollo_warnings(caplog))


async def test_an_options_change_rechecks_the_repair(hass) -> None:
    """Taking control after setup shows up at the next options change."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    assert _issue(hass) is None
    await _save_on_our_path(hass, SAVED_COPY)

    with record_dashboard_writes(hass) as writes:
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, CONF_DASHBOARD_DEVICES: ["devid1"]}
        )
        await hass.async_block_till_done()

    assert writes == []
    assert _issue(hass) is not None


async def test_removing_the_entry_clears_the_repair_and_keeps_the_copy(hass) -> None:
    """The copy is the user's and stays; nothing is left to restore it."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    assert _issue(hass) is not None

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert _issue(hass) is None
    assert len(rows_on_url_path(hass)) == 1
    assert await async_dashboard_config(hass) == SAVED_COPY


# ---------------------------------------------------------------------------
# The fix flow.
# ---------------------------------------------------------------------------


async def _start_fix(hass) -> dict[str, Any]:
    assert await async_setup_component(hass, "repairs", {})
    manager = repairs_flow_manager(hass)
    assert manager is not None
    return await manager.async_init(
        DOMAIN, context={"issue_id": ISSUE_DASHBOARD_SAVED_COPY}
    )


async def _submit_fix(hass, result: dict[str, Any]) -> dict[str, Any]:
    manager = repairs_flow_manager(hass)
    assert manager is not None
    result = await manager.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()
    return result


async def _confirm_form(hass) -> dict[str, Any]:
    """Open the fix flow and check nothing is written before Submit."""
    with record_dashboard_writes(hass) as writes:
        result = await _start_fix(hass)
    assert writes == []
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "confirm"
    assert result["data_schema"].schema == {}
    return result


@pytest.mark.parametrize("admin_only", [True, False])
async def test_the_fix_keeps_the_copy_before_it_restores(hass, admin_only) -> None:
    """Submit saves the copy first, then the strategy with the selection."""
    entry = await _saved_copy_entry(
        hass, require_admin=admin_only, **{CONF_DASHBOARD_DEVICES: ["devid1"]}
    )
    await setup_integration(hass, entry)
    [ours_before] = rows_on_url_path(hass)
    options_before = dict(entry.options)
    result = await _confirm_form(hass)

    saved_paths: list[str] = []
    with record_dashboard_writes(hass) as writes:
        recorded_save = LovelaceStorage.async_save

        async def save(self, config) -> None:
            saved_paths.append(self.url_path)
            await recorded_save(self, config)

        with patch.object(LovelaceStorage, "async_save", save):
            result = await _submit_fix(hass, result)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert writes == ["create_item", "save_config", "save_config"]
    assert saved_paths == [SAVED_COPY_URL_PATH, DASHBOARD_URL_PATH]
    [copy_row] = rows_on_url_path(hass, SAVED_COPY_URL_PATH)
    assert copy_row["title"] == SAVED_COPY_TITLE
    assert copy_row["icon"] == DASHBOARD_ICON
    assert copy_row["show_in_sidebar"] is False
    assert copy_row["require_admin"] is admin_only
    assert SAVED_COPY_URL_PATH in hass.data[DATA_PANELS]
    assert await async_dashboard_config(hass, SAVED_COPY_URL_PATH) == SAVED_COPY
    assert await async_dashboard_config(hass) == {
        "strategy": {"type": DASHBOARD_STRATEGY_TYPE, "devices": ["devid1"]}
    }
    # Our row and the entry's record are as they were; the repair is gone.
    assert rows_on_url_path(hass) == [ours_before]
    assert dict(entry.options) == options_before
    assert _issue(hass) is None


@pytest.mark.parametrize(
    ("taken", "expected"),
    [
        pytest.param([SAVED_COPY_URL_PATH], f"{SAVED_COPY_URL_PATH}-2", id="-2"),
        pytest.param(
            [SAVED_COPY_URL_PATH, f"{SAVED_COPY_URL_PATH}-2"],
            f"{SAVED_COPY_URL_PATH}-3",
            id="-3",
        ),
    ],
)
async def test_the_copy_takes_the_next_free_url_path(hass, taken, expected) -> None:
    """A dashboard already on the copy's path is left alone."""
    entry = await _saved_copy_entry(hass)
    for url_path in taken:
        await async_user_dashboard(hass, url_path, USERS_OWN_VIEWS)
    await setup_integration(hass, entry)

    result = await _submit_fix(hass, await _confirm_form(hass))

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert await async_dashboard_config(hass, expected) == SAVED_COPY
    for url_path in taken:
        assert await async_dashboard_config(hass, url_path) == USERS_OWN_VIEWS
    assert await async_dashboard_config(hass) == OUR_CONFIG


async def test_a_copy_that_cannot_be_created_changes_nothing(hass, caplog) -> None:
    """No copy, no restore: our dashboard and the repair stay as they are."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    result = await _confirm_form(hass)

    with patch.object(
        _dashboards_collection(hass),
        "async_create_item",
        side_effect=HomeAssistantError("storage is read-only"),
    ):
        result = await _submit_fix(hass, result)

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == RestoreResult.COPY_NOT_SAVED
    assert await async_dashboard_config(hass) == SAVED_COPY
    assert rows_on_url_path(hass, SAVED_COPY_URL_PATH) == []
    assert _issue(hass) is not None
    [warning] = apollo_warnings(caplog)
    assert "could not keep a copy" in warning


async def test_a_copy_whose_config_cannot_be_saved_is_rolled_back(hass) -> None:
    """The half-made copy goes again, and our dashboard is never written."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    result = await _confirm_form(hass)
    real_save = LovelaceStorage.async_save

    async def save(self, config) -> None:
        if self.url_path == SAVED_COPY_URL_PATH:
            msg = "simulated save failure"
            raise HomeAssistantError(msg)
        await real_save(self, config)

    with patch.object(LovelaceStorage, "async_save", save):
        result = await _submit_fix(hass, result)

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == RestoreResult.COPY_NOT_SAVED
    assert rows_on_url_path(hass, SAVED_COPY_URL_PATH) == []
    assert SAVED_COPY_URL_PATH not in hass.data[DATA_PANELS]
    assert await async_dashboard_config(hass) == SAVED_COPY
    assert _issue(hass) is not None


async def test_a_failed_restore_keeps_the_copy_and_the_repair(hass, caplog) -> None:
    """The copy is saved; our dashboard is left as it was; the abort says so."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    result = await _confirm_form(hass)
    real_save = LovelaceStorage.async_save

    async def save(self, config) -> None:
        if self.url_path == DASHBOARD_URL_PATH:
            msg = "simulated save failure"
            raise HomeAssistantError(msg)
        await real_save(self, config)

    with patch.object(LovelaceStorage, "async_save", save):
        result = await _submit_fix(hass, result)

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == RestoreResult.DASHBOARD_NOT_RESTORED
    assert await async_dashboard_config(hass, SAVED_COPY_URL_PATH) == SAVED_COPY
    assert await async_dashboard_config(hass) == SAVED_COPY
    assert _issue(hass) is not None
    [warning] = apollo_warnings(caplog)
    assert "could not restore the automatic dashboard" in warning


async def test_the_fix_aborts_once_restored_another_way(hass) -> None:
    """Back on the strategy before the fix opened: nothing to do, repair gone."""
    entry = await _saved_copy_entry(hass)
    await setup_integration(hass, entry)
    assert _issue(hass) is not None
    await _save_on_our_path(hass, OUR_CONFIG)

    with record_dashboard_writes(hass) as writes:
        result = await _start_fix(hass)

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == RestoreResult.NOT_A_SAVED_COPY
    assert writes == []
    assert _issue(hass) is None


# ---------------------------------------------------------------------------
# The text the repair and the options flow show.
# ---------------------------------------------------------------------------


def test_every_restore_outcome_has_its_text() -> None:
    """Each failure has a repair abort and an options flow error or abort."""
    strings = json.loads(EN_JSON.read_text(encoding="utf-8"))
    issue = strings["issues"][ISSUE_DASHBOARD_SAVED_COPY]
    options = strings["options"]
    assert issue["title"]
    for result in RestoreResult:
        if result is RestoreResult.RESTORED:
            continue
        assert issue["fix_flow"]["abort"][result.value]
        assert (
            options["error"].get(result.value) or options["abort"].get(result.value)
        ) == issue["fix_flow"]["abort"][result.value]
    # The options flow says the same as the repair before the same action.
    confirm = issue["fix_flow"]["step"]["confirm"]
    assert (
        options["step"]["restore_dashboard"]["description"] == (confirm["description"])
    )
    assert options["step"]["init"]["menu_options"]["restore_dashboard"] == (
        "Restore the automatic dashboard"
    )
    assert SAVED_COPY_TITLE in confirm["description"]
