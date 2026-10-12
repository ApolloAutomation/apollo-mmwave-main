"""
Frontend asset registration: Lovelace resources are the load-bearing path.

HA's service worker caches the app shell, so ``add_extra_js_url`` never
reaches a browser that cached the shell before the integration was installed.
Those clients only get the module through the Lovelace resource collection —
if that registration fails, the dashboard times out waiting for the strategy
element with no way to recover short of a hard refresh.
"""

from __future__ import annotations

import logging
from http import HTTPStatus
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, DATA_PANELS
from homeassistant.components.lovelace import LovelaceData
from homeassistant.components.lovelace.const import (
    LOVELACE_DATA,
    MODE_STORAGE,
    ConfigNotFound,
)
from homeassistant.components.lovelace.dashboard import LovelaceStorage, LovelaceYAML
from homeassistant.exceptions import HomeAssistantError
from homeassistant.loader import async_get_integration
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import frontend as apollo_frontend
from custom_components.apollo_mmwave.const import (
    CONF_AUTO_CREATE_VIEW,
    CONF_DASHBOARD_DEVICES,
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_ASSETS_REGISTERED,
    DOMAIN,
    JS_BUNDLES,
)
from custom_components.apollo_mmwave.frontend import (
    _async_register_lovelace_resources,
    _dashboards_collection,
    async_register_dashboard,
    async_register_frontend_assets,
    async_remove_dashboard,
)

from .conftest import setup_integration

if TYPE_CHECKING:
    from homeassistant.components.lovelace.resources import ResourceStorageCollection


async def test_lovelace_resources_registered(hass, config_entry) -> None:
    """Both bundles end up in the storage-mode resource collection."""
    await setup_integration(hass, config_entry)

    resources = hass.data[LOVELACE_DATA].resources
    items = resources.async_items()
    urls = {str(item.get("url", "")).partition("?")[0] for item in items}

    assert "/apollo_mmwave/apollo-radar-tuning.js" in urls
    assert "/apollo_mmwave/apollo-radar-zone-map-card.js" in urls
    # All entries are module resources with a cache-busting version. The
    # stored field is "type" (the WS create API takes "res_type").
    for item in items:
        url = str(item.get("url", ""))
        if url.startswith("/apollo_mmwave/"):
            assert item.get("type") == "module"
            assert "?v=" in url


async def test_resource_version_updated_on_upgrade(hass, config_entry) -> None:
    """A stale ?v= entry is repointed at the current version, not duplicated."""
    await setup_integration(hass, config_entry)
    resources = hass.data[LOVELACE_DATA].resources
    ours = [
        i
        for i in resources.async_items()
        if str(i.get("url", "")).startswith("/apollo_mmwave/apollo-radar-tuning.js")
    ]
    assert len(ours) == 1
    old_id = ours[0]["id"]
    await resources.async_update_item(
        old_id, {"url": "/apollo_mmwave/apollo-radar-tuning.js?v=0.0.1"}
    )

    # Re-register (simulates the next boot after an upgrade).
    hass.data[DOMAIN].pop(DATA_ASSETS_REGISTERED, None)
    await async_register_frontend_assets(hass)

    ours = [
        i
        for i in resources.async_items()
        if str(i.get("url", "")).startswith("/apollo_mmwave/apollo-radar-tuning.js")
    ]
    assert len(ours) == 1
    assert ours[0]["id"] == old_id
    assert "?v=0.0.1" not in ours[0]["url"]


async def test_stale_bundle_resource_is_removed(hass, config_entry) -> None:
    """
    A resource left over from a renamed bundle is deleted, not left 404ing.

    Renaming a bundle strands the old resource entry: it points at a file that
    no longer exists, so every dashboard load fetches a 404. Only entries under
    our own static path are swept; everyone else's cards are untouchable.
    """
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data[LOVELACE_DATA].resources
    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True
    await resources.async_create_item(
        {"res_type": "module", "url": "/apollo_mmwave/zone-mapper-card.js?v=1.1.0"}
    )
    await resources.async_create_item(
        {"res_type": "module", "url": "/local/community/somebody-elses-card.js"}
    )

    await setup_integration(hass, config_entry)

    urls = {str(i.get("url", "")) for i in resources.async_items()}
    assert not any(u.startswith("/apollo_mmwave/zone-mapper-card.js") for u in urls)
    assert "/local/community/somebody-elses-card.js" in urls
    assert any(
        u.startswith("/apollo_mmwave/apollo-radar-zone-map-card.js") for u in urls
    )


TUNING_URL = "/apollo_mmwave/apollo-radar-tuning.js"
FOREIGN_URL = "/local/community/somebody-elses-card.js"


async def _resources_before_setup(hass) -> ResourceStorageCollection:
    """Return the storage resource collection, loaded, before our setup runs."""
    assert await async_setup_component(hass, "lovelace", {})
    resources = hass.data[LOVELACE_DATA].resources
    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True
    return resources


async def _current_tuning_url(hass) -> str:
    """Return the tuning bundle's url with this version's cache-buster."""
    version = (await async_get_integration(hass, DOMAIN)).version
    return f"{TUNING_URL}?v={version}"


def _tuning_rows(resources: ResourceStorageCollection) -> list[dict]:
    """Return every resource row for the tuning bundle, any ?v= or none."""
    return [
        i
        for i in resources.async_items()
        if str(i.get("url", "")).partition("?")[0] == TUNING_URL
    ]


@pytest.mark.parametrize(
    "rows",
    [
        pytest.param([TUNING_URL, f"{TUNING_URL}?v=0.0.1"], id="bare-then-stale"),
        pytest.param([f"{TUNING_URL}?v=0.0.1", TUNING_URL], id="stale-then-bare"),
        pytest.param(["{current}", TUNING_URL], id="current-then-bare"),
        pytest.param([TUNING_URL, "{current}"], id="bare-then-current"),
        pytest.param(["{current}", "{current}"], id="current-twice"),
    ],
)
async def test_duplicate_resource_rows_collapse_to_one(
    hass, config_entry, rows
) -> None:
    """
    Two rows for one bundle end up as one row at the current version.

    Keying rows by bundle used to hide every row but the last, so an old ?v=
    copy or one added by hand without the cache-buster survived forever and
    the browser fetched and ran the bundle twice. A row already at the
    current version is the one kept when there is one.
    """
    resources = await _resources_before_setup(hass)
    current = await _current_tuning_url(hass)
    for url in rows:
        await resources.async_create_item(
            {"res_type": "module", "url": url.format(current=current)}
        )
    await resources.async_create_item({"res_type": "js", "url": FOREIGN_URL})
    current_ids = {i["id"] for i in _tuning_rows(resources) if i["url"] == current}

    await setup_integration(hass, config_entry)

    ours = _tuning_rows(resources)
    assert len(ours) == 1
    assert ours[0]["url"] == current
    assert ours[0]["type"] == "module"
    if current_ids:
        assert ours[0]["id"] in current_ids
    # Somebody else's row is never touched.
    foreign = [i for i in resources.async_items() if i["url"] == FOREIGN_URL]
    assert len(foreign) == 1
    assert foreign[0]["type"] == "js"

    # The next boot finds nothing left to fix.
    kept_id = ours[0]["id"]
    hass.data[DOMAIN].pop(DATA_ASSETS_REGISTERED, None)
    await async_register_frontend_assets(hass)
    ours = _tuning_rows(resources)
    assert [i["id"] for i in ours] == [kept_id]


@pytest.mark.parametrize("version", ["0.0.1", None], ids=["stale-v", "current-v"])
async def test_mistyped_resource_row_is_repointed_as_a_module(
    hass, config_entry, version
) -> None:
    """
    A row for our bundle added as a classic "js" script becomes a module row.

    The bundles are ES modules, so loaded as a classic script they throw on
    the top-level ``export`` and the strategy element never defines. Only the
    url used to be compared, so the row kept its "js" type even after being
    logged as updated, and a "js" row already at the current ?v= was left
    alone entirely.
    """
    resources = await _resources_before_setup(hass)
    current = await _current_tuning_url(hass)
    url = f"{TUNING_URL}?v={version}" if version else current
    created = await resources.async_create_item({"res_type": "js", "url": url})

    await setup_integration(hass, config_entry)

    ours = _tuning_rows(resources)
    assert len(ours) == 1
    assert ours[0]["id"] == created["id"]
    assert ours[0]["url"] == current
    assert ours[0]["type"] == "module"


async def _current_urls(hass) -> list[str]:
    """Return every bundle's url with this version's cache-buster."""
    version = (await async_get_integration(hass, DOMAIN)).version
    return [f"/apollo_mmwave/{name}?v={version}" for name in JS_BUNDLES]


def _our_extra_module_urls(hass) -> set[str]:
    """Return the extra module urls under our static path."""
    return {
        url
        for url in hass.data[DATA_EXTRA_MODULE_URL].urls
        if url.startswith("/apollo_mmwave/")
    }


async def test_both_bundles_are_extra_module_urls_and_served(
    hass, hass_client, config_entry
) -> None:
    """Each bundle's versioned url reaches every page, and the file is served."""
    await setup_integration(hass, config_entry)

    urls = await _current_urls(hass)
    assert _our_extra_module_urls(hass) == set(urls)
    client = await hass_client()
    for url in urls:
        response = await client.get(url)
        assert response.status == HTTPStatus.OK


async def test_missing_bundle_is_warned_about_and_never_registered(
    hass, hass_client, config_entry, tmp_path, caplog
) -> None:
    """
    A bundle missing from www/ is named in a warning and nothing points at it.

    A url registered for a file that is not there would make every dashboard
    load fetch a 404 with nothing in the log to say why.
    """
    with patch.object(apollo_frontend, "_frontend_path", return_value=tmp_path):
        await setup_integration(hass, config_entry)

    warnings = _apollo_warnings(caplog)
    assert len(warnings) == len(JS_BUNDLES)
    for name, warning in zip(JS_BUNDLES, warnings, strict=True):
        assert f"bundled frontend asset {name} is missing" in warning
    assert _our_extra_module_urls(hass) == set()
    rows = hass.data[LOVELACE_DATA].resources.async_items()
    assert not [i for i in rows if str(i.get("url", "")).startswith("/apollo_mmwave/")]
    client = await hass_client()
    for name in JS_BUNDLES:
        response = await client.get(f"/apollo_mmwave/{name}")
        assert response.status == HTTPStatus.NOT_FOUND


async def test_yaml_resource_mode_logs_manual_instructions(
    hass, config_entry, caplog
) -> None:
    """
    YAML-mode resources get one warning listing both urls, last, to copy.

    The collection is read-only there, so the rows have to be added by hand.
    Each ?v= moves on every upgrade while a hand-added row stays put, and the
    old row beside the new extra module url runs the bundle twice, so the
    warning says to replace the row rather than add another one.
    """
    assert await async_setup_component(
        hass, "lovelace", {"lovelace": {"resource_mode": "yaml"}}
    )
    assert not hasattr(hass.data[LOVELACE_DATA].resources, "async_create_item")

    await setup_integration(hass, config_entry)

    urls = await _current_urls(hass)
    records = _apollo_warning_records(caplog)
    assert len(records) == 1
    assert records[0].exc_info is None
    message = records[0].getMessage()
    assert "managed in YAML" in message
    assert "Each ?v= is the current integration version" in message
    assert "after every upgrade, replace each bundle's existing row" in message
    assert "instead of adding a second row" in message
    # Nothing trails the urls, so a copied ?v= is exactly the current one.
    assert message.endswith(f"Resources: {', '.join(urls)}")
    # The extra module urls still cover pages loaded from now on.
    assert _our_extra_module_urls(hass) == set(urls)


@pytest.mark.parametrize("has_lovelace_data", [False, True])
async def test_unavailable_resource_collection_is_warned_about(
    hass, caplog, has_lovelace_data
) -> None:
    """
    No resource collection to write to is a warning, never a raised error.

    Lovelace is a manifest dependency, so setup always finds its data on the
    pinned Home Assistant versions. The helper is driven directly so the
    branch keeps working if Lovelace's internals move.
    """
    if has_lovelace_data:
        hass.data[LOVELACE_DATA] = LovelaceData(
            resource_mode=MODE_STORAGE,
            dashboards={},
            resources=None,
            yaml_dashboards={},
        )

    await _async_register_lovelace_resources(hass, await _current_urls(hass))

    warnings = _apollo_warnings(caplog)
    assert len(warnings) == 1
    assert "Lovelace resource collection unavailable" in warnings[0]
    expected_type = "LovelaceData" if has_lovelace_data else "NoneType"
    assert f"(lovelace data: {expected_type})" in warnings[0]


@pytest.fixture
def dashboard_entry() -> MockConfigEntry:
    """Return an entry with the sidebar dashboard turned ON."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={CONF_AUTO_CREATE_VIEW: True},
        unique_id=DOMAIN,
    )


def _our_rows(hass) -> list[dict[str, Any]]:
    """Return every dashboards collection row on our url path."""
    return [
        i
        for i in _dashboards_collection(hass).async_items()
        if i["url_path"] == DASHBOARD_URL_PATH
    ]


async def _dashboard_config(hass) -> dict | None:
    """Return the stored Lovelace config for our url path, or None."""
    config = hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH)
    if config is None:
        return None
    try:
        return await config.async_load(force=False)
    except ConfigNotFound:
        return None


async def test_dashboard_appears_with_a_title_and_can_be_taken_over(
    hass, hass_ws_client, dashboard_entry
) -> None:
    """The row on the dashboards page has our title, and "take control" saves."""
    await setup_integration(hass, dashboard_entry)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "lovelace/dashboards/list"})
    rows = (await client.receive_json())["result"]
    ours = next(r for r in rows if r["url_path"] == DASHBOARD_URL_PATH)
    assert ours["title"] == DASHBOARD_TITLE

    # 1.3.1 shipped with no panel at all: the dashboards list reads a different
    # dict, so it alone would not have caught that.
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]

    stored = await _dashboard_config(hass)
    assert stored["strategy"]["type"] == DASHBOARD_STRATEGY_TYPE

    await client.send_json_auto_id(
        {
            "type": "lovelace/config/save",
            "url_path": DASHBOARD_URL_PATH,
            "config": {"views": [{"title": "Mine", "cards": []}]},
        }
    )
    assert (await client.receive_json())["success"] is True


async def test_removing_the_entry_removes_the_dashboard(hass, dashboard_entry) -> None:
    """Deleting the config entry takes the collection item and panel with it."""
    await setup_integration(hass, dashboard_entry)
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards

    await hass.config_entries.async_remove(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_the_auto_create_option_removes_and_recreates_the_dashboard(
    hass, dashboard_entry, caplog
) -> None:
    """
    Changing the option on the entry removes the dashboard, then brings it back.

    The update listener is the one production path that deletes the
    dashboard, so the options are changed on the entry the way a saved
    options form arrives, not by calling the helpers.
    """
    await setup_integration(hass, dashboard_entry)
    assert len(_our_rows(hass)) == 1
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]

    hass.config_entries.async_update_entry(
        dashboard_entry, options={CONF_AUTO_CREATE_VIEW: False}
    )
    await hass.async_block_till_done()

    assert _our_rows(hass) == []
    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]

    hass.config_entries.async_update_entry(
        dashboard_entry, options={CONF_AUTO_CREATE_VIEW: True}
    )
    await hass.async_block_till_done()

    assert len(_our_rows(hass)) == 1
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    assert await _dashboard_config(hass) == {
        "strategy": {"type": DASHBOARD_STRATEGY_TYPE}
    }
    assert _apollo_warnings(caplog) == []


async def test_unreachable_dashboards_collection_is_warned_about(
    hass, dashboard_entry, caplog
) -> None:
    """
    Without the dashboards collection, setup goes on and says how to recover.

    The collection is borrowed from a websocket handler rather than a public
    API, so if Lovelace moves it the warning names the strategy to add by hand.
    """
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        await setup_integration(hass, dashboard_entry)

    warnings = _apollo_warnings(caplog)
    assert len(warnings) == 1
    assert "could not reach Lovelace's dashboards collection" in warnings[0]
    assert DASHBOARD_STRATEGY_TYPE in warnings[0]
    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_reloading_the_entry_keeps_the_users_dashboard_edits(
    hass, dashboard_entry
) -> None:
    """A reload must not delete and recreate the row, wiping renames and icons."""
    await setup_integration(hass, dashboard_entry)
    collection = _dashboards_collection(hass)
    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    await collection.async_update_item(
        item["id"], {"title": "Radar", "icon": "mdi:home", "show_in_sidebar": False}
    )

    await hass.config_entries.async_reload(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    assert item["title"] == "Radar"
    assert item["icon"] == "mdi:home"
    assert item["show_in_sidebar"] is False


async def test_a_foreign_dashboard_on_our_url_path_is_never_written_to(
    hass, dashboard_entry
) -> None:
    """A user's own dashboard here has no config yet; that is not a free space."""
    dashboard_entry.add_to_hass(hass)
    # The integration is not up yet, so this row is unmistakably not ours. It
    # has no stored Lovelace config, exactly like one made in the UI and not
    # yet opened.
    assert await async_setup_component(hass, "lovelace", {})
    collection = _dashboards_collection(hass)
    await collection.async_create_item(
        {"url_path": DASHBOARD_URL_PATH, "title": "My Radar Room"}
    )

    assert await hass.config_entries.async_setup(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert await _dashboard_config(hass) is None

    # And turning the option off must not delete what we never created.
    await async_remove_dashboard(hass)
    await hass.async_block_till_done()
    item = next(
        i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
    )
    assert item["title"] == "My Radar Room"


async def test_taken_over_dashboard_is_never_overwritten_or_deleted(
    hass, dashboard_entry
) -> None:
    """Once the strategy key is gone the config is the user's, not ours."""
    await setup_integration(hass, dashboard_entry)
    mine = {"views": [{"title": "Mine", "cards": [{"type": "markdown"}]}]}
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(mine)

    # Re-registering (a restart, or an options change) must not reseed it.
    await async_register_dashboard(hass, [])
    await hass.async_block_till_done()
    assert await _dashboard_config(hass) == mine

    # Nor may unloading delete a dashboard the user now owns.
    await async_remove_dashboard(hass)
    await hass.async_block_till_done()
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards
    assert await _dashboard_config(hass) == mine


async def test_user_added_strategy_options_survive_a_re_register(
    hass, dashboard_entry
) -> None:
    """`distance_unit` typed into the raw editor is not ours to erase."""
    await setup_integration(hass, dashboard_entry)
    dashboard = hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH]
    await dashboard.async_save(
        {"strategy": {"type": DASHBOARD_STRATEGY_TYPE, "distance_unit": "ft"}}
    )

    # A restart or an options change re-registers with a device selection.
    await async_register_dashboard(hass, ["dev1"])
    await hass.async_block_till_done()
    stored = await _dashboard_config(hass)
    assert stored["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "distance_unit": "ft",
        "devices": ["dev1"],
    }

    # Clearing the selection drops `devices` and keeps the user's key.
    await async_register_dashboard(hass, [])
    await hass.async_block_till_done()
    stored = await _dashboard_config(hass)
    assert stored["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "distance_unit": "ft",
    }


# The row an earlier auto-create left behind, exactly as Lovelace stores it.
STALE_ROW: dict[str, Any] = {
    "id": "apollo_mmwave",
    "url_path": DASHBOARD_URL_PATH,
    "title": DASHBOARD_TITLE,
    "icon": DASHBOARD_ICON,
    "show_in_sidebar": True,
    "require_admin": False,
    "mode": "storage",
}


# A user's YAML dashboard on our url path, using our strategy the way our own
# warnings suggest building one by hand.
YAML_DASHBOARDS: dict[str, Any] = {
    DASHBOARD_URL_PATH: {
        "mode": "yaml",
        "filename": "apollo-mmwave.yaml",
        "title": "My Radar",
        "show_in_sidebar": True,
    }
}


async def _yaml_dashboard_over_a_stale_row(hass, hass_storage) -> None:
    """
    Boot Lovelace with a user's YAML dashboard on our url path and our old row.

    Lovelace registers YAML dashboards first, so when the storage row on the
    same url path loads it keeps the YAML dashboard there and only warns. The
    YAML uses our strategy, the way our own warnings suggest building one.
    """
    hass_storage["lovelace_dashboards"] = {
        "version": 1,
        "minor_version": 1,
        "key": "lovelace_dashboards",
        "data": {"items": [dict(STALE_ROW)]},
    }
    assert await async_setup_component(
        hass, "lovelace", {"lovelace": {"dashboards": YAML_DASHBOARDS}}
    )


def _assert_yaml_dashboard_untouched(hass) -> None:
    """Assert the user's YAML dashboard is still served and our row is kept."""
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    dashboard = hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH)
    assert isinstance(dashboard, LovelaceYAML)
    rows = [
        i
        for i in _dashboards_collection(hass).async_items()
        if i["url_path"] == DASHBOARD_URL_PATH
    ]
    assert [i["id"] for i in rows] == [STALE_ROW["id"]]


def _apollo_warning_records(caplog) -> list[logging.LogRecord]:
    """Return every warning-or-worse record this integration logged."""
    return [
        r
        for r in caplog.records
        if r.name.startswith("custom_components.apollo_mmwave")
        and r.levelno >= logging.WARNING
    ]


def _apollo_warnings(caplog) -> list[str]:
    """Return every warning or worse this integration logged."""
    return [r.getMessage() for r in _apollo_warning_records(caplog)]


async def test_a_yaml_dashboard_on_our_url_path_is_left_alone(
    hass, dashboard_entry, caplog
) -> None:
    """
    A YAML dashboard already on our url path gets no row, now or on removal.

    Lovelace refuses a second panel on a path a YAML dashboard holds, so
    creating one anyway would log a traceback on every start; and the
    dashboard is the user's, so removing the integration leaves it standing.
    """
    caplog.set_level(logging.DEBUG, logger=apollo_frontend.__name__)
    assert await async_setup_component(
        hass, "lovelace", {"lovelace": {"dashboards": YAML_DASHBOARDS}}
    )

    await setup_integration(hass, dashboard_entry)

    assert _our_rows(hass) == []
    assert isinstance(
        hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH], LovelaceYAML
    )
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    owned = [
        r
        for r in caplog.records
        if r.name == apollo_frontend.__name__ and "already owns" in r.getMessage()
    ]
    assert len(owned) == 1
    assert owned[0].levelno == logging.DEBUG
    assert f"'{DASHBOARD_URL_PATH}'" in owned[0].getMessage()

    # A device selection makes no difference: still no row, nothing raised.
    await async_register_dashboard(hass, ["dev1"])
    await hass.async_block_till_done()
    assert _our_rows(hass) == []

    await hass.config_entries.async_remove(dashboard_entry.entry_id)
    await hass.async_block_till_done()

    assert isinstance(
        hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH), LovelaceYAML
    )
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    assert _our_rows(hass) == []
    assert _apollo_warnings(caplog) == []


async def test_yaml_dashboard_on_our_path_is_never_removed(
    hass, hass_storage, config_entry, caplog
) -> None:
    """
    A stale row is not judged by the YAML dashboard shadowing it.

    The ownership check read whichever dashboard held the url path, so a YAML
    dashboard using our strategy made the stale row look ours. Deleting that
    row made Lovelace drop the YAML dashboard's panel, and the user's own
    dashboard vanished from the sidebar until the next restart.
    """
    yaml_config = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}
    with patch.object(LovelaceYAML, "async_load", AsyncMock(return_value=yaml_config)):
        await _yaml_dashboard_over_a_stale_row(hass, hass_storage)
        # Auto-create is off, so setup itself runs the removal.
        await setup_integration(hass, config_entry)
        _assert_yaml_dashboard_untouched(hass)

        await async_remove_dashboard(hass)
        await hass.async_block_till_done()
        _assert_yaml_dashboard_untouched(hass)

    assert _apollo_warnings(caplog) == []


async def test_yaml_dashboard_on_our_path_is_not_written_to(
    hass, hass_storage, caplog
) -> None:
    """
    With auto-create on, a stale row never makes us save onto a YAML dashboard.

    A device selection makes the wanted config differ from the YAML one, and
    saving it onto the YAML dashboard raised and logged a traceback on every
    start.
    """
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={CONF_AUTO_CREATE_VIEW: True, CONF_DASHBOARD_DEVICES: ["dev1"]},
        unique_id=DOMAIN,
    )
    yaml_config = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}
    load = AsyncMock(return_value=yaml_config)
    save = AsyncMock()
    with (
        patch.object(LovelaceYAML, "async_load", load),
        patch.object(LovelaceYAML, "async_save", save),
    ):
        await _yaml_dashboard_over_a_stale_row(hass, hass_storage)
        await setup_integration(hass, entry)
        _assert_yaml_dashboard_untouched(hass)

        await async_register_dashboard(hass, ["dev1"])
        await hass.async_block_till_done()
        _assert_yaml_dashboard_untouched(hass)

    save.assert_not_awaited()
    assert _apollo_warnings(caplog) == []


async def test_failed_first_config_save_does_not_strand_the_row(
    hass, dashboard_entry, caplog
) -> None:
    """
    A row whose first config save fails is rolled back, and the next setup works.

    Left behind with no config it read as not ours forever: Lovelace showed it
    as an auto-generated dashboard, reloads never seeded it, and turning the
    option off never removed it.
    """
    real_save = LovelaceStorage.async_save
    failures: list[str] = []

    async def save_failing_once(self, config) -> None:
        if self.url_path == DASHBOARD_URL_PATH and not failures:
            failures.append(DASHBOARD_URL_PATH)
            msg = "simulated save failure"
            raise HomeAssistantError(msg)
        await real_save(self, config)

    with patch.object(LovelaceStorage, "async_save", save_failing_once):
        await setup_integration(hass, dashboard_entry)

        assert failures == [DASHBOARD_URL_PATH]
        collection = _dashboards_collection(hass)
        assert not [
            i for i in collection.async_items() if i["url_path"] == DASHBOARD_URL_PATH
        ]
        assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
        assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]
        warnings = _apollo_warnings(caplog)
        assert len(warnings) == 1
        assert "could not register the dashboard" in warnings[0]

        await hass.config_entries.async_reload(dashboard_entry.entry_id)
        await hass.async_block_till_done()

    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    stored = await _dashboard_config(hass)
    assert stored["strategy"]["type"] == DASHBOARD_STRATEGY_TYPE
