"""
Frontend wiring for Apollo mmWave.

This integration ships its own Lovelace frontend so users install ONE thing:

1. ``async_register_frontend_assets`` serves the bundled JS (the radar-tuning
   cards + dashboard strategy, and the zone-drawing card) from
   ``custom_components/apollo_mmwave/www`` and registers each bundle twice:

   - as a Lovelace *resource* (storage mode), so browser tabs that were open
     before the integration loaded pick the modules up on the next dashboard
     navigation — no page reload needed; and
   - as an extra JS URL, which covers YAML-mode Lovelace where the resource
     collection is read-only. Both point at the same versioned URL, so the
     browser's module cache loads the code exactly once.

   Removing the config entry deletes the resource rows again
   (``async_remove_lovelace_resources``), so they do not 404 once nothing
   serves the files.

2. ``async_create_dashboard`` creates an ordinary storage dashboard named
   "Apollo mmWave" in Lovelace's dashboards collection, and saves
   ``{"strategy": {"type": "custom:apollo-radar-tuning"}}`` as its config. The
   frontend strategy re-runs on every load, detecting each Apollo mmWave device
   and building one tab per device, so the dashboard self-updates as devices
   come and go (no stored card layout to drift).

   It runs only when an administrator asks for the dashboard, in the config
   flow or the options flow, and the entry records the new row's id and url
   path. Setup and reloads never write a dashboard. The only later writes are
   explicit options flow actions on that recorded row (the device selection,
   and removal), plus its deletion when the entry is removed. Each one first
   checks that the row still exists and that its own config is still our
   strategy, so a dashboard the user took control of, or made themselves, is
   never written to or deleted. Title, icon, sidebar visibility and admin-only
   are written once, at creation, and belong to the user from then on.

   It is a real collection item rather than a synthetic read-only config so
   that users get the things Home Assistant already builds for storage
   dashboards: a title on the dashboards settings page, and a working "take
   control" for anyone who wants to customize it.

Lovelace internals (``hass.data[LOVELACE_DATA]`` and the dashboards collection
behind the ``lovelace/dashboards`` websocket API) are not a public contract, so
every runtime touch is wrapped defensively: if the shape ever changes we log
and continue without the dashboard rather than breaking setup or a flow. The
``lovelace.const`` and ``websocket_api.const`` names below are imported when
the module loads, so one that moved upstream would fail the integration's
load instead. They have been stable for many releases, and ``LOVELACE_DATA``
is needed for the resource registration anyway.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    CONF_URL_PATH,
    LOVELACE_DATA,
    MODE_STORAGE,
    ConfigNotFound,
)
from homeassistant.components.websocket_api.const import (
    DOMAIN as WEBSOCKET_API_DOMAIN,
)
from homeassistant.loader import async_get_integration

from .const import (
    DASHBOARD_ICON,
    DASHBOARD_STRATEGY_TYPE,
    DASHBOARD_TITLE,
    DASHBOARD_URL_PATH,
    DATA_ASSETS_REGISTERED,
    DATA_RESOURCE_URLS,
    DATA_RESOURCES_REMOVED,
    DOMAIN,
    FRONTEND_DIR,
    JS_BUNDLES,
    STATIC_URL_BASE,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def _frontend_path() -> Path:
    """Return the absolute path to the bundled ``www`` directory."""
    return Path(__file__).parent / FRONTEND_DIR


def _existing_bundles(base: Path) -> list[str]:
    """Return the names in ``JS_BUNDLES`` that have a file under ``base``."""
    # Each check is a stat on the disk, so callers run this in the executor.
    return [name for name in JS_BUNDLES if (base / name).is_file()]


def _base_url(item: dict[str, Any]) -> str:
    """Return a resource row's url with the ``?v=`` cache-buster stripped."""
    return str(item.get("url", "")).partition("?")[0]


async def async_register_frontend_assets(hass: HomeAssistant) -> None:
    """Serve and register the bundled JS so the cards/strategy load globally."""
    # TODO(REVIEW_REPORT.md X28): a reload skips resources.  # noqa: FIX002, TD003
    # This guard also skips the resource reconciliation, so a deleted resource
    # row only comes back at the next restart. Keep static paths and
    # add_extra_js_url once per run, but run _async_register_lovelace_resources
    # on every setup, with a reload-recreates-the-row test.
    data = hass.data.setdefault(DOMAIN, {})
    if data.get(DATA_ASSETS_REGISTERED):
        # Removing the entry deleted the rows but cannot take back the static
        # paths, so an entry added again in this run puts only the rows back.
        if data.pop(DATA_RESOURCES_REMOVED, False):
            await _async_register_lovelace_resources(
                hass, data.get(DATA_RESOURCE_URLS, [])
            )
        return

    base = _frontend_path()
    try:
        version = (await async_get_integration(hass, DOMAIN)).version or "0"
    except Exception:  # noqa: BLE001 - version is only used for cache-busting
        version = "0"

    present = await hass.async_add_executor_job(_existing_bundles, base)
    static_paths: list[StaticPathConfig] = []
    js_urls: list[str] = []
    for name in JS_BUNDLES:
        if name not in present:
            _LOGGER.warning(
                "Apollo mmWave: bundled frontend asset %s is missing; the"
                " dashboard may not render until the integration is rebuilt.",
                name,
            )
            continue
        static_paths.append(
            StaticPathConfig(f"{STATIC_URL_BASE}/{name}", str(base / name), True)  # noqa: FBT003
        )
        js_urls.append(f"{STATIC_URL_BASE}/{name}?v={version}")

    if static_paths:
        await hass.http.async_register_static_paths(static_paths)
    for url in js_urls:
        frontend.add_extra_js_url(hass, url)
    await _async_register_lovelace_resources(hass, js_urls)
    data[DATA_RESOURCE_URLS] = js_urls
    data[DATA_ASSETS_REGISTERED] = True
    data.pop(DATA_RESOURCES_REMOVED, None)


async def _async_register_lovelace_resources(
    hass: HomeAssistant, js_urls: list[str]
) -> None:
    """
    Register the bundled JS in the Lovelace resource collection (storage mode).

    ``add_extra_js_url`` only reaches pages loaded *after* registration — a tab
    that was open before install never gets the module and the dashboard times
    out waiting for the strategy element. Resources are fetched over websocket
    whenever a Lovelace panel initializes, so they reach existing tabs too.

    The resource collection is not a public contract (same as the dashboards
    dict), so failures can't break setup — but they must be LOUD: browsers with
    a cached app shell never see extra JS urls, so without the resource the
    dashboard times out waiting for the strategy element and only a hard
    refresh recovers. Every non-success branch logs at warning with the reason.

    Each bundle keeps exactly one row. A second row for the same bundle (an
    old ``?v=`` copy, or one added by hand without the cache-buster) makes the
    browser fetch and run the module twice, and an un-versioned copy is served
    with the long cache header and never busted, so the extras are deleted.
    The row that stays is repointed at the current version as a ``module``: a
    row added by hand as a classic ``js`` script throws on the bundle's
    top-level ``export``.

    Entries under our static path that are no longer in ``JS_BUNDLES`` are
    deleted, so renaming a bundle does not leave a 404 behind on upgrade.
    """
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        resources = getattr(lovelace_data, "resources", None)
        if resources is None:
            _LOGGER.warning(
                "Apollo mmWave: Lovelace resource collection unavailable"
                " (lovelace data: %s); cards may not load in already-open"
                " browser tabs until a hard refresh (Ctrl/Cmd+Shift+R).",
                type(lovelace_data).__name__,
            )
            return
        if not hasattr(resources, "async_create_item"):
            # The urls stay last so no punctuation trails them: a "." copied
            # onto a ?v= gives a url unlike the extra module url, which then
            # loads the bundle a second time.
            _LOGGER.warning(
                "Apollo mmWave: Lovelace resources are managed in YAML on this"
                " system (%s), so they can't be registered automatically. Add"
                " the module resources listed at the end of this message to"
                " your lovelace resources config, or the dashboard/cards won't"
                " load without a hard refresh. Each ?v= is the current"
                " integration version: after every upgrade, replace each"
                " bundle's existing row with its new url instead of adding a"
                " second row, which would load the bundle twice. Resources: %s",
                type(resources).__name__,
                ", ".join(js_urls),
            )
            return
        # Grouped by url with the ?v= cache-buster stripped, so a second row
        # for one bundle is seen instead of hiding behind the last.
        ours = await _async_our_resource_rows(resources)
        by_base: dict[str, list[dict[str, Any]]] = {}
        for item in ours:
            by_base.setdefault(_base_url(item), []).append(item)

        created: list[str] = []
        updated: list[str] = []
        duplicate_ids: set[str] = set()
        for url in js_urls:
            rows = by_base.get(url.partition("?")[0], [])
            if not rows:
                await resources.async_create_item({"res_type": "module", "url": url})
                created.append(url)
                continue
            # Keep one row, preferring one already at this version.
            item = next((row for row in rows if row.get("url") == url), rows[0])
            duplicate_ids.update(row["id"] for row in rows if row is not item)
            if item.get("url") != url or item.get("type") != "module":
                # Same bundle, older ?v= cache-buster or a classic "js" row:
                # point it at this version as a module.
                await resources.async_update_item(
                    item["id"], {"url": url, "res_type": "module"}
                )
                updated.append(url)

        removed = await _async_remove_stale_resources(resources, ours, duplicate_ids)

        if created or updated or removed:
            _LOGGER.info(
                "Apollo mmWave: Lovelace resources registered (created: %s;"
                " updated: %s; removed: %s)",
                created or "none",
                updated or "none",
                removed or "none",
            )
        else:
            _LOGGER.debug("Apollo mmWave: Lovelace resources already current.")
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not register Lovelace resources; the"
            " dashboard/cards won't load in browsers with a cached app shell"
            " until a hard refresh. Please report this traceback:",
            exc_info=True,
        )


async def _async_our_resource_rows(resources: Any) -> list[dict[str, Any]]:
    """
    Return every resource row under our static path, duplicates included.

    Only rows below ``/apollo_mmwave/`` are ever looked at, so nothing here can
    reach another integration's or the user's own resources.
    """
    # The storage collection loads lazily: async_items() reads [] until it
    # has loaded. async_get_info() loads it first, the way Home Assistant's
    # own resource count does, without setting the private flag by hand. The
    # YAML collection reports itself loaded.
    if not getattr(resources, "loaded", True):
        await resources.async_get_info()
    prefix = f"{STATIC_URL_BASE}/"
    return [
        item
        for item in resources.async_items()
        if str(item.get("url", "")).startswith(prefix)
    ]


async def _async_remove_stale_resources(
    resources: Any,
    items: list[dict[str, Any]],
    duplicate_ids: set[str],
    bundles: Iterable[str] = JS_BUNDLES,
) -> list[str]:
    """
    Delete resource entries under our static path that we no longer ship.

    Renaming a bundle strands the old entry: nothing in ``JS_BUNDLES`` matches
    it, so it survives untouched and points at a file that no longer exists,
    and every dashboard load fetches a 404. ``JS_BUNDLES`` is the full list of
    what we serve, so anything else below ``/apollo_mmwave/`` is ours and dead.
    Nothing outside that prefix is ever touched.

    ``items`` is every row under our static path, duplicates included, and
    ``duplicate_ids`` names the extra rows for a bundle that already kept one.
    ``bundles`` is what is still served; entry removal passes none, so every
    row under the prefix goes.
    """
    if not hasattr(resources, "async_delete_item"):
        return []
    prefix = f"{STATIC_URL_BASE}/"
    shipped = {f"{prefix}{name}" for name in bundles}
    removed: list[str] = []
    for item in items:
        url = _base_url(item)
        if not url.startswith(prefix):
            continue
        if url not in shipped or item["id"] in duplicate_ids:
            await resources.async_delete_item(item["id"])
            removed.append(str(item.get("url", "")))
    return removed


async def async_remove_lovelace_resources(hass: HomeAssistant) -> None:
    """
    Delete our Lovelace resource rows when the integration is removed.

    Nothing serves ``/apollo_mmwave/`` once the entry is gone and Home
    Assistant restarts, so rows left behind make every dashboard load fetch
    two 404s. This is ``_async_remove_stale_resources`` with no bundle shipped
    any more: every row under our static path goes, and nothing else is
    touched.

    The static paths stay registered until Home Assistant stops (there is no
    API to drop one), and the extra module urls are left with them.
    ``async_register_frontend_assets`` skips both for the rest of the run, and
    the flag set here makes it recreate the rows for an entry added again in
    this run.

    YAML-mode resources are read-only, so their rows are named in a warning
    to delete by hand. Like registration, this must never break what called
    it: every failure is logged and swallowed, so the removal goes on.
    """
    try:
        resources = getattr(hass.data.get(LOVELACE_DATA), "resources", None)
        if resources is None:
            return
        ours = await _async_our_resource_rows(resources)
        if not hasattr(resources, "async_delete_item"):
            if ours:
                _LOGGER.warning(
                    "Apollo mmWave: Lovelace resources are managed in YAML on"
                    " this system, so they can't be removed automatically."
                    " Delete these rows from your lovelace resources config,"
                    " or every dashboard load fetches a missing file: %s",
                    ", ".join(str(item.get("url", "")) for item in ours),
                )
            return
        # Set before deleting: a delete that fails partway leaves the rows
        # already gone, and an entry added again must still recreate them.
        # Setting it when nothing was deleted is harmless, because the re-add
        # only creates missing rows.
        hass.data.setdefault(DOMAIN, {})[DATA_RESOURCES_REMOVED] = True
        removed = await _async_remove_stale_resources(resources, ours, set(), ())
        if removed:
            _LOGGER.info(
                "Apollo mmWave: removed Lovelace resources: %s", ", ".join(removed)
            )
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not remove the Lovelace resources. Delete"
            " the /apollo_mmwave/ rows in Settings > Dashboards > Resources.",
            exc_info=True,
        )


# The websocket command whose handler is bound to the live dashboards
# collection. See _dashboards_collection for why we go the long way round.
_WS_DASHBOARDS_LIST = "lovelace/dashboards/list"


def _dashboards_collection(hass: HomeAssistant) -> Any | None:
    """
    Return Lovelace's storage dashboards collection, or None if unreachable.

    Home Assistant 2026.10.0, and 2026.8.1 (the HACS floor), keep the
    collection in a local variable inside lovelace's own ``async_setup``;
    ``hass.data[LOVELACE_DATA]`` carries only
    mode/dashboards/resources/yaml_dashboards. The one live reference is the
    websocket CRUD object bound to the ``lovelace/dashboards/*`` commands, so
    borrow it from the command registry. Constructing our own
    ``DashboardsCollection`` is not an alternative: each instance rewrites the
    whole item list into the shared store, so two of them delete each other's
    dashboards.

    The likeliest way this breaks: since 2026.10 the CRUD object can register
    ``/list`` with ``admin_only``, which wraps the handler in
    ``require_admin``. The wrapper has no ``__self__``, so this would return
    None, and every caller falls back as it does for any unreachable
    collection.
    """
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        return None
    # Forward-compat only: no release defines this attribute as of 2026.10.0.
    # It is the preferred path if a future release puts it on the dataclass.
    collection = getattr(lovelace_data, "dashboards_collection", None)
    if collection is not None:
        return collection
    registered = hass.data.get(WEBSOCKET_API_DOMAIN) or {}
    entry = registered.get(_WS_DASHBOARDS_LIST)
    handler = entry[0] if isinstance(entry, tuple) else entry
    return getattr(getattr(handler, "__self__", None), "storage_collection", None)


def _row_by_id(collection: Any, dashboard_id: str) -> dict[str, Any] | None:
    """Return the collection row with this id, if there is one."""
    return next(
        (item for item in collection.async_items() if item.get("id") == dashboard_id),
        None,
    )


def _row_on_url_path(collection: Any, url_path: str) -> dict[str, Any] | None:
    """Return the collection row sitting on this url path, if there is one."""
    return next(
        (
            item
            for item in collection.async_items()
            if item.get(CONF_URL_PATH) == url_path
        ),
        None,
    )


async def _async_stored_config(
    hass: HomeAssistant, item: dict[str, Any]
) -> dict[str, Any] | None:
    """
    Return the row's own stored Lovelace config, or None if it has none.

    Lovelace registers YAML dashboards first and, when a storage row on the
    same url path loads later, keeps the YAML one and only warns. So the
    object holding the row's url path is not necessarily ``item``'s: reading
    its config would judge the row by someone else's dashboard, and writing or
    deleting on that verdict hits the YAML dashboard instead (deleting the
    row makes Lovelace drop whatever holds the path). Unless the holder is
    the row's own storage dashboard, the row is reported as having no config,
    which every caller already treats as not ours.
    """
    url_path = item.get(CONF_URL_PATH)
    config = hass.data[LOVELACE_DATA].dashboards.get(url_path)
    if config is None:
        return None
    if (
        getattr(config, "mode", None) != MODE_STORAGE
        or (config.config or {}).get("id") != item["id"]
    ):
        _LOGGER.debug(
            "Apollo mmWave: another dashboard holds url path %s; leaving the"
            " row alone.",
            url_path,
        )
        return None
    try:
        return await config.async_load(force=False)
    except ConfigNotFound:
        return None


def _is_ours(stored: dict[str, Any] | None) -> bool:
    """
    Report whether a stored config is still the strategy we generate.

    Anything else belongs to the user: they either took control (which strips
    the ``strategy`` key and replaces it with views) or built their own
    dashboard. Both must survive us untouched.
    """
    if not isinstance(stored, dict):
        return False
    strategy = stored.get("strategy")
    return (
        isinstance(strategy, dict) and strategy.get("type") == DASHBOARD_STRATEGY_TYPE
    )


def _desired_config(
    devices: list[str] | None, stored: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Build the strategy config for the given device selection.

    Only ``type`` and ``devices`` are ours. Anything else under ``strategy``
    (``distance_unit``, for one, is a user-settable strategy option; see
    docs/configuration.md) was typed into the raw config editor by the user,
    so a change to the device selection carries it over.
    """
    strategy: dict[str, Any] = {}
    if _is_ours(stored):
        strategy.update(stored["strategy"])  # type: ignore[index]
    strategy["type"] = DASHBOARD_STRATEGY_TYPE
    strategy.pop("devices", None)
    if devices:
        # Explicit selection: the strategy shows exactly these devices, online
        # or not, instead of auto-detecting live ones.
        strategy["devices"] = list(devices)
    return {"strategy": strategy}


async def _async_our_row(
    hass: HomeAssistant,
    collection: Any,
    dashboard_id: str | None,
    url_path: str | None,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """
    Return the entry's recorded row and its config, while it is still ours.

    The row must still exist under the recorded id and url path, and its own
    stored config must still be our strategy. Nothing else makes a dashboard
    ours: not its title, and not its url path alone. A dashboard the user took
    control of, or one they built on the same path after deleting ours, fails
    the config check and is left alone.
    """
    if not dashboard_id or not url_path:
        return None
    item = _row_by_id(collection, dashboard_id)
    if item is None or item.get(CONF_URL_PATH) != url_path:
        return None
    stored = await _async_stored_config(hass, item)
    if not _is_ours(stored):
        _LOGGER.debug(
            "Apollo mmWave: the dashboard at /%s is no longer ours; leaving it.",
            url_path,
        )
        return None
    return item, stored  # type: ignore[return-value]


# Where every warning about a dashboard that was not created sends the user.
_PICKER_HINT = (
    "Add one from Settings > Dashboards > Add dashboard > Apollo Radar Tuning"
    f" (strategy type '{DASHBOARD_STRATEGY_TYPE}')."
)


async def async_create_dashboard(
    hass: HomeAssistant,
    *,
    require_admin: bool,
    devices: list[str] | None = None,
) -> str | None:
    """
    Create the Apollo mmWave dashboard and return its collection id.

    Runs only when an administrator asks for the dashboard: when the config
    flow is submitted with the box ticked, or on the options flow's "add"
    step. Setup never calls it. Returns None, with a warning that points at
    the Community dashboards picker, when nothing was created: the dashboards
    collection is out of reach, another dashboard already holds the url path
    (it is left as it is), or a write failed. A row this call created is
    deleted again if its config could not be saved, so a failure never leaves
    a half-made dashboard behind.
    """
    collection: Any = None
    created: dict[str, Any] | None = None
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            _LOGGER.warning(
                "Apollo mmWave: could not reach Lovelace's dashboards collection,"
                " so the '%s' dashboard was not created. %s",
                DASHBOARD_TITLE,
                _PICKER_HINT,
            )
            return None
        if (
            DASHBOARD_URL_PATH in hass.data[LOVELACE_DATA].dashboards
            or _row_on_url_path(collection, DASHBOARD_URL_PATH) is not None
        ):
            # Lovelace refuses a second panel on the path, and whatever holds
            # it is not ours to replace.
            _LOGGER.warning(
                "Apollo mmWave: another dashboard already uses /%s, so the '%s'"
                " dashboard was not created and that one was left as it is. %s",
                DASHBOARD_URL_PATH,
                DASHBOARD_TITLE,
                _PICKER_HINT,
            )
            return None
        created = await collection.async_create_item(
            {
                CONF_URL_PATH: DASHBOARD_URL_PATH,
                CONF_TITLE: DASHBOARD_TITLE,
                CONF_ICON: DASHBOARD_ICON,
                CONF_SHOW_IN_SIDEBAR: True,
                CONF_REQUIRE_ADMIN: require_admin,
            }
        )
        dashboard = hass.data[LOVELACE_DATA].dashboards[DASHBOARD_URL_PATH]
        await dashboard.async_save(_desired_config(devices))
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not create the '%s' dashboard. %s Please"
            " report this traceback:",
            DASHBOARD_TITLE,
            _PICKER_HINT,
            exc_info=True,
        )
        if created is not None:
            await _async_roll_back_created_row(collection, created)
        return None
    _LOGGER.info(
        "Apollo mmWave: created the '%s' dashboard at /%s (administrators only:"
        " %s). It is never recreated or rewritten at startup; edit or delete it"
        " in Settings > Dashboards.",
        DASHBOARD_TITLE,
        DASHBOARD_URL_PATH,
        require_admin,
    )
    return str(created["id"])


async def _async_roll_back_created_row(collection: Any, item: dict[str, Any]) -> None:
    """
    Delete a row this call created but could not give its strategy config.

    Left in place it would have no config, which every later check reads as
    not ours, so it would stay in the sidebar as an empty dashboard that
    nothing here could repair or remove. Deleting it lets the administrator
    try again.
    """
    try:
        await collection.async_delete_item(item["id"])
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not remove the half-made '%s' dashboard; you"
            " can delete it in Settings > Dashboards.",
            DASHBOARD_TITLE,
            exc_info=True,
        )


async def async_dashboard_owned(
    hass: HomeAssistant, dashboard_id: str | None, url_path: str | None
) -> bool | None:
    """
    Report whether the entry's recorded dashboard is still ours. Read only.

    True while the row exists and its config is still our strategy. False when
    nothing is recorded, the row is gone, or it is no longer ours. None when
    the dashboards collection cannot be read, so nothing is known.
    """
    if not dashboard_id:
        return False
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            return None
        return (
            await _async_our_row(hass, collection, dashboard_id, url_path) is not None
        )
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not read the dashboards to find the '%s' dashboard.",
            DASHBOARD_TITLE,
            exc_info=True,
        )
        return None


async def async_set_dashboard_devices(
    hass: HomeAssistant,
    dashboard_id: str | None,
    url_path: str | None,
    devices: list[str] | None,
) -> bool:
    """
    Write the device selection into our dashboard's strategy config.

    Called only from the options flow, when an administrator saves the
    selection. Only the recorded row is written, and only while its config is
    still our strategy; any key the user added under ``strategy`` is kept.
    Returns False, writing nothing, when that row is gone or no longer ours,
    the dashboards cannot be read, or the write failed.
    """
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            _LOGGER.warning(
                "Apollo mmWave: could not reach Lovelace's dashboards collection,"
                " so the device selection was not written into the '%s'"
                " dashboard.",
                DASHBOARD_TITLE,
            )
            return False
        found = await _async_our_row(hass, collection, dashboard_id, url_path)
        if found is None:
            return False
        item, stored = found
        desired = _desired_config(devices, stored)
        if stored != desired:
            # async_save fires the lovelace_updated event, so open tabs pick
            # up the new selection without a reload.
            dashboard = hass.data[LOVELACE_DATA].dashboards[item[CONF_URL_PATH]]
            await dashboard.async_save(desired)
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not write the device selection into the '%s'"
            " dashboard.",
            DASHBOARD_TITLE,
            exc_info=True,
        )
        return False
    return True


async def async_remove_dashboard(
    hass: HomeAssistant, dashboard_id: str | None, url_path: str | None
) -> bool:
    """
    Delete the dashboard this entry created, and nothing else.

    Runs only on the options flow's "remove" step and when the entry is
    removed. The row is found by its recorded id and deleted only while its
    own config is still our strategy, so a dashboard the user took control of
    or built themselves is never deleted. Deleting the row is what removes
    the sidebar panel and the stored config; Lovelace does both from its own
    collection listener.

    Returns True when nothing of ours is left: it was deleted, nothing was
    recorded, or the row is gone or no longer ours. Returns False when the
    dashboards could not be read or the delete failed.
    """
    if not dashboard_id:
        return True
    try:
        collection = _dashboards_collection(hass)
        if collection is None:
            _LOGGER.warning(
                "Apollo mmWave: could not reach Lovelace's dashboards collection,"
                " so the '%s' dashboard was not removed. You can delete it in"
                " Settings > Dashboards.",
                DASHBOARD_TITLE,
            )
            return False
        found = await _async_our_row(hass, collection, dashboard_id, url_path)
        if found is None:
            return True
        await collection.async_delete_item(found[0]["id"])
    except Exception:
        _LOGGER.warning(
            "Apollo mmWave: could not remove the '%s' dashboard. You can delete"
            " it in Settings > Dashboards.",
            DASHBOARD_TITLE,
            exc_info=True,
        )
        return False
    _LOGGER.info("Apollo mmWave: removed the '%s' dashboard.", DASHBOARD_TITLE)
    return True


class DashboardsUnreadableError(Exception):
    """The dashboards could not be read, so what they hold is unknown."""


# The end of every warning about an earlier release's dashboard that could not
# be looked up.
_LEGACY_RETRY_HINT = (
    "It is left as it is, and Apollo mmWave looks for it again at the next start."
)


async def async_find_legacy_dashboard(hass: HomeAssistant) -> str | None:
    """
    Return the id of the dashboard 2.2.5 and earlier kept on our url path.

    Read only, and used once: ``async_migrate_entry`` calls it for an entry
    whose "auto-create dashboard" option was on, to record that row as ours
    without writing to it. The row counts only when its own stored config is
    a strategy config of ours and nothing more: a single top-level
    ``strategy`` key with our type, which is what those releases saved (keys
    the user typed under ``strategy`` included). A dashboard the user took
    control of, and a YAML dashboard on the path, are not adopted. Returns
    None when there is no such row.

    Raises ``DashboardsUnreadableError`` when the dashboards cannot be read.
    That means "unknown", not "none": the migration then records nothing and
    tries again at the next start.
    """
    try:
        collection = _dashboards_collection(hass)
        if collection is not None:
            return await _async_legacy_row_id(hass, collection)
    except Exception as err:
        _LOGGER.warning(
            "Apollo mmWave: could not read the dashboards to find the '%s'"
            " dashboard from an earlier release. %s",
            DASHBOARD_TITLE,
            _LEGACY_RETRY_HINT,
            exc_info=True,
        )
        raise DashboardsUnreadableError from err
    _LOGGER.warning(
        "Apollo mmWave: could not reach Lovelace's dashboards collection, so the"
        " '%s' dashboard from an earlier release is not tracked yet. %s",
        DASHBOARD_TITLE,
        _LEGACY_RETRY_HINT,
    )
    raise DashboardsUnreadableError


async def _async_legacy_row_id(hass: HomeAssistant, collection: Any) -> str | None:
    """Return the id of the row on our url path holding only our strategy."""
    item = _row_on_url_path(collection, DASHBOARD_URL_PATH)
    if item is None:
        return None
    stored = await _async_stored_config(hass, item)
    if not _is_ours(stored) or set(stored) != {"strategy"}:  # type: ignore[arg-type]
        return None
    return str(item["id"])
