"""Alias of pytest_homeassistant.common."""

import sys

from pytest_homeassistant import common

sys.modules[__name__] = common
