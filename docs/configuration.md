# Apollo mmWave configuration

This page has the details behind the [README](../README.md). Start there to
install the integration and run your first calibration.

## Contents

- [The Apollo mmWave dashboard](#the-apollo-mmwave-dashboard)
- [Lovelace resources](#lovelace-resources)
- [Choosing which devices appear](#choosing-which-devices-appear)
- [What each tab shows](#what-each-tab-shows)
  - [Start here](#start-here)
  - [Gate radar cards](#gate-radar-cards)
  - [Gate radar setup checks](#gate-radar-setup-checks)
  - [Device card](#device-card)
- [Auto-calibration](#auto-calibration)
  - [The calibration services](#the-calibration-services)
- [The zone map and its cards](#the-zone-map-and-its-cards)
  - [Radar setup](#radar-setup)
- [Drawing zones](#drawing-zones)
  - [Map units and size](#map-units-and-size)
  - [Zones in automations](#zones-in-automations)
- [Use your own dashboards instead](#use-your-own-dashboards-instead)
  - [Strategy options](#strategy-options)
  - [Card options](#card-options)
- [Support file](#support-file)
- [Removing Apollo mmWave](#removing-apollo-mmwave)
- [Troubleshooting](#troubleshooting)

## The Apollo mmWave dashboard

When you add the integration, the setup window offers to add a dashboard for
you: **Apollo mmWave** in the sidebar, at `/apollo-mmwave`, with a tab for
each Apollo mmWave sensor. Both boxes start ticked:

- **Add the Apollo mmWave dashboard to the sidebar** creates it once, when you
  press **Submit**.
- **Only administrators can see it** keeps it out of other users' sidebars.
  To change that later, open the dashboard's settings in Settings →
  Dashboards.

Apollo mmWave never recreates, rewrites or deletes the dashboard on its own:
not when Home Assistant restarts, and not when the integration reloads or
updates. It is an ordinary dashboard, so you can rename it, change its icon,
hide it, take control of it or delete it like any other. The integration
records which dashboard it created and changes only that one: when you remove
the integration (see [Removing Apollo mmWave](#removing-apollo-mmwave)), and
when you ask in its options (Settings → Devices & services → Apollo mmWave →
**Configure**):

- **Add the Apollo mmWave dashboard** shows up while the integration has no
  dashboard, for example after you unticked the box during setup or deleted
  the dashboard. It says what it will create and asks the admin-only question
  again.
- **Remove the Apollo mmWave dashboard** shows up while it has one. It says
  what will be deleted and deletes it when you press **Submit**.
- **Choose the dashboard's devices** sets which sensors the dashboard shows;
  see [Choosing which devices appear](#choosing-which-devices-appear).

[![Open your Home Assistant instance and show an integration.](https://my.home-assistant.io/badges/integration.svg)](https://my.home-assistant.io/redirect/integration/?domain=apollo_mmwave)

Once you take control of the dashboard it is yours: the integration stops
offering to remove it, writes no device selection into it, and leaves it in
place when you remove the integration. A dashboard you made yourself is never
changed (one catch on `/apollo-mmwave` is under
[Use your own dashboards instead](#use-your-own-dashboards-instead)). To add
more dashboards like this one, use the Community dashboards picker described
there.

If the dashboard cannot be created, for example because another dashboard
already uses `/apollo-mmwave`, setup still finishes and the log says why.

**Upgrading from 2.2.5 or earlier.** The dashboard you already have is kept as
it is, including who can see it: dashboards made before 2.2.6 are visible to
every user until you change that in their settings. If it still uses the
strategy, the integration records it as the one it created, so the options
above work on it. If you had turned the dashboard option off, the integration
records none, and a strategy dashboard you made on `/apollo-mmwave` is no
longer deleted at every restart.

## Lovelace resources

The integration registers its JS as a Lovelace resource, so the cards work in
already-open tabs, with no browser reload needed. It keeps exactly one resource
row per bundle: each time Home Assistant starts, it points its row at the
current version as a JavaScript module and fixes or removes duplicate and
mistyped rows under `/apollo_mmwave/`. A row you delete by hand comes back at
the next restart; an integration reload does not recreate it.

**Resources managed in YAML.** If your Lovelace resources are set in YAML
(`lovelace: resource_mode: yaml`), the integration cannot add them. It logs a
warning that ends with the two URLs to add, and until you add them the cards
may only load after a hard refresh (Ctrl/Cmd+Shift+R). Find the warning in
Settings → System → Logs.

[![Open your Home Assistant instance and show your Home Assistant logs.](https://my.home-assistant.io/badges/logs.svg)](https://my.home-assistant.io/redirect/logs/)

Copy the URLs from the warning exactly and add each one once, as a module:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /apollo_mmwave/apollo-radar-tuning.js?v=2.3.0
      type: module
    - url: /apollo_mmwave/apollo-radar-zone-map-card.js?v=2.3.0
      type: module
```

The `?v=` is the integration version. After every upgrade, replace each row's
URL with the new one from the warning instead of adding a second row. An
out-of-date row makes the browser run the bundle twice, once from that row and
once from the URL the integration adds itself; a duplicate "Apollo Zone Map"
entry in the card picker is the sign.

## Choosing which devices appear

The dashboard is **strategy-backed**: it re-detects your devices on every load,
so adding or removing a sensor adds or removes a tab, with nothing to maintain.

By default the dashboard shows every Apollo mmWave device Home Assistant
knows about, online or not. An unplugged radar keeps its tab with an
"offline" note so it is not silently missing; a leftover registry entry from
reflashed hardware shows the same way until you delete the old device in
Settings → Devices & services. A device without an Apollo model in the
registry (DIY builds) is only picked up while one of its radar entities is
live. To control the list yourself, open the integration's options (Settings
→ Devices & services → Apollo mmWave → Configure), pick **Choose the
dashboard's devices** and select devices under **Dashboard devices**: the
dashboard then shows exactly those devices and hides the rest. Leave the
selection empty to go back to automatic detection. Changes apply immediately.

[![Open your Home Assistant instance and show an integration.](https://my.home-assistant.io/badges/integration.svg)](https://my.home-assistant.io/redirect/integration/?domain=apollo_mmwave)

The selection is written only into the Apollo mmWave dashboard the integration
created, and only while it still uses the strategy. Without that dashboard the
selection is kept and used if you add the dashboard from the options later.
Once you take control of it, the integration no longer writes to it, so add or
remove devices in the dashboard itself. A dashboard you added yourself takes
its own `devices` list (below).

A selected device that Home Assistant reports nothing for (for example one
whose ESPHome entities are disabled) keeps a tab saying no radar data is
available, rather than an empty one. If every selected device is gone from Home
Assistant (replaced hardware with a new MAC, a radar re-added after Home
Assistant's 30-day deleted-device window, or a mistyped id), the dashboard
says the selection points at devices that no longer exist: clear or update
**Dashboard devices**. Reflashing or re-adding the same hardware (same MAC)
keeps its device id, so it does not cause this.

The same knob exists for hand-written strategies as a `devices` list:

```yaml
strategy:
  type: custom:apollo-radar-tuning
  devices:
    - your_device_id   # exactly these, online or not
```

A strategy can also take a single `device_id`, which takes precedence: when
both are set, only `device_id` is shown and `devices` is ignored. The
integration's own Apollo mmWave dashboard keeps any strategy option you type
into its raw configuration editor (saving **Dashboard devices** rewrites only
`type` and `devices`), so a `device_id` added there overrides the **Dashboard
devices** option. See
[Strategy options](#strategy-options) for the full list.

## What each tab shows

Each sensor's tab is built from the radars it has: the LD2410 on an MSR-1 or
MSR-2, the LD2450 on an MTR-1, and on an R PRO-1 the LD2450 plus the
optional LD2412. On a wide screen the cards sit in columns; on a phone they
read top to bottom in the order below.

- **MSR-1 and MSR-2:** Radar setup, Auto-calibrate, Start here, LD2410
  Controls and LD2410 Zone Config; then LD2410 Distances, Detection Range
  and Target / Occupancy; then Gate Energy and Move Thresholds; then the
  occupancy history, Still Thresholds and the Device card.
- **R PRO-1:** the LD2412's Radar setup, Auto-calibrate, Start here, LD2412
  Controls and Target / Occupancy; then the Zone Map heading with the
  LD2450's Radar setup and the zone map; then the LD2450's cards (see
  [The zone map and its cards](#the-zone-map-and-its-cards)); then the
  LD2412's Distances, Detection Range, Gate Energy, Move Thresholds,
  Occupancy History, Still Thresholds and the Device card.
- **MTR-1:** Start here, Radar setup and the zone map; then Zone presence,
  LD2450 Live and Occupancy History; then LD2450 Controls, the radar's
  built-in zones and the Device card.

A card only shows rows for entities Home Assistant has, so a setting the
firmware hides by default has no row.

### Start here

The help card on every tab lists the first steps for that sensor and ends
with **All settings for this device →**, which opens the device's own page
in Home Assistant, where every setting this dashboard leaves out lives.

- **MSR-1 and MSR-2:** fix anything the Radar setup card flags, calibrate
  with an empty room, set how far the radar looks and how long presence
  stays on, then walk the room and watch the Gate Energy chart. Each gate's
  depth is given in your units ("each gate is about 0.75 m", or "about
  2.5 ft" on a US customary system). A **Full tuning guide →** link opens
  the Apollo wiki.
- **R PRO-1:** first what each radar is for: the LD2412 senses people
  anywhere in range, even sitting still, and the LD2450 tracks where people
  are and drives the zone map. Then the LD2412 steps above, and for the
  LD2450: fix anything its Radar setup card flags, set **Cone rotation**,
  then draw a zone and walk into it. **In automations**, use **LD2412
  Presence** (the Radar Target row on this tab) for the whole room, or a
  zone's presence sensor for one part of it.
- **MTR-1:** fix anything the Radar setup card flags, set **Cone rotation**
  (under Configure on the zone map) to match how the sensor is mounted, then
  draw a zone and walk into it. **In automations**, use a zone's presence
  sensor, or **LD2450 Presence** for anywhere the radar sees.

An offline sensor's help card adds an "Offline right now" note.

### Gate radar cards

These cards are on MSR-1, MSR-2 and R PRO-1 tabs. Each title starts with the
chip: LD2410 on an MSR, LD2412 on an R PRO-1.

- **Controls:** Radar Engineering Mode, Start Dynamic Background Correction
  and Background Correction Running (LD2412 only), **Radar Bluetooth (HLK
  app)**, **Restart Radar** and **Factory Reset Radar**. Radar Bluetooth is
  the radar chip's own Bluetooth, which the HLK phone app connects to, not
  the device's Bluetooth proxy. Restart Radar asks "Restart the LD2410
  radar? It stops detecting for a few seconds while it starts up." before it
  restarts the radar chip, and Factory Reset Radar asks before it resets it.
  The whole-device restart is on the [Device card](#device-card).
- **Detection Range:** Radar Timeout, then Max Move Gate and Max Still Gate
  on the LD2410, or Max Gate and Min Gate on the LD2412. The tip under it
  says each gate is about 0.75 m (2.5 ft) deep and that Radar Timeout is how
  long **Radar Target** (on the R PRO-1, **LD2412 Presence**) stays on after
  the radar last detects someone.
- **LD2410 Zone Config** (MSR only): Start Zone 1 and End Zone 1 to 3. The
  note under it says the boxes are in cm, also on a US customary system
  ("100 cm is about 3.3 ft"), and that the zones sit back to back: Zone 1
  runs from Start Zone 1 to End Zone 1, Zone 2 from there to End Zone 2, and
  Zone 3 from there to End Zone 3. In automations, use **Any zone**.
- **Move Thresholds** and **Still Thresholds:** one row per gate, named for
  how far out the gate reaches: "G0 (at the sensor)", "G1 (about 0.75 m)" up
  to "G8 (about 6 m)" on the LD2410, in feet ("G4 (about 10 ft)") on a US
  customary system. The distances use 0.75 m gates, or the radar's own gate
  size when that hidden setting is enabled.
- **Target / Occupancy:** Radar Target, Radar Moving Target, Radar Still
  Target and, on an MSR, Radar Zone 1 to 3 Occupancy and **Any zone**. Any
  zone is on while someone is in any of the three zones, so it ignores
  people past End Zone 3. The rows light up while on.
- **Occupancy History:** the last 24 hours. On an MSR (titled "LD2410
  Occupancy History"): Detected, Moving, Still, Any zone and Zone 1 to 3. On
  an R PRO-1: LD2412 Presence, LD2412 Moving, LD2412 Still, LD2450 Presence
  and each zone you drew. A zone you just drew joins the history after a
  page reload.

### Gate radar setup checks

The **Radar setup** card at the top of MSR-1, MSR-2 and R PRO-1 tabs checks
the gate radar (the LD2410 or LD2412). It changes nothing on its own: each
button names what it does and makes that one change, the buttons are greyed
out while it is sent, and if Home Assistant refuses it the card says why.
The card's second line names the chip and the sensor ("LD2412 · Office"),
so on an R PRO-1 you can tell it from the LD2450's card above the zone map.

- **Radar Engineering Mode left on.** The card says "Radar Engineering Mode
  is on, so every gate's energy is saved to the database about once a
  second." The Gate Energy chart needs it only while you watch it. **Turn
  off Radar Engineering Mode** turns it off. While a calibration runs on the
  radar the card says nothing about it, because the calibration turns the
  mode on and off itself; until the card knows whether one is running, it
  shows "Checking the radar's settings...".
- **Settings not reported yet.** When a gate threshold, the detection range
  or the timeout reads unknown, their rows are blank and calibration cannot
  start. **Read settings from the radar** only asks the radar to send them;
  nothing on the radar changes. The card waits a few seconds for the answer
  and, if none comes, says "The radar has not sent its settings yet. Try
  again in a moment." When the radar's query button is not available, the
  card says to press Query Params on the radar's device page instead.
- **LD2410 zones that can never turn on.** Each zone starts where the one
  before it ends, so an end at or below the one before leaves that zone
  empty, for example "Zone 2 can never turn on. End Zone 2 (150 cm) must be
  larger than End Zone 1 (200 cm)." A zone that starts or ends past the
  radar's reach (the larger of Max Move Gate and Max Still Gate, times the
  gate size) is flagged too. Change the distances on the Zone Config card, or
  raise the max gates on the Detection Range card.
- **LD2412 Min Gate at or above Max Gate.** The LD2412 only detects people
  from Min Gate out to Max Gate, so the card asks you to set Min Gate lower
  than Max Gate on the Detection Range card.

The zone and range problems have no button: the card explains them and
leaves the new values to you. "Radar settings look good." means everything
the card can read is fine. While the radar is offline, or has not reported
anything yet, the card says so and waits.

The card is part of the generated dashboard and can be placed on your own
with `radar: gate`:

```yaml
type: custom:apollo-radar-setup-card
device_id: your_device_id
radar: gate          # check the LD2410 or LD2412; leave out for the LD2450
title: Radar setup   # optional
```

### Device card

The **Device** card ends every tab.

- **Apollo firmware**, and the radar chip firmware: **LD2410 firmware** on an
  MSR, **LD2412 firmware** and **LD2450 firmware** on an R PRO-1, **LD2450
  firmware** on an MTR-1. The R PRO-1 hides both chip versions by default;
  enable them on the device page to get the rows.
- **Firmware update** shows whether Apollo has a new firmware. Tap it to open
  Home Assistant's own update window, where you can install it. The card has
  no install button. The MTR-1 firmware has no update entity, so it has no
  such row.
- **Restart device** restarts the whole sensor and asks first. On an R PRO-1
  it reads **Restart device (both radars)**, and on an MTR-1 **Restart device
  (also restarts the radar)**. The device is offline for a short while
  before it reconnects.
- **Weak Wi-Fi.** While the Wi-Fi signal is below -75 dBm, a note says
  presence updates can lag or drop out and suggests moving the device or the
  router closer, or adding an access point. It stays hidden while the signal
  is fine or the device is offline.
- **All settings for this device →** opens the device's own page, and
  **Download a support file** says where to get the
  [support file](#support-file).

## Auto-calibration

Every gate-radar tab (MSR-1, MSR-2, R PRO-1) has an **Auto-calibrate** card
near the top, right under Radar setup. Press **Calibrate with empty room** and leave: Home Assistant turns Radar
Engineering Mode on, counts down 15 seconds so you can get out, listens to every
gate's move and still energy for a minute, then sets each threshold a margin
above the background it heard. Your current thresholds are saved first, so the
card always offers **Undo (restore your previous values)**, and that saved copy
survives a Home Assistant restart. Undo saves the calibrated values before it
writes, so the button then becomes **Redo (put the calibrated values back)**.
Under the button, the card shows when those values were saved.

On the R PRO-1, radar tuning needs the optional LD2412. Every R PRO-1 has the
LD2450 for the zone map, and the LD2412 is an add-on. Without it the tab still
shows the Auto-calibrate card and the LD2412 charts, but the Auto-calibrate card
says the radar is offline and its buttons stay disabled, and the charts say
"Apollo mmWave: device not found". Use the zone map on that tab instead.

Rules for a good run:

- Nobody in the radar's view: people, pets, robot vacuums. A person sitting
  still inflates the still thresholds and the card warns when the radar
  reported presence for much of the listen.
- Fans, curtains and plants that normally move are part of the background.
  Leave them as they usually are.
- Leave Radar Engineering Mode on until the card says it is done. The job stops
  without changing anything if the mode is turned off during the listen, and on
  the R PRO-1 if Start Dynamic Background Correction is pressed.
- **R PRO-1 (LD2412):** run **Start Dynamic Background Correction** on the
  Controls card first, with the room empty, and wait for **Background
  Correction Running** to turn off. That is the chip's own feature, written
  into the radar itself, so Undo on this card cannot reverse it. Calibrate
  afterward, and calibrate again after any later background correction.

**Preview only** computes the new thresholds and shows them without changing
anything (Radar Engineering Mode is still turned on for the listen). The result
table shows each gate's peak and threshold, dims gates beyond your max gate,
marks a gate that ended up at 100 as **off**, and lists any value the radar did
not echo back. A gate you turned off yourself (threshold at 100) is calibrated
like the others, which turns it back on: the card names those gates before the
run, marks them **was off** in the table, and says how to set one back to 100
on its Thresholds card (Undo puts back all your previous values, not only that
gate). The job runs in the backend, so closing the browser does not stop it;
reopen the dashboard and the card picks the running job up again. If
Home Assistant restarts during a run the card shows an interrupted banner with
**Turn it off** for Radar Engineering Mode and **Undo** for any thresholds that
may have been written.

The card is part of the generated dashboard, and can be placed on your own:

```yaml
type: custom:apollo-radar-calibrate-card
device_id: your_device_id
title: Auto-calibrate          # optional
calibration:                   # optional; absent keys use the service defaults
  duration_s: 120              # listen for two minutes (15..600)
  settle_s: 0                  # no countdown (0..120)
  margin: 15                   # headroom in energy points (0..50)
  margin_pct: 35               # headroom in percent of the peak (0..100)
```

The same `calibration:` block on a `custom:apollo-radar-tuning` strategy seeds
every generated card. The card drives the `apollo_mmwave.calibrate_gates`,
`apollo_mmwave.cancel_calibration` and `apollo_mmwave.restore_gate_thresholds`
services, which automations can call directly; see the service descriptions in
Settings → Tools → Actions.

[![Open your Home Assistant instance and show your action tools with a specific action selected.](https://my.home-assistant.io/badges/tools_perform_action.svg)](https://my.home-assistant.io/redirect/tools_perform_action/?service=apollo_mmwave.calibrate_gates)

### The calibration services

| Service | What it does |
|---|---|
| `apollo_mmwave.calibrate_gates` | The run described above for one radar (`device_id`). Optional `duration_s` (15 to 600, default 60), `settle_s` (0 to 120, default 15), `margin` (0 to 50 points, default 15), `margin_pct` (0 to 100 percent, default 35; the larger headroom wins per gate, and both cannot be 0), `kind` (`both`, `move` or `still`), `apply` (`false` previews without writing) and `wait` (`true` blocks until the job ends and returns the full result). |
| `apollo_mmwave.cancel_calibration` | Stops the running job for one radar. Nothing is written if it had not started writing; values already written stay until you restore. A user who may not control the radar's entities, such as a read-only user, cannot stop it. |
| `apollo_mmwave.restore_gate_thresholds` | Writes the thresholds saved before the last calibration back (or a chosen `snapshot_id`). The current values are saved first, so a restore can itself be undone. |

The card offers only the newest saved snapshot as Undo. Restore an older one
with `apollo_mmwave.restore_gate_thresholds` and its `snapshot_id`.

Every service takes one device per call. An automation that knows the room is
empty can skip the countdown and read the result back:

```yaml
automation:
  - alias: Recalibrate the office radar overnight
    triggers:
      - trigger: time
        at: "03:00:00"
    conditions:
      - condition: state
        entity_id: binary_sensor.apollo_msr_2_abc123_radar_target
        state: "off"
        for: "00:30:00"
    actions:
      - action: apollo_mmwave.calibrate_gates
        data:
          device_id: your_device_id
          settle_s: 0
          wait: true
        response_variable: calibration
      - if:
          - condition: template
            value_template: "{{ calibration.outcome != 'applied' }}"
        then:
          - action: persistent_notification.create
            data:
              title: Radar calibration
              message: >
                Outcome {{ calibration.outcome }}
                {% if calibration.error %}({{ calibration.error.message }}){% endif %},
                {{ calibration.changed }} thresholds changed.
```

Several radars take one call each, so loop over them:

```yaml
actions:
  - repeat:
      for_each:
        - device_id_of_the_office_radar
        - device_id_of_the_hall_radar
      sequence:
        - action: apollo_mmwave.calibrate_gates
          data:
            device_id: "{{ repeat.item }}"
            settle_s: 0
            wait: true
```

**Recorder.** While Radar Engineering Mode is on, the radar updates its 18
(LD2410) or 28 (LD2412) gate energy sensors about once a second, and every
update lands in the recorder. The job turns the mode back off when it was the
one that turned it on, so a calibration adds about two minutes of that. The
[Radar setup](#gate-radar-setup-checks) card at the top of the tab flags the
mode left on and offers **Turn off Radar Engineering Mode**. If you leave the
mode on to watch the Gate Energy chart, exclude the per-gate energy sensors. The globs match the gate number exactly (one digit on the LD2410, two
on the LD2412), so the aggregate move and still energy sensors stay recorded
even when the device name contains `_g`:

```yaml
recorder:
  exclude:
    entity_globs:
      - sensor.*_g?_move_energy     # LD2410: g0 to g8
      - sensor.*_g?_still_energy
      - sensor.*_g??_move_energy    # LD2412: g00 to g13
      - sensor.*_g??_still_energy
```

## The zone map and its cards

On R PRO-1 and MTR-1 tabs, everything for the LD2450, the radar that tracks
people for the zone map, sits together. An MTR-1 tab shows these cards in
three columns, after its **Start here** card. On an R PRO-1 they come after
the LD2412's first column, under the **Zone Map** heading (see
[What each tab shows](#what-each-tab-shows)). On a phone they read top to
bottom in this order:

- **Radar setup** checks the radar's settings and fixes them with one tap;
  see [Radar setup](#radar-setup).
- **The zone map** shows where the radar sees people. Draw zones on it; see
  [Drawing zones](#drawing-zones).
- **Zone presence** lists each zone's presence sensor, colored while someone
  is in the zone. A zone you just drew shows up here after you reload the
  page; a zone you delete leaves the list at once.
- **LD2450 Live** shows what the radar reports right now: Presence, Moving
  Target, Still Target, Target Count, and each target's distance and
  direction. If the map shows no dot, check Presence here: off with you in
  the room means the radar reports nobody (see
  [Troubleshooting](#troubleshooting)).
- **Occupancy History** (MTR-1, beside LD2450 Live) shows the last 24 hours
  of LD2450 Presence and each zone you drew. On an R PRO-1 the same lines
  join the LD2412's in one history at the end of the tab.
- **LD2450 Controls** holds Zone Type, Multi Target Tracking, Radar Timeout,
  **Radar Bluetooth (HLK app)**, Restart Radar and Factory Reset Radar,
  whichever your sensor has (the MTR-1 has no Restart Radar). **Restart
  Radar** and **Factory Reset Radar** ask first, as they do on the LD2410 and
  LD2412 **Controls** cards. On the R PRO-1, Home Assistant hides Multi
  Target Tracking by default. The radar tracks several people unless that
  setting was turned off, so most people never need it. The note under the
  card says **Radar Timeout** is how long LD2450 Presence stays on after the
  radar last sees someone. It does not hold the zones you draw: a zone turns
  off as soon as nobody is in it. The LD2450's firmware version is on the
  [Device card](#device-card).
- **Radar's built-in zones** shows the radar chip's own zone corners and
  counts. These are not the zones you draw on the map. The card shows only
  while Zone Type is not Disabled, and goes away when you set it to Disabled.
- The [Device card](#device-card) ends the tab.

### Radar setup

The **Radar setup** card sits right above the zone map. It checks the two
LD2450 settings that decide whether the zone map can show people, and fixes
them when you press its button. It changes nothing on its own. Apollo
firmware never sets these two, so they are whatever the radar chip holds. On
an R PRO-1 a second Radar setup card, at the top of the tab, checks the
LD2412; see [Gate radar setup checks](#gate-radar-setup-checks).

- **Zone Type** should be **Disabled**. The radar chip has its own built-in
  zones, separate from the zones you draw, and the zone map replaces them.
  - **Detection:** the radar reports only people inside its built-in zones.
    With none set (all at 0) it reports nobody, so the zone map stays empty.
    With some set, anyone outside them is missing from the map.
  - **Filter:** the radar reports everyone except people inside its built-in
    zones. With none set it works like Disabled.

  **Set Zone Type to Disabled** changes it.
- **Multi Target Tracking** off means the radar tracks only one person.
  **Turn on Multi Target Tracking** changes it.

When both need fixing, one **Use recommended settings** button does both,
in place of the two buttons. The buttons are greyed out while the change is
sent, and if Home Assistant refuses it the card says why. "Radar settings
look good." means the settings the card can read are as recommended. On an
R PRO-1, Home Assistant hides Multi Target Tracking by default, so until
that setting is enabled the card checks only Zone Type (see
[Troubleshooting](#troubleshooting)). While the radar is offline, or has not
reported Zone Type yet, the card says so and waits.

The card is part of the generated dashboard, and can be placed on your own.
It is in the card picker as **Apollo Radar Setup**, filled in with your first
R PRO-1 or MTR-1 (with neither, your first MSR-1 or MSR-2 and `radar: gate`),
or in YAML:

```yaml
type: custom:apollo-radar-setup-card
device_id: your_device_id
title: Radar setup   # optional
```

Add `radar: gate` to check the device's LD2410 or LD2412 instead.

## Drawing zones

The zone map card on R PRO-1 and MTR-1 tabs draws occupancy zones over the
LD2450's live targets. If the map shows no dot with someone in the room,
check the [Radar setup](#radar-setup) card first. Only administrators can
draw or change zones; other users see them, and the card answers a change
with "Could not save". A new radar has no zones yet, so open **Configure →
Zones** on the card and press **Add Zone** first. Then pick a zone with its
button, choose Rectangle, Ellipse or Polygon from the drawing-mode menu (✎),
and draw on the grid:

- **Rectangle:** drag out a box. A click, a tap or a perfectly straight drag
  draws and saves nothing.
- **Ellipse:** drag out its bounding box. A click, a tap or a perfectly
  straight drag still saves an ellipse with a 1 mm radius over the zone, so
  use **Undo last zone change** (↶) if that happens.
- **Polygon:** click or tap each corner, then press **Finish polygon** (✓) or
  double-click or double-tap the last corner. A polygon needs at least 3
  distinct corners and finishes on its own at 32. Backspace or **Undo last
  point** removes the last corner and Escape discards the polygon; keys typed
  into a text field go to that field instead.
- Pressing anywhere else in the card, such as a zone button, **Add Zone** or
  the rotation slider, cancels a shape in progress (the buttons on the grid
  itself do not). Moving the mouse off the grid cancels a rectangle or ellipse
  drag but keeps a polygon's corners.
- Only the left mouse button draws. On a touch screen the finger that started a
  shape owns it: a second finger is ignored, and a touch the browser cancels
  saves nothing. A shape in progress is also dropped, unsaved, if the card is
  hidden or collapsed before you finish it.

Double-clicking a zone's button clears its shape, and **Clear All Zones**
clears every zone; **Undo last zone change** (↶) puts them back. Under
**Configure → Zones**, **Add Zone** adds a zone and each row renames (**Save**)
or deletes (**Delete**) one. Saving a name for a zone that only the card's YAML
`zones:` list names creates that zone, so the name sticks, and a name you are
typing is kept when the card receives an update from elsewhere. **Delete**
cannot be undone: Undo does not bring a deleted zone back.

### Map units and size

The map is in feet when Home Assistant uses US customary units (Settings →
System → General), and in meters otherwise. The **m / ft** switch in the
corner of the map changes it:

- When an administrator presses it, the choice is saved for that radar, so
  everyone who opens its map, on any dashboard, sees that unit.
- For anyone else it changes only their own view, until they reload the
  page, and saves nothing.

Labels in feet read "4 ft". The rings in the radar's view are 1 m apart in
meters and 4 ft apart in feet.

The map fits the area the radar can see: 120 degrees wide and about 6 m
(20 ft) out, turned the way you set the rotation slider, plus any zone you
drew outside it. It fits again when you let go of the slider. A caption at
the edge of that area reads "Radar range 6 m (20 ft), 120°". The map can be
wider than it is tall, and the radar stays at the edge it is mounted on.

A card with its own `grid` in YAML keeps that grid, on a square map. A card
with `grid_units` in YAML uses that unit until an administrator saves one
with the switch. Zone map cards added from the card picker before 2.3.0 have
both in their YAML (a `grid` from -6000 to 6000 and `grid_units: mm`), and
`unit_display: false`, which hides every distance label and the range
caption. Open the card's code editor, delete `grid` and `grid_units`, and
set `unit_display: true` to get the fitted map in your units, labeled.

The unit only changes what the card shows. Zones are stored in millimeters,
and the presence sensors work the same either way. The saved unit is kept
with the radar's zones (`display_units` in `.storage/apollo_mmwave.zones`),
and `apollo_mmwave.update_zone` can set it too (see below).

### Zones in automations

Each zone has two entities on the radar's device: a sensor that holds its
shape, and a presence binary sensor (for example
`binary_sensor.office_radar_zone_1_presence`) that is on while a tracked target
is inside the zone.

- Presence reads `off`, not `unavailable`, while the radar is offline or still
  reconnecting after a restart. An automation that waits for a zone to be clear
  for some minutes should also check that the radar itself is available.
- Naming a zone that already exists (in the zone manager, or with
  `update_zone`'s `name`) renames its entities to "Zone 1 - Couch" and "Zone 1
  presence - Couch". The radar's name is then no longer part of their friendly
  names, so with several radars give zones distinct names, or rename an entity
  yourself in its settings (a name you set there is kept by later zone
  renames). Clearing the name sets them back to "Zone 1" and "Zone 1 presence",
  still without the radar name. The card's own zone labels are not affected.
- `apollo_mmwave.update_zone` changes zones from automations and scripts;
  Settings → Tools → Actions lists its fields. It takes the radar's `device_id`
  and a `zone_id` of 1 or more, with geometry in millimeters. To clear a zone
  send `shape: none`, and to remove it and its entities send `delete: true`. A
  call that changes nothing, such as a `zone_id` alone or `data` without a
  `shape`, is refused with a warning in the log. The `display_units` field
  sets the map unit for everyone: `m`, `ft`, or `auto` to follow Home
  Assistant's unit system again (`auto` with no unit saved changes nothing
  and is refused like any other empty call). An accepted call fires
  `apollo_mmwave_zone_updated` with the radar's `device_id`. Only
  administrators can call the action. Automations still can, and a call made by
  another user, from a script they run for example, is refused.

  [![Open your Home Assistant instance and show your action tools with a specific action selected.](https://my.home-assistant.io/badges/tools_perform_action.svg)](https://my.home-assistant.io/redirect/tools_perform_action/?service=apollo_mmwave.update_zone)

## Use your own dashboards instead

Prefer to lay things out yourself? Untick **Add the Apollo mmWave dashboard to
the sidebar** during setup, or remove the dashboard later from the
integration's options (**Remove the Apollo mmWave dashboard**) or in Settings →
Dashboards. The cards and strategies stay available:

- **Dashboard strategy**: a whole dashboard with one tab per device, like the
  integration's own. In Settings → Dashboards, press **Add dashboard** and pick
  **Apollo Radar Tuning** under **Community dashboards**.

  [![Open your Home Assistant instance and show your dashboards.](https://my.home-assistant.io/badges/lovelace_dashboards.svg)](https://my.home-assistant.io/redirect/lovelace_dashboards/)

  Or create an empty dashboard, open its raw configuration editor and replace
  everything with:

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
  ```

  The integration never writes to or deletes a dashboard you made, with one
  catch: give yours a URL other than `apollo-mmwave`. If you delete the
  integration's own dashboard and make one on that URL whose configuration is
  exactly the strategy above, the integration may take it for its own. While
  a dashboard of yours holds `apollo-mmwave`, the integration cannot add its
  own there and says so. A YAML dashboard on `apollo-mmwave` is left alone,
  and so is a dashboard row the integration created there earlier while that
  YAML dashboard holds the path. To get rid of that old one, take the YAML
  dashboard off the path first and then delete it in Settings → Dashboards;
  deleting it while the YAML dashboard is there takes the YAML dashboard's
  panel down with it.

- **View strategy**: add a view (tab) to any dashboard that self-builds the
  full per-device layout:

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
    device_id: your_device_id   # optional; omit for all devices
  ```

  With several devices, every device's sections land in that one view with no
  separator between them, so set `device_id` for one device per view, or use
  the dashboard strategy for one tab per device.

- **Section strategy**: drop the mmWave cards into an existing *sections*
  dashboard as one section (optionally limited to a single device):

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
    device_id: your_device_id   # optional; omit for all devices
  ```

  The view and section strategies show nothing, with no message, when
  `device_id` or `devices` matches no device. Only the dashboard strategy
  explains an empty result.

  Editing a strategy view in the Home Assistant UI throws away its cards. Use
  **Take control** on the dashboard instead.

- **Cards**: `custom:apollo-radar-calibrate-card`,
  `custom:apollo-radar-distance-card`,
  `custom:apollo-radar-gate-energy-card`,
  `custom:apollo-radar-setup-card`, and
  `custom:apollo-radar-zone-map-card` can be placed individually (they're in
  the card picker). See [Card options](#card-options).

> **Already using the standalone Zone Mapper card?** Both can be installed side
> by side. Up to 2.0.0 they fought over the same element name,
> `zone-mapper-card`, and whichever bundle a browser loaded first won it, so
> one integration's card could end up writing to the other's backend. Our card
> is now `apollo-radar-zone-map-card` and answers to nothing else, so a
> hand-written `custom:zone-mapper-card` card that meant *this* one has to be
> updated by hand.

### Strategy options

The dashboard, view and section strategies take the same options:

| Option | What it does |
|---|---|
| `devices` | A list of device ids: show exactly these, online or not. Empty or absent shows every detected Apollo mmWave device. On the integration's own dashboard the **Dashboard devices** option writes this list. |
| `device_id` | One device id. It takes precedence: when both are set, only `device_id` is shown and `devices` is ignored. |
| `distance_unit` | The distance chart's unit: `mm`, `cm`, `m`, `in`, `ft` or `yd`, lowercase and written exactly so. Any other value (`CM`, `feet`) is ignored without a warning. Unset, the chart uses `m`, or `in` when Home Assistant uses US customary units. Only the distance cards read it. |
| `calibration` | Seeds every Auto-calibrate card's `calibration:` block (see [Auto-calibration](#auto-calibration)). |

### Card options

The **distance** and **gate-energy** cards take:

- `device_id`: the radar's Home Assistant device id. It survives renames, and
  the generated dashboard always sets it.
- `device_base_name`: a fallback for when `device_id` is missing or its
  entities are not registered yet. It is the shared part of the radar's entity
  ids, for example `apollo_msr_2_abc123` for
  `switch.apollo_msr_2_abc123_radar_engineering_mode`, and it is kept so older
  configs still resolve. A base name builds MSR-2 entity ids, so on an MSR-1 it
  cannot find the Bluetooth switch or the gate size select and the chart falls
  back to 0.75 m gates; set `device_id` there.
- `title`: defaults to the chip, "LD2410 Distances" and "LD2410 Gate Energy" on
  an MSR, "LD2412 Distances" and "LD2412 Gate Energy" on an R PRO-1.
- `entities`: an optional map that replaces individual resolved entity ids,
  keyed by the slot names in `EntityMap` (`frontend-src/src/types.ts`), for
  example `radar_target: binary_sensor.office_presence`. The four gate slots
  (`move_threshold`, `still_threshold`, `move_energy`, `still_energy`) take a
  list with one id per gate; any other value for them is ignored.
- `distance_unit` (distance card only): the same six units as the strategy
  option.

A distance or gate-energy card that cannot find its device, or whose device has
no gate radar (an MTR-1, say), shows "Apollo mmWave: device not found. Check
the card's device configuration." The Gate Energy chart shows "Radar
unavailable" while the radar is offline, and a button that turns on Radar
Engineering Mode while the radar is online with the mode off.

The calibrate, Radar setup and zone map cards take a `device_id`; `title` is
display only. The Radar setup card also takes `radar`: `ld2450` (the default)
checks the LD2450 above the zone map, and `gate` checks the LD2410 or LD2412
(see [Gate radar setup checks](#gate-radar-setup-checks)). The zone map starts locked once the radar has zones, and the
Lock toggle is remembered per radar in the browser. Set `start_locked: true`
or `false` (also in the card editor) to force the starting state instead.
Without a `grid`, the zone map fits the radar's view (see
[Map units and size](#map-units-and-size)). A `grid` (`x_min`, `x_max`,
`y_min`, `y_max`, in `grid_units`) fixes the map instead and draws it on a
square canvas, so a `grid` whose X span differs from its Y span is drawn
stretched; give both the same span for a true-to-scale map.
`cone.angle_deg` only sets where a double-click on the rotation slider resets
to: the cone, the live targets and the presence sensors all use the radar's
stored rotation, which is 0 until you set it with the slider (or with
`update_zone`'s `rotation_deg`).

## Support file

When you ask Apollo for help, send a support file. Open Settings → Devices &
services → **Apollo mmWave**, open the ⋮ menu and choose **Download
diagnostics**. The Device card at the bottom of each tab links to that page.
Home Assistant offers the download to administrators only.

[![Open your Home Assistant instance and show an integration.](https://my.home-assistant.io/badges/integration.svg)](https://my.home-assistant.io/redirect/integration/?domain=apollo_mmwave)

Home Assistant adds its own system details and your custom integrations'
versions. Apollo mmWave adds:

- The Apollo mmWave and Home Assistant versions, and Home Assistant's unit
  system (which decides feet or meters on the cards).
- The integration's options: which dashboard it created, whether that
  dashboard is still its own, and the **Dashboard devices** selection.
- The Lovelace resource mode and the `/apollo_mmwave/` resource rows.
- For each Apollo radar, and any other radar with zones, calibration data or
  a dashboard selection:
  - its name, model, firmware and hardware versions, and which radars it
    has;
  - the firmware version sensors, every update entity, and the Wi-Fi
    signal;
  - the gate radar's thresholds by gate;
  - the LD2450's Zone Type, Multi Target Tracking and the target X/Y sensors
    the zones track, with their readings and units;
  - its zones, rotation and units as stored, and this integration's zone
    entities;
  - the running calibration, the saved snapshots and the last calibration
    result.

Each entity is listed with its state, unit, device class and whether it is
disabled.

Left out: the radar's MAC address, IP address, Bluetooth MAC and Wi-Fi
network name are never read, and any MAC, IP, SSID, host, password, token or
user id that turns up anyway is replaced with `**REDACTED**`. Device names
and entity ids stay, because support needs them to tell radars apart.
Apollo's default device names, and so the entity ids, end in the last six
characters of the device's MAC address (for example `apollo_msr_2_7a711c`).

Downloading the file changes nothing: no setting, zone, dashboard or
resource is written.

## Removing Apollo mmWave

Deleting Apollo mmWave in Settings → Devices & services (the ⋮ menu on the
entry, then **Delete**) removes what it made: the Apollo mmWave dashboard it
created (unless you took control of it; dashboards you made yourself are never
touched), every zone and its two entities, and the
saved calibration values that **Undo** uses. From 2.2.5 it also removes its
two Lovelace resources, so dashboards stop asking for files that are gone.
The thresholds a calibration wrote stay on the radars. Setting Apollo mmWave
up again starts from nothing.

With Lovelace resources managed in YAML, the integration cannot remove them:
delete the two `/apollo_mmwave/` rows from your `resources:` by hand. It logs
a warning that names them. If you removed a release older than 2.2.5, delete
the two rows yourself under Settings → Dashboards → ⋮ → **Resources**.

[![Open your Home Assistant instance and show your dashboard resources.](https://my.home-assistant.io/badges/lovelace_resources.svg)](https://my.home-assistant.io/redirect/lovelace_resources/)

## Troubleshooting

- **A card or the dashboard does not load.** Do a hard refresh
  (Ctrl/Cmd+Shift+R). With Lovelace resources managed in YAML, add the two
  module resources from the log warning (see
  [Lovelace resources](#lovelace-resources)). A resource row you deleted comes
  back at the next Home Assistant restart, not on an integration reload.
- **There is no Apollo mmWave dashboard in the sidebar.** It is only for
  administrators unless you unticked that box, so sign in as one. If you
  unticked **Add the Apollo mmWave dashboard to the sidebar**, or setup could
  not create it (the log says why), add it from the integration's options; see
  [The Apollo mmWave dashboard](#the-apollo-mmwave-dashboard).
- **The Gate Energy chart says "Radar unavailable".** The radar is offline; the
  chart fills in once it reconnects. "Turn on Radar Engineering Mode" means the
  radar is online and the mode is off.
- **The radar triggers with nobody there.** Update to 2.2.4 or later and press
  **Calibrate with empty room** again, since 2.2.4 leaves more headroom. If it
  still triggers, raise the `margin` option (headroom in energy points), for
  example to 20, and calibrate again; see [Auto-calibration](#auto-calibration).
  The wiki section
  [The radar still triggers with nobody there](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/#the-radar-still-triggers-with-nobody-there)
  has more.
- **A distance or gate-energy card says "Apollo mmWave: device not found".**
  Its `device_id` matches no device with gate-radar entities, for example an
  MTR-1, an R PRO-1 without the optional LD2412, or a radar that was removed.
  Point it at an MSR-1, MSR-2 or an R PRO-1 with the LD2412.
- **Calibration says the radar has not reported its threshold values.** A radar
  that has been running for a long time may not have sent them to Home
  Assistant yet. Press **Read settings from the radar** on the card, or on the
  Radar setup card at the top of the tab. If neither offers it, open the
  radar's device page, press its Query Params button in the Diagnostic
  section, wait a few seconds and try again.
- **The zone map card says Apollo mmWave is not loaded.** Right after a restart
  the card retries on its own. If it still says so, reload the page once the
  integration has loaded.
- **The zone map shows no dot at all.** Look at the **Radar setup** card
  above the map. The usual cause is Zone Type set to **Detection**: the radar
  then reports only people inside its own built-in zones, and with none set
  it reports nobody, so the dots never appear. Press **Set Zone Type to
  Disabled** (or **Use recommended settings** if the card shows that
  instead). **Filter** works the other way round and hides only people
  inside those zones, so with none set it acts like Disabled. Disabled is
  still the one to use, because the zone map replaces the radar's built-in
  zones. If Zone Type is already Disabled and the **LD2450 Live** card's
  Presence stays off with you in front of the radar, the radar itself sees
  nobody: check that it is online and facing the room.
- **The zone map shows only one dot with several people in the room.**
  Usually Multi Target Tracking is off. Press **Turn on Multi Target
  Tracking** (or **Use recommended settings** if the card shows that
  instead) on the **Radar setup** card. On an R PRO-1, Home Assistant hides
  that setting by default, so the card cannot check it and shows no button.
  Enable it once: on the radar's device page, open the entities that are
  not shown under **Configuration**, select **LD2450 Multi Target
  Tracking**, turn on **Enabled** in its settings (⚙) and select
  **Update**. Reload this page after a minute; the card then checks the
  setting and offers the button when it is off.
- **The zone map dot stays at the sensor.** Before 2.2.7, the zone map card
  and the zone presence sensors read the radar's Target X and Y sensors as
  millimeters, whatever unit Home Assistant showed them in. Home Assistant set
  to US customary units shows them in inches, and you can change any of them
  by hand, so the dots sat at or right around the sensor and zone presence did
  not turn on. 2.2.7 reads each sensor's unit; update and the dots move. On an
  older release, open each Target X and Target Y sensor on the radar's device
  page (six of them, for the three targets), open its settings (⚙), set
  **Unit of measurement** to **mm** and select **Update**. Either way, check
  zones you drew while the dots were in the wrong place. From 2.2.7, the
  card's `input_units` only applies to target sensors without a length unit,
  such as DIY template sensors.
- **Zones are missing after a restart.** If `.storage/apollo_mmwave.zones` was
  edited by hand or partly restored and has the wrong shape, the integration
  logs what it could not read and loads the rest (possibly nothing), and the
  next save writes the file without it. Restore that file from a backup, with
  Home Assistant stopped, if the zones mattered.
- **Going back to an older release.** If a future release changes the zone
  store format, an older release cannot read the newer file: setup fails and
  the file is left untouched. Restore the backup you took before upgrading.
- **Still stuck?** Send Apollo a support file with your question: Settings →
  Devices & services → Apollo mmWave → ⋮ → **Download diagnostics**. It
  leaves out MAC and IP addresses and Wi-Fi names; see
  [Support file](#support-file).
