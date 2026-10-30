"""Constants for the Apollo mmWave integration."""

# Core domain
DOMAIN = "apollo_mmwave"

# Services
SERVICE_UPDATE_ZONE = "update_zone"
SERVICE_CALIBRATE_GATES = "calibrate_gates"
SERVICE_CANCEL_CALIBRATION = "cancel_calibration"
SERVICE_RESTORE_GATE_THRESHOLDS = "restore_gate_thresholds"

# Event names (public bus event, part of the integration's API surface)
EVENT_ZONE_UPDATED = f"{DOMAIN}_zone_updated"
EVENT_CALIBRATION_STARTED = f"{DOMAIN}_calibration_started"
EVENT_CALIBRATION_FINISHED = f"{DOMAIN}_calibration_finished"

# Internal dispatcher signal fired with the device id on any zone change.
SIGNAL_ZONES_UPDATED = f"{DOMAIN}_zones_updated"
# Internal dispatcher signal fired with the device id on every calibration
# job status change and once per sampling tick.
SIGNAL_CALIBRATION_UPDATED = f"{DOMAIN}_calibration_updated"

# hass.data keys
DATA_STORE = "store"
DATA_ASSETS_REGISTERED = "assets_registered"
# The versioned bundle urls this run serves, and the flag entry removal sets
# after deleting their resource rows, so an entry added again in the same run
# puts the rows back.
DATA_RESOURCE_URLS = "resource_urls"
DATA_RESOURCES_REMOVED = "resources_removed"
DATA_PAIR_CACHE = "ld2450_pair_cache"
DATA_CALIBRATION_STORE = "calibration_store"
DATA_CALIBRATION_JOBS = "calibration_jobs"

# Store keys (v2). Zones are keyed by Home Assistant device id, which survives
# renames. `label` is display only and never used to build an identifier.
STORE_ZONES = "zones"
STORE_ENTITIES = "entities"
STORE_DEVICES = "devices"
STORE_ORPHANS = "orphans"
STORE_LABEL = "label"
# Every other v1 or legacy location name that merged onto the same device. A
# rename left the old name behind as a second location; pre-2.0 unique ids were
# built from either name and a deprecated `location` call can use either, so
# both have to keep resolving. Like `label`, never used to build an identifier.
STORE_ALIASES = "aliases"
# Unit for target readings whose sensor carries no length unit of its own, a
# DIY template sensor for example. A reading whose unit_of_measurement is a
# Home Assistant length unit is converted by that instead (see
# SENSOR_UNIT_FACTORS), so for an Apollo radar, whose target sensors always
# carry one, this decides nothing. The card and the presence sensor apply the
# same rule before testing readings against millimeter zone geometry, or the
# two would disagree about who is inside a zone. Absent means millimeters.
STORE_INPUT_UNITS = "input_units"
# TODO(REVIEW_REPORT.md X04): card lacks yd; decide unit owner.  # noqa: FIX002, TD003
# The zone card maps yd to mm and rewrites input_units from its YAML on every
# save. Keep yd here; removing it is the less safe direction.
INPUT_UNIT_FACTORS = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "in": 25.4,
    "ft": 304.8,
    "yd": 914.4,
}
# Millimeters per Home Assistant length unit, keyed by the UnitOfLength
# symbols exactly as Home Assistant writes them. ESPHome reports LD2450
# targets in mm, but Home Assistant set to US customary units shows every new
# distance sensor in inches, and anyone can pick another unit in an entity's
# settings, so a target's state is in whatever its unit_of_measurement says.
# Not INPUT_UNIT_FACTORS, which is what the service accepts. Not Home
# Assistant's DistanceConverter either: it converts through meters, which
# ends one bit away from a single multiplication for about a quarter of
# readings, and the zone card has to compute exactly the same number or a
# target on a zone's edge is drawn inside while presence reads off. The
# card's SENSOR_LENGTH_UNITS is this table. tests/test_contracts.py keeps
# the two equal, and tests/test_binary_sensor.py checks this one against
# DistanceConverter.
SENSOR_UNIT_FACTORS = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "km": 1_000_000.0,
    "in": 25.4,
    "ft": 304.8,
    "yd": 914.4,
    "mi": 1_609_344.0,
    "nmi": 1_852_000.0,
}

# Attribute / data keys. Persisted coordinates are rounded to whole mm
ATTR_SHAPE = "shape"
ATTR_DATA = "data"
ATTR_POINTS = "points"
ATTR_X_MIN = "x_min"
ATTR_X_MAX = "x_max"
ATTR_Y_MIN = "y_min"
ATTR_Y_MAX = "y_max"
ATTR_CX = "cx"
ATTR_CY = "cy"
ATTR_RX = "rx"
ATTR_RY = "ry"
ATTR_ROTATION_DEG = "rotation_deg"
ATTR_NAME = "name"

# Shapes
SHAPE_RECT = "rect"
SHAPE_ELLIPSE = "ellipse"
SHAPE_POLYGON = "polygon"
SHAPE_NONE = "none"
SUPPORTED_SHAPES = (SHAPE_NONE, SHAPE_RECT, SHAPE_ELLIPSE, SHAPE_POLYGON)

# Limits / defaults
POLYGON_MAX_POINTS = 32
POLYGON_MIN_POINTS = 3

# The zone-drawing card this integration bundles (forked from zone-mapper-card).
# The name is ours alone: the standalone card keeps `zone-mapper-card`, and a
# browser that loads both bundles can no longer hand one card the other's
# backend. Nothing aliases the old name.
CARD_TYPE = "custom:apollo-radar-zone-map-card"

# Config flow and the options flow's "add" step: create the Apollo mmWave
# dashboard once, when the administrator submits the form, and whether only
# administrators can see it. Neither choice is stored on the entry.
CONF_CREATE_DASHBOARD = "create_dashboard"
DEFAULT_CREATE_DASHBOARD = True
CONF_DASHBOARD_ADMIN_ONLY = "dashboard_admin_only"
DEFAULT_DASHBOARD_ADMIN_ONLY = True

# Entry options: the dashboard this integration created, by its dashboards
# collection id and url path, or None for both when it owns none. Only that row
# is ever written to or deleted, and only while its config is still our
# strategy. Setup never writes a dashboard.
CONF_DASHBOARD_ID = "dashboard_id"
CONF_DASHBOARD_URL_PATH = "dashboard_url_path"

# Entries from 2.2.5 and earlier: whether setup kept the dashboard in place.
# async_migrate_entry reads it once to record ownership, then drops it.
CONF_AUTO_CREATE_VIEW = "auto_create_view"
# The config entry minor version that records dashboard ownership. Entries on
# minor version 1 come from 2.2.5 or earlier.
ENTRY_MINOR_VERSION = 2

# Options flow: explicit device selection for the dashboard. Empty means
# automatic detection (live Apollo mmWave devices); a non-empty list means
# exactly these devices, shown even while offline/unplugged.
CONF_DASHBOARD_DEVICES = "dashboard_devices"

# Strategy-backed dashboard this integration can create in the sidebar. The
# dashboard config is just `{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}`;
# the frontend strategy detects every Apollo mmWave device and builds one tab each.
DASHBOARD_URL_PATH = "apollo-mmwave"
DASHBOARD_TITLE = "Apollo mmWave"
DASHBOARD_ICON = "mdi:radar"
DASHBOARD_STRATEGY_TYPE = "custom:apollo-radar-tuning"

# Frontend assets bundled with the integration and served as Lovelace resources,
# so users install ONE thing (no separate card downloads). Filenames live in www/.
STATIC_URL_BASE = f"/{DOMAIN}"
FRONTEND_DIR = "www"
JS_BUNDLES = (
    "apollo-radar-tuning.js",  # tuning cards + dashboard strategy
    "apollo-radar-zone-map-card.js",  # 2D zone-drawing card
)

# Log / warning templates
WARN_POLY_INSUFFICIENT = (
    "Polygon zone %s on device '%s' has insufficient points (<%d); clearing zone."
)
# Enough points were sent, but too few parsed: the usual cause is `[x, y]`
# lists where `{x, y}` objects are expected.
WARN_POLY_MALFORMED = (
    "Polygon zone %s on device '%s' has %d points but only %d are valid {x, y}"
    " numbers (need %d); clearing zone."
)
WARN_POLY_TRUNCATING = "Polygon zone %s on device '%s' has %d points; truncating to %d."
WARN_RECT_INVALID = (
    "Rectangle zone %s on device '%s' has invalid bounds; clearing zone."
)
WARN_RECT_NON_NUM = (
    "Rectangle zone %s on device '%s' has non-numeric bounds; clearing zone."
)
WARN_ELLIPSE_NON_POSITIVE = (
    "Ellipse zone %s on device '%s' has non-positive radii; clearing zone."
)
WARN_ELLIPSE_INVALID = (
    "Ellipse zone %s on device '%s' has invalid radii; clearing zone."
)
WARN_ZONE_NO_GEOMETRY = (
    "Zone %s on device '%s' was stored with shape %s and no geometry."
)
