# Apollo mmWave

One Home Assistant integration for every Apollo mmWave sensor. It adds a
dashboard where you calibrate each radar and, on sensors that support it,
draw presence zones.

## Credits and thanks

- **WestwardWinds**, Zachary Graham
  ([@WestwardWinds](https://github.com/WestwardWinds)), built the zone mapper
  for Apollo Automation. It is the zone backend
  ([zone-mapper](https://github.com/ApolloAutomation/zone-mapper)) and the zone
  map card
  ([zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card)).
- **Brandon Harvey ([@bharvey88](https://github.com/bharvey88))** got this
  project started and published the original Apollo mmWave repository, which
  this one continues. Thank you, Brandon, for all the work that went into
  getting it off the ground.
- Thank you to Brandon and WestwardWinds for releasing this project under the
  MIT license, so everyone can use, change and share it (see
  [LICENSE](LICENSE)).
- The radar tuning charts were inspired by MirkoP's MSR tuning dashboard.
  That dashboard needed two extra HACS cards and about 950 lines of pasted
  YAML. This integration builds the dashboard for you.

## What you get

- An **Apollo mmWave** dashboard in your sidebar with one tab per sensor. Add
  or remove a sensor and its tab comes or goes on its own.
- **Auto-calibration.** Press one button and leave the room. The integration
  listens to the empty room and sets how sensitive the radar is at each
  distance. **Undo** puts your old values back.
- **Zone maps** on the R PRO-1 and MTR-1. Draw zones over the people the
  radar sees, and each zone gets a presence sensor for your automations.
- **No YAML** and no separate card downloads. The integration serves its own
  cards.

![The Auto-calibrate card running a calibration, sped up: a 15 second countdown, a one minute listen that shows the highest energy at each gate, then the result table with each gate's new threshold and an Undo button](https://raw.githubusercontent.com/ApolloAutomation/apollo-mmwave-main/main/docs/images/apollo-mmwave-calibrate.gif)

## Supported sensors

| Sensor | Radar tuning | Zone map |
| --- | --- | --- |
| MSR-1, MSR-2 | Yes (LD2410) | No |
| R PRO-1 | With the optional LD2412 | Yes (LD2450) |
| MTR-1 | No | Yes (LD2450) |

The radar splits the room into distance steps called gates, 0.75 m each by
default. Each gate has a threshold: how strong a signal must be to count as
presence. Radar tuning covers auto-calibration, the distance and gate energy
charts, thresholds, detection range and occupancy.

![The Gate Energy chart turning on: dimmed until Radar Engineering Mode is on, then a move bar and a still bar for each gate, with a triangle marking each threshold](https://raw.githubusercontent.com/ApolloAutomation/apollo-mmwave-main/main/docs/images/apollo-mmwave-gate-energy.gif)

## Install with HACS

You need:

- Home Assistant 2026.8.1 or later.
- [HACS](https://hacs.xyz/docs/use/download/download/) installed.
- Your sensor added to Home Assistant. Apollo sensors use ESPHome, so it
  shows up under **Settings → Devices & Services → ESPHome**.

This button opens the repository in HACS and does steps 1 and 2 for you:

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=ApolloAutomation&repository=apollo-mmwave-main&category=integration)

1. Open **HACS** in the sidebar. Open the menu (⋮) in the top right and
   choose **Custom repositories**.
2. In **Repository**, paste
   `https://github.com/ApolloAutomation/apollo-mmwave-main`. Set **Type** to
   **Integration**, press **Add**, then close the window.
3. Search HACS for **Apollo mmWave** and open it. Press **Download**, then
   **Download** again to confirm.
4. Restart Home Assistant: go to **Settings → System** and press the power
   icon in the top right.
5. Go to **Settings → Devices & Services**, press **Add Integration** and pick
   **Apollo mmWave**. This button opens the same window:

   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=apollo_mmwave)

   Leave **Add an 'Apollo mmWave' dashboard to the sidebar** turned on and
   press **Submit**.

Upgrading from 1.x or 2.0? Read [CHANGELOG.md](CHANGELOG.md) first. Some
cards and automations need a change by hand.

Most people can skip this. If your `configuration.yaml` sets
`resource_mode: yaml` under `lovelace:`, Home Assistant cannot add the cards
for you. Add the two lines shown in
[Lovelace resources](docs/configuration.md#lovelace-resources).

## First steps

1. Open the **Apollo mmWave** dashboard in the sidebar. Each sensor has its own
   tab.
2. On an MSR-1 or MSR-2 tab, or an R PRO-1 tab if the sensor has the
   optional LD2412, find the **Auto-calibrate** card. On an R PRO-1 without
   it, skip to step 6. Before you start:
   - Make sure nobody is in the room, pets included. Turn off robot vacuums.
   - Leave fans and curtains the way they usually are.
   - **R PRO-1 only:** with the room empty, press **Start Dynamic Background
     Correction** on the Controls card. Wait until **Background Correction
     Running** turns off.
3. Press **Calibrate with empty room** and leave the room. The card counts
   down 15 seconds, then listens for 1 minute. When it is done, it shows the
   new thresholds and how to test them.
4. If the sensor now misses you, or turns on with nobody there, press
   **Undo (restore your previous values)** to put your old thresholds back.
5. The **Start here** list on the tab covers the next settings: how far the
   radar looks and how long presence stays on. More about calibration:
   [Auto-calibration](docs/configuration.md#auto-calibration).
6. On an R PRO-1 or MTR-1 tab, find the zone map: the grid that shows where
   the radar sees people. A new radar has no zones yet, so open
   **Configure → Zones** on that card and press **Add Zone**. Then press the
   new zone's button, choose a shape from the ✎ menu and draw on the grid.
   Each zone gets a presence sensor. See
   [Drawing zones](docs/configuration.md#drawing-zones).

   ![The zone map on an R PRO-1: a grid in meters, the radar's view cone, a rectangle and an ellipse drawn as zones, and the zone buttons under the grid](https://raw.githubusercontent.com/ApolloAutomation/apollo-mmwave-main/main/docs/images/apollo-mmwave-zone-map.png)

## If something is wrong

- **A card or the dashboard does not load:** do a hard refresh
  (Ctrl/Cmd+Shift+R).
- **The Gate Energy chart says "Radar unavailable":** the radar is offline. The
  chart fills in once it reconnects.
- **Calibration says the radar has not reported its threshold values:** press
  **Read settings from the radar** on the card.
- **The zone map says Apollo mmWave is not loaded:** wait a moment after a
  restart, then reload the page.
- **A sensor has no tab:** check that it is added through ESPHome, and that
  **Dashboard devices** in the integration's options is empty or lists it.

The [full troubleshooting list](docs/configuration.md#troubleshooting) covers
more.

## More help and docs

- Apollo Automation wiki guides:
  [setup](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard-setup/)
  and
  [radar tuning](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/).
- [docs/configuration.md](docs/configuration.md): which devices appear,
  auto-calibration and its services, zones in automations, your own dashboards,
  card options and the full troubleshooting list.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release, with upgrade
  notes.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to build, test and send a change.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the code fits together.
- Found a bug?
  [Open an issue](https://github.com/ApolloAutomation/apollo-mmwave-main/issues).

## License

MIT. See [LICENSE](LICENSE).
