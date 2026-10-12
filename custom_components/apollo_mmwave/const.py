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
# Unit the device's target sensors report in. The card scales readings by
# this before drawing them over millimetre zone geometry; the presence sensor
# has to scale the same way or the two disagree about who is inside a zone.
# Absent means millimetres, which is what every Apollo firmware reports.
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

# Options flow: opt out of the auto-created dashboard.
CONF_AUTO_CREATE_VIEW = "auto_create_view"
DEFAULT_AUTO_CREATE_VIEW = True

# Options flow: explicit device selection for the dashboard. Empty means
# automatic detection (live Apollo mmWave devices); a non-empty list means
# exactly these devices, shown even while offline/unplugged.
CONF_DASHBOARD_DEVICES = "dashboard_devices"

# Dedicated, strategy-backed dashboard this integration registers in the sidebar.
# The dashboard config is just `{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}`;
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
