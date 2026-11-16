"""Alias of pytest_homeassistant.components.diagnostics."""

import sys

from pytest_homeassistant.components import diagnostics

sys.modules[__name__] = diagnostics
