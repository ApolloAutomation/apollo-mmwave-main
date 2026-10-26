"""
Frontend asset registration: Lovelace resources are the load-bearing path.

HA's service worker caches the app shell, so ``add_extra_js_url`` never
reaches a browser that cached the shell before the integration was installed.
Those clients only get the module through the Lovelace resource collection —
if that registration fails, the dashboard times out waiting for the strategy
element with no way to recover short of a hard refresh.
"""

from __future__ import annotations

import asyncio
from http import HTTPStatus
from pathlib import Path
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, DATA_PANELS
from homeassistant.components.lovelace import LovelaceData
from homeassistant.components.lovelace.const import (
    LOVELACE_DATA,
    MODE_STORAGE,
)
from homeassistant.components.lovelace.dashboard import LovelaceStorage, LovelaceYAML
from homeassistant.exceptions import HomeAssistantError
from homeassistant.loader import async_get_integration
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.apollo_mmwave import frontend as apollo_frontend
from custom_components.apollo_mmwave.const import (
    CONF_DASHBOARD_ID,
    CONF_DASHBOARD_URL_PATH,
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_ASSETS_REGISTERED,
    DOMAIN,
    JS_BUNDLES,
)
from custom_components.apollo_mmwave.frontend import (
    DashboardsUnreadableError,
    _async_register_lovelace_resources,
    _dashboards_collection,
    async_create_dashboard,
    async_dashboard_owned,
    async_find_legacy_dashboard,
    async_register_frontend_assets,
    async_remove_dashboard,
    async_set_dashboard_devices,
)

from .conftest import (
    USER_DASHBOARD_CONFIG,
    USER_DASHBOARD_PATH,
    apollo_warning_records,
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

    warnings = apollo_warnings(caplog)
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


async def test_one_missing_bundle_leaves_the_other_registered(
    hass, hass_client, config_entry, tmp_path, caplog
) -> None:
    """Only the missing bundle is warned about; the one on disk is still served."""
    present, missing = JS_BUNDLES
    (tmp_path / present).write_text("export {};\n")
    with patch.object(apollo_frontend, "_frontend_path", return_value=tmp_path):
        await setup_integration(hass, config_entry)

    warnings = apollo_warnings(caplog)
    assert len(warnings) == 1
    assert f"bundled frontend asset {missing} is missing" in warnings[0]
    assert {url.partition("?")[0] for url in _our_extra_module_urls(hass)} == {
        f"/apollo_mmwave/{present}"
    }
    client = await hass_client()
    assert (await client.get(f"/apollo_mmwave/{present}")).status == HTTPStatus.OK
    assert (
        await client.get(f"/apollo_mmwave/{missing}")
    ).status == HTTPStatus.NOT_FOUND


def _on_event_loop() -> bool:
    """Report whether the calling thread is running an event loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    return True


async def test_bundle_check_runs_off_the_event_loop(hass, config_entry) -> None:
    """
    The bundle files are checked in the executor, never on the event loop.

    `Path.is_file` is a stat on the disk. Home Assistant's loop protection does
    not catch it, so this test does.
    """
    real_is_file = Path.is_file
    on_loop: list[bool] = []

    def spy(self: Path) -> bool:
        if self.name in JS_BUNDLES:
            on_loop.append(_on_event_loop())
        return real_is_file(self)

    with patch.object(Path, "is_file", spy):
        await setup_integration(hass, config_entry)

    assert on_loop == [False] * len(JS_BUNDLES)
    assert _our_extra_module_urls(hass) == set(await _current_urls(hass))


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
    records = apollo_warning_records(caplog)
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

    warnings = apollo_warnings(caplog)
    assert len(warnings) == 1
    assert "Lovelace resource collection unavailable" in warnings[0]
    expected_type = "LovelaceData" if has_lovelace_data else "NoneType"
    assert f"(lovelace data: {expected_type})" in warnings[0]


OUR_CONFIG: dict[str, Any] = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}


async def test_dashboard_appears_with_a_title_and_can_be_taken_over(
    hass, hass_ws_client
) -> None:
    """The row on the dashboards page has our title, and "take control" saves."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "lovelace/dashboards/list"})
    rows = (await client.receive_json())["result"]
    ours = next(r for r in rows if r["url_path"] == DASHBOARD_URL_PATH)
    assert ours["title"] == DASHBOARD_TITLE

    # 1.3.1 shipped with no panel at all: the dashboards list reads a different
    # dict, so it alone would not have caught that.
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]

    stored = await async_dashboard_config(hass)
    assert stored["strategy"]["type"] == DASHBOARD_STRATEGY_TYPE

    await client.send_json_auto_id(
        {
            "type": "lovelace/config/save",
            "url_path": DASHBOARD_URL_PATH,
            "config": {"views": [{"title": "Mine", "cards": []}]},
        }
    )
    assert (await client.receive_json())["success"] is True


async def test_removing_the_entry_removes_only_our_dashboard(hass) -> None:
    """Deleting the entry takes our row and panel, and leaves the user's own."""
    entry = await async_owned_entry(hass)
    theirs = await async_user_dashboard(hass)
    await setup_integration(hass, entry)

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert rows_on_url_path(hass) == []
    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]
    assert rows_on_url_path(hass, USER_DASHBOARD_PATH) == [theirs]
    assert (
        await async_dashboard_config(hass, USER_DASHBOARD_PATH) == USER_DASHBOARD_CONFIG
    )


async def test_removing_the_entry_leaves_a_dashboard_the_user_took_over(
    hass,
) -> None:
    """After "take control" the dashboard is the user's and survives removal."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    mine = {"views": [{"title": "Mine", "cards": [{"type": "markdown"}]}]}
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(mine)

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert len(rows_on_url_path(hass)) == 1
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    assert await async_dashboard_config(hass) == mine


async def test_an_entry_that_owns_no_dashboard_never_touches_one(
    hass, config_entry
) -> None:
    """
    A strategy dashboard the user made on our url path survives everything.

    Up to 2.2.5, with the dashboard option off, every setup and reload deleted
    any dashboard on /apollo-mmwave whose config was our strategy, including
    one the user built by hand (X03). Setup, reload and removal now write no
    dashboard at all for an entry that owns none.
    """
    theirs = await async_user_dashboard(hass, DASHBOARD_URL_PATH, OUR_CONFIG)

    with record_dashboard_writes(hass) as writes:
        await setup_integration(hass, config_entry)
        assert await hass.config_entries.async_reload(config_entry.entry_id)
        await hass.async_block_till_done()
        await hass.config_entries.async_remove(config_entry.entry_id)
        await hass.async_block_till_done()

    assert writes == []
    assert rows_on_url_path(hass) == [theirs]
    assert await async_dashboard_config(hass) == OUR_CONFIG
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]


def _our_resource_urls(hass) -> list[str]:
    """Return the url of every resource row under our static path."""
    return [
        str(i.get("url", ""))
        for i in hass.data[LOVELACE_DATA].resources.async_items()
        if str(i.get("url", "")).startswith("/apollo_mmwave/")
    ]


async def test_removing_the_entry_removes_its_resource_rows(
    hass, config_entry, caplog
) -> None:
    """
    Deleting the entry deletes both bundles' rows and nobody else's.

    Nothing serves /apollo_mmwave/ after the next restart, so the rows used to
    stay behind and make every dashboard load fetch two 404s.
    """
    resources = await _resources_before_setup(hass)
    await resources.async_create_item({"res_type": "js", "url": FOREIGN_URL})
    await setup_integration(hass, config_entry)
    assert sorted(_our_resource_urls(hass)) == sorted(await _current_urls(hass))

    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()

    assert _our_resource_urls(hass) == []
    foreign = [i for i in resources.async_items() if i["url"] == FOREIGN_URL]
    assert len(foreign) == 1
    assert foreign[0]["type"] == "js"
    assert apollo_warnings(caplog) == []


async def test_rows_from_an_earlier_run_are_removed_without_a_setup(
    hass, hass_storage, config_entry
) -> None:
    """
    An entry that never set up this run still takes its rows with it.

    The resource collection loads lazily, so the rows are only in storage
    until something loads it; the removal has to load it first.
    """
    hass_storage["lovelace_resources"] = {
        "version": 1,
        "key": "lovelace_resources",
        "data": {
            "items": [
                {"id": "ours", "type": "module", "url": f"{TUNING_URL}?v=2.2.0"},
                {"id": "theirs", "type": "js", "url": FOREIGN_URL},
            ]
        },
    }
    assert await async_setup_component(hass, "lovelace", {})
    config_entry.add_to_hass(hass)

    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()

    items = hass.data[LOVELACE_DATA].resources.async_items()
    assert [i["id"] for i in items] == ["theirs"]


async def test_adding_the_entry_again_puts_the_rows_back(hass, config_entry) -> None:
    """
    An entry added again without a restart gets its rows back.

    The static paths stay registered for the rest of the run, so the once per
    run asset setup is skipped; only the rows are recreated.
    """
    await setup_integration(hass, config_entry)
    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()
    assert _our_resource_urls(hass) == []

    again = make_entry()
    await setup_integration(hass, again)

    assert sorted(_our_resource_urls(hass)) == sorted(await _current_urls(hass))
    assert _our_extra_module_urls(hass) == set(await _current_urls(hass))

    # A reload after that leaves them alone, as before.
    assert await hass.config_entries.async_reload(again.entry_id)
    await hass.async_block_till_done()
    assert len(_our_resource_urls(hass)) == len(JS_BUNDLES)


@pytest.mark.parametrize("ours_listed", [True, False], ids=["listed", "not-listed"])
async def test_removal_with_yaml_resources_names_the_rows_to_delete(
    hass, hass_storage, config_entry, caplog, ours_listed
) -> None:
    """
    YAML-mode resources are read-only: removal names our rows and goes on.

    Nothing is raised, the stores still go, and a YAML config that lists
    none of our rows gets no warning at all.
    """
    current = await _current_tuning_url(hass)
    listed = [{"url": FOREIGN_URL, "type": "js"}]
    if ours_listed:
        listed.insert(0, {"url": current, "type": "module"})
    assert await async_setup_component(
        hass,
        "lovelace",
        {"lovelace": {"resource_mode": "yaml", "resources": listed}},
    )
    await setup_integration(hass, config_entry)
    assert f"{DOMAIN}.zones" in hass_storage
    caplog.clear()

    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()

    assert hass.config_entries.async_get_entry(config_entry.entry_id) is None
    assert f"{DOMAIN}.zones" not in hass_storage
    assert hass.data[LOVELACE_DATA].resources.async_items() == listed
    warnings = apollo_warning_records(caplog)
    if not ours_listed:
        assert warnings == []
        return
    assert len(warnings) == 1
    assert warnings[0].exc_info is None
    message = warnings[0].getMessage()
    assert "managed in YAML" in message
    assert message.endswith(f": {current}")
    assert FOREIGN_URL not in message


@pytest.mark.parametrize(
    ("source", "rows_kept"),
    [("user", True), ("ignore", False)],
    ids=["second-entry", "ignored-entry"],
)
async def test_another_entry_keeps_the_resource_rows(
    hass, config_entry, source, rows_kept
) -> None:
    """
    The rows stay while another Apollo mmWave entry is still there.

    The config flow allows one entry, so a second one only comes from
    somewhere else. An ignored entry sets nothing up and does not count.
    """
    await setup_integration(hass, config_entry)
    other = MockConfigEntry(
        domain=DOMAIN,
        title="Apollo mmWave",
        data={},
        options={CONF_DASHBOARD_ID: None, CONF_DASHBOARD_URL_PATH: None},
        unique_id=f"{DOMAIN}_other",
        source=source,
    )
    other.add_to_hass(hass)

    await hass.config_entries.async_remove(config_entry.entry_id)
    await hass.async_block_till_done()

    expected = len(JS_BUNDLES) if rows_kept else 0
    assert len(_our_resource_urls(hass)) == expected

    if rows_kept:
        # Removing the last one takes them.
        await hass.config_entries.async_remove(other.entry_id)
        await hass.async_block_till_done()
        assert _our_resource_urls(hass) == []


async def test_a_failed_resource_removal_is_logged_and_the_removal_goes_on(
    hass, hass_storage, config_entry, caplog
) -> None:
    """A resource collection that raises never stops the stores from going."""
    await setup_integration(hass, config_entry)
    assert f"{DOMAIN}.zones" in hass_storage
    resources = hass.data[LOVELACE_DATA].resources

    with patch.object(
        resources,
        "async_delete_item",
        AsyncMock(side_effect=HomeAssistantError("storage is read-only")),
    ):
        await hass.config_entries.async_remove(config_entry.entry_id)
        await hass.async_block_till_done()

    assert f"{DOMAIN}.zones" not in hass_storage
    records = apollo_warning_records(caplog)
    assert len(records) == 1
    assert "could not remove the Lovelace resources" in records[0].getMessage()
    assert records[0].exc_info is not None
    # Home Assistant's own "Error calling entry remove callback" never fires.
    assert "Error calling entry remove callback" not in caplog.text


async def test_an_entry_added_after_a_partial_removal_gets_every_row_back(
    hass, config_entry
) -> None:
    """
    A removal that fails halfway still lets an entry added again recreate rows.

    The rows deleted before the failure stay deleted. One of them can be the
    tuning bundle, which carries the dashboard strategy, and a reload does not
    put it back, so the re-add has to.
    """
    await setup_integration(hass, config_entry)
    resources = hass.data[LOVELACE_DATA].resources
    real_delete = resources.async_delete_item
    calls = 0

    async def delete_then_fail(item_id: str) -> None:
        nonlocal calls
        calls += 1
        if calls > 1:
            msg = "storage is read-only"
            raise HomeAssistantError(msg)
        await real_delete(item_id)

    with patch.object(resources, "async_delete_item", delete_then_fail):
        await hass.config_entries.async_remove(config_entry.entry_id)
        await hass.async_block_till_done()
    assert calls == len(JS_BUNDLES)
    assert len(_our_resource_urls(hass)) == len(JS_BUNDLES) - 1

    again = make_entry()
    await setup_integration(hass, again)

    assert sorted(_our_resource_urls(hass)) == sorted(await _current_urls(hass))


async def test_unreachable_dashboards_collection_is_warned_about(hass, caplog) -> None:
    """
    Without the dashboards collection, nothing is written and nothing raises.

    The collection is borrowed from a websocket handler rather than a public
    API, so if Lovelace moves it the create warning names the Community
    dashboards picker and the strategy to add by hand.
    """
    assert await async_setup_component(hass, "lovelace", {})
    with patch.object(apollo_frontend, "_dashboards_collection", return_value=None):
        assert await async_create_dashboard(hass, require_admin=True) is None
        [created] = apollo_warnings(caplog)
        assert "could not reach Lovelace's dashboards collection" in created
        assert "Add dashboard > Apollo Radar Tuning" in created
        assert DASHBOARD_STRATEGY_TYPE in created
        caplog.clear()

        # Nothing is known, so the options flow keeps what the entry recorded.
        assert (
            await async_dashboard_owned(hass, "apollo_mmwave", "apollo-mmwave") is None
        )
        assert not await async_set_dashboard_devices(
            hass, "apollo_mmwave", DASHBOARD_URL_PATH, ["dev1"]
        )
        assert apollo_warnings(caplog) == []

        assert not await async_remove_dashboard(
            hass, "apollo_mmwave", DASHBOARD_URL_PATH
        )
        [removed] = apollo_warnings(caplog)
        assert "was not removed" in removed
        caplog.clear()

        # Unknown, not none: the migration records nothing and looks again.
        with pytest.raises(DashboardsUnreadableError):
            await async_find_legacy_dashboard(hass)
        [legacy] = apollo_warnings(caplog)
        assert "is not tracked yet" in legacy

    assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
    assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]


async def test_reloading_the_entry_keeps_the_users_dashboard_edits(hass) -> None:
    """A reload must not delete and recreate the row, wiping renames and icons."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    collection = _dashboards_collection(hass)
    [item] = rows_on_url_path(hass)
    await collection.async_update_item(
        item["id"], {"title": "Radar", "icon": "mdi:home", "show_in_sidebar": False}
    )

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    [item] = rows_on_url_path(hass)
    assert item["title"] == "Radar"
    assert item["icon"] == "mdi:home"
    assert item["show_in_sidebar"] is False


async def test_a_new_dashboard_on_our_url_path_is_never_written_to(
    hass, caplog
) -> None:
    """A user's own dashboard here has no config yet; that is not a free space."""
    # No stored Lovelace config, exactly like one made in the UI and not yet
    # opened.
    theirs = await async_user_dashboard(hass, DASHBOARD_URL_PATH, config=None)

    assert await async_create_dashboard(hass, require_admin=True) is None
    [warning] = apollo_warnings(caplog)
    assert f"another dashboard already uses /{DASHBOARD_URL_PATH}" in warning

    # Even with its id recorded, nothing of ours is there to write or delete.
    assert await async_dashboard_owned(hass, theirs["id"], DASHBOARD_URL_PATH) is False
    assert not await async_set_dashboard_devices(
        hass, theirs["id"], DASHBOARD_URL_PATH, ["dev1"]
    )
    assert await async_remove_dashboard(hass, theirs["id"], DASHBOARD_URL_PATH)
    await hass.async_block_till_done()

    assert rows_on_url_path(hass) == [theirs]
    assert await async_dashboard_config(hass) is None


async def test_taken_over_dashboard_is_never_overwritten_or_deleted(hass) -> None:
    """Once the strategy key is gone the config is the user's, not ours."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    dashboard_id = entry.options[CONF_DASHBOARD_ID]
    mine = {"views": [{"title": "Mine", "cards": [{"type": "markdown"}]}]}
    await hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH].async_save(mine)

    assert await async_dashboard_owned(hass, dashboard_id, DASHBOARD_URL_PATH) is False
    assert not await async_set_dashboard_devices(
        hass, dashboard_id, DASHBOARD_URL_PATH, ["dev1"]
    )
    assert await async_dashboard_config(hass) == mine

    # Removing reports nothing of ours left, and deletes nothing.
    assert await async_remove_dashboard(hass, dashboard_id, DASHBOARD_URL_PATH)
    await hass.async_block_till_done()
    assert DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards
    assert await async_dashboard_config(hass) == mine


async def test_only_the_recorded_row_is_ours(hass) -> None:
    """Another id or url path than the entry recorded is never ours."""
    entry = await async_owned_entry(hass)
    await async_user_dashboard(hass)
    dashboard_id = entry.options[CONF_DASHBOARD_ID]

    assert await async_dashboard_owned(hass, dashboard_id, DASHBOARD_URL_PATH)
    assert not await async_dashboard_owned(hass, None, None)
    assert not await async_dashboard_owned(hass, "gone", DASHBOARD_URL_PATH)
    assert not await async_dashboard_owned(hass, dashboard_id, USER_DASHBOARD_PATH)
    assert not await async_set_dashboard_devices(
        hass, dashboard_id, USER_DASHBOARD_PATH, ["dev1"]
    )
    assert await async_remove_dashboard(hass, dashboard_id, USER_DASHBOARD_PATH)
    await hass.async_block_till_done()

    assert await async_dashboard_config(hass) == OUR_CONFIG
    assert (
        await async_dashboard_config(hass, USER_DASHBOARD_PATH) == USER_DASHBOARD_CONFIG
    )


async def test_user_added_strategy_options_survive_a_device_write(hass) -> None:
    """`distance_unit` typed into the raw editor is not ours to erase."""
    entry = await async_owned_entry(hass)
    await setup_integration(hass, entry)
    dashboard_id = entry.options[CONF_DASHBOARD_ID]
    dashboard = hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH]
    await dashboard.async_save(
        {"strategy": {"type": DASHBOARD_STRATEGY_TYPE, "distance_unit": "ft"}}
    )

    assert await async_set_dashboard_devices(
        hass, dashboard_id, DASHBOARD_URL_PATH, ["dev1"]
    )
    stored = await async_dashboard_config(hass)
    assert stored["strategy"] == {
        "type": DASHBOARD_STRATEGY_TYPE,
        "distance_unit": "ft",
        "devices": ["dev1"],
    }

    # Clearing the selection drops `devices` and keeps the user's key.
    assert await async_set_dashboard_devices(hass, dashboard_id, DASHBOARD_URL_PATH, [])
    stored = await async_dashboard_config(hass)
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
    assert [i["id"] for i in rows_on_url_path(hass)] == [STALE_ROW["id"]]


async def test_a_yaml_dashboard_on_our_url_path_is_left_alone(hass, caplog) -> None:
    """
    A YAML dashboard already on our url path gets no row, now or on removal.

    Lovelace refuses a second panel on a path a YAML dashboard holds, so
    creating one anyway would log a traceback; and the dashboard is the
    user's, so removing the integration leaves it standing.
    """
    assert await async_setup_component(
        hass, "lovelace", {"lovelace": {"dashboards": YAML_DASHBOARDS}}
    )

    assert await async_create_dashboard(hass, require_admin=True) is None

    assert rows_on_url_path(hass) == []
    assert isinstance(
        hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH], LovelaceYAML
    )
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    [warning] = apollo_warning_records(caplog)
    assert warning.exc_info is None
    assert f"another dashboard already uses /{DASHBOARD_URL_PATH}" in (
        warning.getMessage()
    )
    caplog.clear()

    entry = make_entry()
    await setup_integration(hass, entry)
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert isinstance(
        hass.data[LOVELACE_DATA].dashboards.get(DASHBOARD_URL_PATH), LovelaceYAML
    )
    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    assert rows_on_url_path(hass) == []
    assert apollo_warnings(caplog) == []


async def test_yaml_dashboard_on_our_path_is_never_removed(
    hass, hass_storage, caplog
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
        # The entry even records the stale row as its own.
        entry = make_entry(STALE_ROW["id"])
        await setup_integration(hass, entry)
        _assert_yaml_dashboard_untouched(hass)

        await hass.config_entries.async_remove(entry.entry_id)
        await hass.async_block_till_done()
        _assert_yaml_dashboard_untouched(hass)

    assert apollo_warnings(caplog) == []


async def test_yaml_dashboard_on_our_path_is_not_written_to(
    hass, hass_storage, caplog
) -> None:
    """
    A stale row never makes us save a device selection onto a YAML dashboard.

    A device selection makes the wanted config differ from the YAML one, and
    saving it onto the YAML dashboard raised and logged a traceback.
    """
    yaml_config = {"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}
    load = AsyncMock(return_value=yaml_config)
    save = AsyncMock()
    with (
        patch.object(LovelaceYAML, "async_load", load),
        patch.object(LovelaceYAML, "async_save", save),
    ):
        await _yaml_dashboard_over_a_stale_row(hass, hass_storage)

        assert not await async_set_dashboard_devices(
            hass, STALE_ROW["id"], DASHBOARD_URL_PATH, ["dev1"]
        )
        await hass.async_block_till_done()
        _assert_yaml_dashboard_untouched(hass)

    save.assert_not_awaited()
    assert apollo_warnings(caplog) == []


async def test_failed_first_config_save_does_not_strand_the_row(hass, caplog) -> None:
    """
    A row whose first config save fails is rolled back, so a retry works.

    Left behind with no config it read as not ours forever: Lovelace showed it
    as an auto-generated dashboard, and nothing here could fill or remove it.
    """
    assert await async_setup_component(hass, "lovelace", {})
    real_save = LovelaceStorage.async_save
    failures: list[str] = []

    async def save_failing_once(self, config) -> None:
        if self.url_path == DASHBOARD_URL_PATH and not failures:
            failures.append(DASHBOARD_URL_PATH)
            msg = "simulated save failure"
            raise HomeAssistantError(msg)
        await real_save(self, config)

    with patch.object(LovelaceStorage, "async_save", save_failing_once):
        assert await async_create_dashboard(hass, require_admin=True) is None

        assert failures == [DASHBOARD_URL_PATH]
        assert rows_on_url_path(hass) == []
        assert DASHBOARD_URL_PATH not in hass.data[LOVELACE_DATA].dashboards
        assert DASHBOARD_URL_PATH not in hass.data[DATA_PANELS]
        [warning] = apollo_warnings(caplog)
        assert "could not create the 'Apollo mmWave' dashboard" in warning
        assert "Add dashboard > Apollo Radar Tuning" in warning

        assert await async_create_dashboard(hass, require_admin=True)

    assert DASHBOARD_URL_PATH in hass.data[DATA_PANELS]
    assert await async_dashboard_config(hass) == OUR_CONFIG
