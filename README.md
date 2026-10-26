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
- [HACS](https://hacs.xyz/docs/use/download/download/) 2.0.5 or later. To
  check, open the menu (⋮) in HACS, choose **About HACS** and read
  **Integration version**.
- Your sensor added to Home Assistant. Apollo sensors use ESPHome, so it
  shows up under **Settings → Devices & services → ESPHome**.

This button adds the repository to HACS and opens Apollo mmWave there, so it
does steps 1 and 2 for you. If it shows an **Add custom repository** box,
press **Add**. Then skip to step 3.

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=ApolloAutomation&repository=apollo-mmwave-main&category=integration)

1. Open **HACS** in the sidebar. Open the menu (⋮) in the top right and
   choose **Custom repositories**.
2. In **Repository**, paste
   `https://github.com/ApolloAutomation/apollo-mmwave-main`. Set **Type** to
   **Integration**, press **Add**, then close the window. Search HACS for
   **Apollo mmWave** and open it.
3. Press **Download** in the bottom right, then **Download** again in the
   window. Wait for it to finish.
4. Restart Home Assistant: go to **Settings → System** and press the power
   icon in the top right.

   [![Open your Home Assistant instance and show the system dashboard.](https://my.home-assistant.io/badges/system_dashboard.svg)](https://my.home-assistant.io/redirect/system_dashboard/)

5. Go to **Settings → Devices & services**, press **Add Integration** and pick
   **Apollo mmWave**. This button opens the same window:

   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=apollo_mmwave)

   Leave **Add the Apollo mmWave dashboard to the sidebar** and **Only
   administrators can see it** ticked and press **Submit**. The dashboard is
   created once, now. Apollo mmWave does not recreate or change it later, and
   you can edit or delete it like any other dashboard; see
   [The Apollo mmWave dashboard](docs/configuration.md#the-apollo-mmwave-dashboard).

To update later, make a full Home Assistant backup first. After HACS
updates Apollo mmWave, restart Home Assistant, then refresh your browser
(Ctrl/Cmd+Shift+R). Upgrading from 1.x or 2.0? Read
[CHANGELOG.md](CHANGELOG.md) first. Some cards and automations need a change
by hand.

Most people can skip this. If your `configuration.yaml` sets
`resource_mode: yaml` under `lovelace:`, Home Assistant cannot add the cards
for you. Add the two lines shown in
[Lovelace resources](docs/configuration.md#lovelace-resources).

### Switching from the original repository

If you installed Apollo mmWave from the original repository,
bharvey88/apollo-mmwave, which is no longer on GitHub, move HACS to this one.
It is the same integration in the same folder, so your entry, dashboard,
zones, calibration history and entity ids carry over. Coming from 1.x or 2.0?
Read [Upgrading to 2.0](CHANGELOG.md#upgrading-to-20) first.

1. Make a full Home Assistant backup. Check that HACS is 2.0.5 or later.
2. In HACS, open the menu (⋮) in the top right and choose
   **Custom repositories**. Press the trash can icon on the
   **bharvey88/apollo-mmwave (integration)** row. This only takes it off the
   HACS list; the files stay and Apollo mmWave keeps running.
3. Add this repository and download it with steps 2 and 3 of
   [Install with HACS](#install-with-hacs), then restart Home Assistant.

Keep your Apollo mmWave entry in **Settings → Devices & services**: deleting
it also deletes the dashboard, your zones and the values **Undo** uses. In
HACS, leave **Remove** and **Redownload** alone on both Apollo mmWave
entries, because they can delete the `custom_components/apollo_mmwave` folder
the two entries share. The
[wiki has every step](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard-setup/#from-the-original-apollo-mmwave-repository),
including what each HACS box says.

## First steps

1. Open the **Apollo mmWave** dashboard in the sidebar. Each sensor has its own
   tab. Only administrators see it, unless you unticked that box. No
   dashboard? Add it from the integration's options
   (**Settings → Devices & services → Apollo mmWave → Configure**).
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
- **The radar turns on with nobody there:** update to 2.2.4 or later and press
  **Calibrate with empty room** again. The wiki section
  [The radar still triggers with nobody there](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/#the-radar-still-triggers-with-nobody-there)
  has more.
- **Calibration says the radar has not reported its threshold values:** press
  **Read settings from the radar** on the card.
- **The zone map says Apollo mmWave is not loaded:** wait a moment after a
  restart, then reload the page.
- **A sensor has no tab:** check that it is added through ESPHome, and that
  **Choose the dashboard's devices** in the integration's options
  (**Settings → Devices & services → Apollo mmWave → Configure**) is empty or
  lists it.

  [![Open your Home Assistant instance and show an integration.](https://my.home-assistant.io/badges/integration.svg)](https://my.home-assistant.io/redirect/integration/?domain=apollo_mmwave)

The [full troubleshooting list](docs/configuration.md#troubleshooting) covers
more.

## More help and docs

- Apollo Automation wiki guides:
  [setup](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard-setup/)
  and
  [radar tuning](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/).
- [docs/configuration.md](docs/configuration.md): the Apollo mmWave
  dashboard, which devices appear, auto-calibration and its services, zones in
  automations, your own dashboards, card options and the full troubleshooting
  list.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release, with upgrade
  notes.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to build, test and send a change.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the code fits together.
- Found a bug?
  [Open an issue](https://github.com/ApolloAutomation/apollo-mmwave-main/issues).

## License

MIT. See [LICENSE](LICENSE).
