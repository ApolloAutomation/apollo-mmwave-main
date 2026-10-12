# Apollo mmWave

A single Home Assistant integration for **every Apollo mmWave sensor**: radar
tuning *and* zone mapping, from one HACS install.

When you set it up, Apollo mmWave adds an **"Apollo mmWave" dashboard** to your
sidebar with **one tab per detected device**:

- **MSR-1 / MSR-2** (LD2410) → a **Radar Tuning** tab (auto-calibration,
  distance chart, per-gate energy chart, thresholds, detection range,
  occupancy).
- **R PRO-1** (LD2412 + LD2450) → **Radar Tuning** *and* a **Zone Map** (draw
  occupancy zones over the LD2450's live targets) in the same tab.
- **MTR-1** (LD2450) → a **Zone Map** tab.

No raw-YAML editing, no Streamline/Plotly, and **no separate card downloads**:
the integration serves all of its frontend itself.

> Radar-tuning charts were inspired by MirkoP's MSR tuning dashboard; this
> project replaces the manual HACS + Streamline + Plotly + paste-950-lines setup
> with a zero-config dashboard.

## What's inside

| Piece | Role |
| --- | --- |
| `custom_components/apollo_mmwave` | The integration: zone backend (occupancy sensors + `apollo_mmwave.update_zone` service), gate auto-calibration (`apollo_mmwave.calibrate_gates` and its companion services), serves the bundled JS, and registers the dashboard. |
| `…/www/apollo-radar-tuning.js` | Tuning cards (including the Auto-calibrate card) + the `custom:apollo-radar-tuning` dashboard strategy (built from `frontend-src/`). |
| `…/www/apollo-radar-zone-map-card.js` | The 2D zone-drawing card, forked from [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) (also built from `frontend-src/`). |

The dashboard is **strategy-backed**: it re-detects your devices on every load,
so adding or removing a sensor adds or removes a tab, with nothing to maintain.

## Install (HACS)

1. HACS → ⋮ → **Custom repositories** → add this repo as type **Integration**.
2. Install **Apollo mmWave**, then restart Home Assistant.
3. **Settings → Devices & Services → Add Integration → Apollo mmWave.**
   Setup asks whether to add the sidebar dashboard (on by default).
4. Open the new **Apollo mmWave** dashboard in your sidebar.

The integration registers its JS as a Lovelace resource, so the cards work in
already-open tabs, with no browser reload needed. It keeps exactly one resource
row per bundle: each time Home Assistant starts, it points its row at the
current version as a JavaScript module and fixes or removes duplicate and
mistyped rows under `/apollo_mmwave/`. A row you delete by hand comes back at
the next restart; an integration reload does not recreate it.

**Resources managed in YAML.** If your Lovelace resources are set in YAML
(`lovelace: resource_mode: yaml`), the integration cannot add them. It logs a
warning that ends with the two URLs to add, and until you add them the cards
may only load after a hard refresh (Ctrl/Cmd+Shift+R). Copy the URLs from the
warning exactly and add each one once, as a module:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /apollo_mmwave/apollo-radar-tuning.js?v=2.2.0
      type: module
    - url: /apollo_mmwave/apollo-radar-zone-map-card.js?v=2.2.0
      type: module
```

The `?v=` is the integration version. After every upgrade, replace each row's
URL with the new one from the warning instead of adding a second row. An
out-of-date row makes the browser run the bundle twice, once from that row and
once from the URL the integration adds itself; a duplicate "Apollo Zone Map"
entry in the card picker is the sign.

## What changed in 2.2.0

2.2.0 adds auto-calibration and the fixes from a full review of the code.
Nothing needs changing by hand unless your automations call
`apollo_mmwave.update_zone` directly or your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see [Install](#install-hacs)).

**New**

- An **Auto-calibrate** card at the top of every gate-radar tab, backed by
  three new services (see [Auto-calibration](#auto-calibration)).
- First-run help on each tab: a "Start here" list, a button on the Gate Energy
  chart that turns on Radar Engineering Mode, outlined bars for gates above
  their threshold, a hint when an MSR still has factory thresholds, and the
  R PRO-1's Dynamic Background Correction rows in its Controls card.

**For automations that call `update_zone`**

- `zone_id: 0` is refused now; ids start at 1. A zone 0 made earlier from YAML
  or Developer Tools (the card never made or edited one) can no longer be
  changed or deleted through the service. To remove it, stop Home Assistant, take a backup, delete zone `"0"` from
  `.storage/apollo_mmwave.zones`, then start Home Assistant and delete the
  zone's two leftover entities in Settings → Devices & Services → Entities.
- Calls that change nothing (a `zone_id` alone, `data` without a `shape`, a
  `name` for a zone that does not exist) are refused with a warning in the log
  and no longer fire `apollo_mmwave_zone_updated`. Clear a zone with
  `shape: none`; `data: null` on its own never cleared anything.
- Coordinates that are `inf`, `nan` or larger than 2^53 - 1 clear the shape (or
  drop that polygon point) with a warning instead of failing the call, and a
  `rotation_deg` of `inf` or `nan` is ignored.
- `input_units` now survives restarts and reloads (HACS reloads on every
  update). If you set it only from an automation or Developer Tools, set it
  once more.
- Upgrading from 1.x keeps both names of a radar that was renamed on 1.x, for
  its zone entities and for `location:`.

**Changes you may notice**

- The Gate Energy chart says "Radar unavailable" while the radar is offline.
  Distance and Gate Energy cards are titled after the chip ("LD2412 Distances"
  on an R PRO-1), and one pointed at a device with no gate radar says "device
  not found" instead of going blank.
- Renaming a radar updates the open dashboard without a reload. A radar whose
  name contains `LD2412` or `LD2450` keeps its full name in its tab's URL, so a
  bookmark to that tab may need updating. An MSR named like an R PRO-1 or MTR-1
  no longer gets a Zone Map.
- An offline MTR-1 tab shows the offline note, a selected device that reports
  nothing says so, and a **Dashboard devices** selection whose devices are all
  gone explains that (see
  [Choosing which devices appear](#choosing-which-devices-appear)).
- Zone presence no longer flickers on or off when a target's X and Y arrive
  together, which is the normal case.
- Zone map drawing: touch input follows one finger, a click in rectangle mode
  no longer wipes the zone, a polygon survives the mouse leaving the grid, and
  Backspace or Escape typed into a text field leave it alone (see
  [Drawing zones](#drawing-zones)). Right after a restart the card retries
  instead of showing "Unknown command."
- Zone manager: **Delete** can no longer be undone, a name you are typing
  survives updates, and names from the card's YAML `zones:` list stick. The
  map draws the stored rotation, not the YAML `cone.angle_deg`.
- Duplicate Lovelace resource rows are removed. A dashboard row the integration
  made earlier on `apollo-mmwave` is no longer deleted while a YAML dashboard
  holds that path (deleting it took the YAML dashboard's panel with it). A zone
  store file with the wrong shape no longer stops the integration from loading.
  It loads what it can, logs what it could not read, and rewrites the file
  without the unreadable parts, so keep a backup (see
  [Troubleshooting](#troubleshooting)).

Developer tooling changed too; see [Development](#development).

## Upgrading to 2.0

Most of 2.0 lands on its own the first time it starts. A few things need you to
change something by hand, so work through this list before you decide the
upgrade went wrong.

### Change these yourself

**Rename the card in any hand-written config.** The custom element is
`custom:apollo-radar-zone-map-card` now, and it takes a `device_id` plus an
optional `title` instead of `location`. A card still set to
`custom:zone-mapper-card` will show up as a missing card. There is deliberately
no alias for the old name: it was the same name the standalone Zone Mapper card
uses, so whichever bundle a browser happened to load first won it, and one
integration's card could end up writing zones into the other's backend.

**Pass `device_id` to `apollo_mmwave.update_zone`.** Automations written
against 1.x keep working: `location` is still accepted as a deprecated alias
and is matched against the display name your zones were stored under. It logs a
warning once per restart and will be removed in a later release. If a radar was
renamed on 1.x and its zones ended up under two names, either name works, as
long as you upgrade from 1.x to 2.2.0 or later.

**Update anything listening for `apollo_mmwave_zone_updated`.** The event now
carries `{"device_id": ...}` where it used to carry `{"location": ...}`. A
trigger reading `trigger.event.data.location` will stop matching.

Also check any `update_zone` call that passes `entities`. An empty list means
"leave the tracked pairs alone" now, where before it erased them, which is what
wiped people's configuration when a card called the service before it had
finished loading. To actually empty the list, pass `clear_entities: true`.

### What happens for you

**Zone presence follows the card's units.** A card configured with
`input_units` other than millimeters (DIY hardware only; Apollo firmware reports
millimeters) tells the integration which unit the target sensors use on every
save, and the zone presence sensors scale readings the same way. The
`apollo_mmwave.update_zone` service takes `input_units` directly as well.

**Target sensors are found automatically.** The card's old "Device and Targets"
picker is gone. The integration locates the radar's LD2450 X/Y target sensors
itself, so an R PRO-1 or MTR-1 tracks targets with nothing selected by hand. If
you are on DIY hardware and need to point it somewhere else, set the pairs
through `apollo_mmwave.update_zone` with its `entities` list. Pairs set that way
are stored as entity ids and do not follow a rename: after renaming a tracked
sensor, call `update_zone` again with the new ids, or the zone's presence reads
off. Automatically found pairs follow renames on their own.

**Zone entities move onto the radar's device.** They are no longer pinned to a
generated entity id, so they show up on the radar's device page and you can
rename them to whatever you like. Upgrading keeps your existing entity ids,
custom names, and area assignments: only the internal unique id is rewritten.
For a radar renamed on 1.x, that covers the entities created under either name
when you upgrade from 1.x to 2.2.0 or later. An install that was already on 2.0
or 2.1 kept only the first name, so the second name's entities stay next to the
new ones; delete the stale one, or point your automations at the new one.

**Renaming a radar no longer orphans its zones.** Zones are keyed by device id
instead of by display name.

**Zones from the older two-piece setup are imported when nothing is stored
yet.** If you have the standalone `zone_mapper` integration and Apollo mmWave
has no stored zone data of its own, its zones are read in at setup. That is a
fresh install, or any upgrade from before 1.2.0, which is the release that
moved zone data into storage. The import is read-only and nothing belonging to
that integration is renamed or removed. **Do not uninstall the old integration
until you have confirmed your zones came across**, because its restore data is
the only copy and it goes away with its entities. A `zone_mapper` location that
matches no Home Assistant device is skipped with a warning in the log, and its
zones have to be redrawn on the card.

Upgrading from 1.2.0 or later, you already have stored zone data, so the import
is skipped and 2.0 keeps what you have. Your `zone_mapper` zones are untouched,
so open the Apollo Zone Map card and redraw the ones you want here, then remove
the old integration once you are happy with them.

**The sidebar dashboard is a real dashboard.** It has a proper name on
Settings → Dashboards, "take control" works on it, and you can delete it. On
recent Home Assistant versions the 1.3.x sidebar dashboard did not register at
all; this is the fix. Note that the "auto-create dashboard" option decides
whether the dashboard exists, so deleting it brings it back the next time the
integration loads unless you turn that option off in the integration's options
first.

**The card follows your Home Assistant theme.** Switching Home Assistant
between light and dark switches the card with it. `dark_mode` in the card
config is an override now rather than the only way to get a dark card, so
remove it if you want the card to track your theme. The card editor has an
"Appearance" dropdown (follow theme / light / dark) that sets or clears this
key for you, next to the radar dropdown and the title.

### Known limitations

Editing a strategy view in the Home Assistant UI still throws away its cards.
That is how Home Assistant treats strategy views and not something this
integration can change. Use "take control" on the dashboard instead of editing
the view.

If you renamed a radar before upgrading, the zones you drew under its old
display name are kept but not shown: the card comes up empty and those zone
entities read as unavailable. To get them back, rename the radar to the old
name and reload the integration. That check runs on every setup, so the zones
move onto the device as soon as the names line up again. If you would rather
keep the new name, redraw the zones on the card.

If the same zone number exists both on a device and in leftover pre-2.0 data
that later resolves to that device, the copy already on the device wins and the
leftover copy is dropped. It is written to the log when it happens, so search
your log for `apollo_mmwave` if a zone you expected is missing.

A running auto-calibration does not survive a Home Assistant restart; the saved
thresholds do, and the Auto-calibrate card shows an interrupted banner with
Turn it off and Undo after the restart. The card offers only the newest saved
snapshot as Undo; older ones can be restored through the
`apollo_mmwave.restore_gate_thresholds` service with a `snapshot_id`.

## Choosing which devices appear

By default the dashboard shows every Apollo mmWave device Home Assistant
knows about, online or not. An unplugged radar keeps its tab with an
"offline" note so it is not silently missing; a leftover registry entry from
reflashed hardware shows the same way until you delete the old device in
Settings → Devices & Services. A device without an Apollo model in the
registry (DIY builds) is only picked up while one of its radar entities is
live. To control the list yourself, open the integration's options (Settings
→ Devices & Services → Apollo mmWave → Configure) and pick **Dashboard
devices**: the dashboard then shows exactly those devices and hides the rest.
Leave the selection empty to go back to automatic detection. Changes apply
immediately.

The selection applies only while the Apollo mmWave dashboard is still generated
automatically. Once you take control of it, the integration no longer writes to
it, so add or remove devices in the dashboard itself.

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
into its raw configuration editor (it rewrites only `type` and `devices`), so a
`device_id` added there overrides the **Dashboard devices** option. See
[Strategy options](#strategy-options) for the full list.

## Auto-calibration

Every gate-radar tab (MSR-1, MSR-2, R PRO-1) starts with an **Auto-calibrate**
card. Press **Calibrate with empty room** and leave: Home Assistant turns Radar
Engineering Mode on, counts down 15 seconds so you can get out, listens to every
gate's move and still energy for a minute, then sets each threshold a margin
above the background it heard. Your current thresholds are saved first, so the
card always offers **Undo (restore 14:31 values)**, labeled with the time of
the saved values (and the date, on a later day), and that saved copy survives a
Home Assistant restart.

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
not echo back. The job runs in the backend, so closing the browser does not
stop it; reopen the dashboard and the card picks the running job up again. If
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
  margin: 10                   # headroom in energy points (0..50)
  margin_pct: 25               # headroom in percent of the peak (0..100)
```

The same `calibration:` block on a `custom:apollo-radar-tuning` strategy seeds
every generated card. The card drives the `apollo_mmwave.calibrate_gates`,
`apollo_mmwave.cancel_calibration` and `apollo_mmwave.restore_gate_thresholds`
services, which automations can call directly; see the service descriptions in
Developer Tools.

### The calibration services

| Service | What it does |
|---|---|
| `apollo_mmwave.calibrate_gates` | The run described above for one radar (`device_id`). Optional `duration_s` (15 to 600, default 60), `settle_s` (0 to 120, default 15), `margin` (0 to 50 points, default 10), `margin_pct` (0 to 100 percent, default 25; the larger headroom wins per gate, and both cannot be 0), `kind` (`both`, `move` or `still`), `apply` (`false` previews without writing) and `wait` (`true` blocks until the job ends and returns the full result). |
| `apollo_mmwave.cancel_calibration` | Stops the running job for one radar. Nothing is written if it had not started writing; values already written stay until you restore. |
| `apollo_mmwave.restore_gate_thresholds` | Writes the thresholds saved before the last calibration back (or a chosen `snapshot_id`). The current values are saved first, so a restore can itself be undone. |

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
one that turned it on, so a calibration adds about two minutes of that. If you
leave the mode on to watch the Gate Energy chart, exclude the per-gate energy
sensors. The globs match the gate number exactly (one digit on the LD2410, two
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

## Drawing zones

The **Zone Map** card on R PRO-1 and MTR-1 tabs draws occupancy zones over the
LD2450's live targets. Pick a zone with its button, choose Rectangle, Ellipse
or Polygon from the drawing-mode menu (✎), and draw on the grid:

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
  Developer Tools → Actions lists its fields. It takes the radar's `device_id`
  and a `zone_id` of 1 or more, with geometry in millimeters. To clear a zone
  send `shape: none`, and to remove it and its entities send `delete: true`. A
  call that changes nothing, such as a `zone_id` alone or `data` without a
  `shape`, is refused with a warning in the log. An accepted call fires
  `apollo_mmwave_zone_updated` with the radar's `device_id`.

## Use your own dashboards instead

Prefer to lay things out yourself? Turn off the dashboard during setup (or any
time in the integration's options; it takes effect immediately). The cards and
strategies stay available:

- **Dashboard strategy**: a whole dashboard with one tab per device, like the
  integration's own. Create a dashboard, open its raw configuration editor and
  replace everything with:

  ```yaml
  strategy:
    type: custom:apollo-radar-tuning
  ```

  Give it a URL other than `apollo-mmwave`, which belongs to the integration:
  while the auto-create option is off, every Home Assistant restart and
  integration reload deletes a dashboard on that path whose configuration is
  this strategy. A YAML dashboard on `apollo-mmwave` is left alone, and so is a
  dashboard row the integration created there earlier while that YAML
  dashboard holds the path. To get rid of that old one, take the YAML
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

- **Cards**: `custom:apollo-radar-calibrate-card`,
  `custom:apollo-radar-distance-card`,
  `custom:apollo-radar-gate-energy-card`, and
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

The calibrate and zone map cards take a `device_id`; `title` is display only.
The zone map starts locked once the radar has zones, and the Lock toggle is
remembered per radar in the browser. Set `start_locked: true` or `false` (also
in the card editor) to force the starting state instead. The map is drawn on a
square canvas, so a `grid` whose X span (`x_min` to `x_max`) differs from its Y
span (`y_min` to `y_max`) is drawn stretched; give both the same span for a
true-to-scale map. `cone.angle_deg` only sets where a double-click on the
rotation slider resets to: the cone, the live targets and the presence sensors
all use the radar's stored rotation, which is 0 until you set it with the
slider (or with `update_zone`'s `rotation_deg`).

## Troubleshooting

- **A card or the dashboard does not load.** Do a hard refresh
  (Ctrl/Cmd+Shift+R). With Lovelace resources managed in YAML, add the two
  module resources from the log warning (see [Install](#install-hacs)). A
  resource row you deleted comes back at the next Home Assistant restart, not
  on an integration reload.
- **The Gate Energy chart says "Radar unavailable".** The radar is offline; the
  chart fills in once it reconnects. "Turn on Radar Engineering Mode" means the
  radar is online and the mode is off.
- **A distance or gate-energy card says "Apollo mmWave: device not found".**
  Its `device_id` matches no device with gate-radar entities, for example an
  MTR-1 or a radar that was removed. Point it at an MSR-1, MSR-2 or R PRO-1.
- **The Zone Map card says Apollo mmWave is not loaded.** Right after a restart
  the card retries on its own. If it still says so, reload the page once the
  integration has loaded.
- **Zones are missing after a restart.** If `.storage/apollo_mmwave.zones` was
  edited by hand or partly restored and has the wrong shape, the integration
  logs what it could not read and loads the rest (possibly nothing), and the
  next save writes the file without it. Restore that file from a backup, with
  Home Assistant stopped, if the zones mattered.
- **Going back to an older release.** If a future release changes the zone
  store format, an older release cannot read the newer file: setup fails and
  the file is left untouched. Restore the backup you took before upgrading.

## Development

Frontend source lives in `frontend-src/` (TypeScript + Lit + Vite, with Vitest
tests). The build writes straight into the integration's `www/` folder, and the
built bundles are committed. CI runs the first four steps, on Node 22:

```bash
cd frontend-src
npm ci              # install exactly what package-lock.json pins
npx tsc --noEmit    # type check
npm test            # vitest
npm run build       # → ../custom_components/apollo_mmwave/www/*.js (one pass per bundle)
npm run watch       # rebuild both bundles on every save (Ctrl+C stops both)
```

Use `npm ci` rather than `npm install`, which can rewrite `package-lock.json`.
CI rebuilds the bundles and fails if anything under
`custom_components/apollo_mmwave/www/` differs from what is committed
(including a new or deleted file), so run `npm run build` and commit `www/` with
every frontend change. Build with Node 22 to match the committed output. The
zone-map bundle keeps the comments from `src/zone-map/card.ts`, so even a
comment-only change there needs a rebuild. `npm run watch` needs a POSIX shell
(macOS, Linux, the devcontainer or WSL). On Windows npm runs scripts with
`cmd.exe`, even from Git Bash, so run `npm run watch:tuning` and
`npm run watch:zone-map` in two terminals.

The Python backend has a pytest suite (`pytest-homeassistant-custom-component`)
and is linted with [Ruff](https://github.com/astral-sh/ruff). It needs Python
>= 3.14.2 (`requires-python` in `pyproject.toml`), plus
[uv](https://docs.astral.sh/uv/) for the test commands:

```bash
scripts/bootstrap                        # .venv: Home Assistant, Ruff, pre-commit + git hook
uv pip install -r requirements-test.txt  # test dependencies, same .venv
uv run --no-project pytest tests/
scripts/lint                             # Ruff: fix, format, then check
scripts/lint-check                       # read-only check, as the Lint workflow runs it
```

`scripts/bootstrap` builds `.venv` from `python`. If that is not Python 3.14.2
or later, name another interpreter: `PYTHON=python3.14 scripts/bootstrap`. Do
not run `uv venv` after bootstrap: uv refuses to replace an existing `.venv`,
and `uv venv --clear` would throw away Ruff and pre-commit.
`.venv/bin/python -m pytest tests/` runs the suite as well.

CI's test job starts from a clean checkout instead:

```bash
uv venv && uv pip install -r requirements-test.txt
uv run --no-project pytest tests/ -q --cov=custom_components/apollo_mmwave --cov-report=term-missing
```

That environment has no Ruff, so `scripts/lint` and `scripts/lint-check` stop
there with ".venv/bin/ruff not found: run scripts/bootstrap first". The coverage
flags work locally too (`pytest-cov` comes with
`pytest-homeassistant-custom-component`); CI prints the table and enforces no
threshold.

The version is kept in five places:
`custom_components/apollo_mmwave/manifest.json`, `pyproject.toml`,
`frontend-src/package.json`, `CARD_VERSION` in `frontend-src/src/index.ts`, and
`frontend-src/package-lock.json` (refresh it with
`cd frontend-src && npm install --package-lock-only`).
`tests/test_versions.py` and `frontend-src/test/build.test.ts` fail if a copy
is missed. The manifest version is the `?v=` on the served bundles, so a
release that changes the bundles needs a bump, or browsers keep their cached
copy. Rebuild after bumping, since `CARD_VERSION` is part of the tuning bundle.

Zone data is persisted in `.storage/apollo_mmwave.zones`; installs upgrading
from ≤1.1.x are migrated automatically. 2.0 also rewrites zone entity unique
ids from the display-name slug to the device-keyed form. Entity ids are left
alone, and the card reads its configuration over the websocket API rather than
off a fixed entity id. Calibration snapshots (the newest five per radar) live
in a separate file, `.storage/apollo_mmwave.calibration`.

The zone-drawing card is no longer vendored. It started as a copy of
[zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) and is
now a fork living in `frontend-src/src/zone-map/`: fixes land here first and
get offered back upstream, rather than being re-applied as patches on every
upstream drop.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request checklist and the
devcontainer.

## Credits

- **Brandon Harvey ([@bharvey88](https://github.com/bharvey88))** got this
  project started and published the original Apollo mmWave repository, which
  this one continues. Thank you, Brandon, for all the work that went into
  getting it off the ground.
- Zone-mapping backend & card: Apollo Automation's
  [zone-mapper](https://github.com/ApolloAutomation/zone-mapper) /
  [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card).
- Radar-tuning dashboard inspiration: MirkoP's MSR tuning dashboard.
