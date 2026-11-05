# Apollo mmWave configuration

This page has the details behind the [README](../README.md). Start there to
install the integration and run your first calibration.

## Contents

- [The Apollo mmWave dashboard](#the-apollo-mmwave-dashboard)
  - [A saved copy misses new cards](#a-saved-copy-misses-new-cards)
- [Lovelace resources](#lovelace-resources)
  - [After an update](#after-an-update)
- [Choosing which devices appear](#choosing-which-devices-appear)
- [What each tab shows](#what-each-tab-shows)
  - [Start here](#start-here)
  - [Gate radar cards](#gate-radar-cards)
  - [Locked sliders](#locked-sliders)
  - [Gate radar setup checks](#gate-radar-setup-checks)
  - [Device card](#device-card)
- [Auto-calibration](#auto-calibration)
  - [The calibration services](#the-calibration-services)
- [The zone map and its cards](#the-zone-map-and-its-cards)
  - [Radar setup](#radar-setup)
  - [What the map shows](#what-the-map-shows)
  - [Zoom and pan](#zoom-and-pan)
- [Drawing zones](#drawing-zones)
  - [The Zones panel](#the-zones-panel)
  - [Mark corners by walking](#mark-corners-by-walking)
  - [Map units and size](#map-units-and-size)
  - [Ignore zones and hold time](#ignore-zones-and-hold-time)
  - [Zones in automations](#zones-in-automations)
- [Movement history](#movement-history)
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
- **Restore the automatic dashboard** shows up instead of both while the
  dashboard is a saved copy; see
  [A saved copy misses new cards](#a-saved-copy-misses-new-cards).
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

### A saved copy misses new cards

**Take control** saves the cards the dashboard had at that moment. From then
on it no longer builds itself, so it misses every card a later release adds,
such as the Radar setup card, **LD2450 Controls** (Zone Type and Multi
Target Tracking) and the Device card, and nothing on it says so. While the
dashboard the integration created is such a saved copy, still made of
Apollo mmWave cards, Home Assistant lists the repair "The Apollo mmWave
dashboard is a saved copy" under Settings → System → Repairs, and the
integration's options offer **Restore the automatic dashboard**.

[![Open your Home Assistant instance and show your repairs.](https://my.home-assistant.io/badges/repairs.svg)](https://my.home-assistant.io/redirect/repairs/)

Both say what they do and change nothing until you press **Submit**. Then:

1. Your copy is saved as a new dashboard named **Apollo mmWave (saved
   copy)**, at `/apollo-mmwave-saved` (or `/apollo-mmwave-saved-2` and so on
   when that is taken). It is not in the sidebar, so open it from Settings →
   Dashboards, and it is admin-only if your dashboard was.
2. Only once the copy is saved, `/apollo-mmwave` gets the automatic dashboard
   back, with the devices chosen in the options. Its title, icon, sidebar
   and admin settings stay as they are.

If the copy cannot be saved, nothing changes. If the dashboard cannot be
restored, the copy stays and the dashboard is left as it was; the log says
why, and the repair stays so you can try again. Each try keeps another copy,
which you can delete in Settings → Dashboards.

The integration checks each time it starts and whenever its options change.
A dashboard you rebuilt with no Apollo mmWave cards on it is yours and gets
no repair. The check only looks at the dashboard the integration recorded as
the one it created, so a copy it no longer knows gets no repair either; see
[Troubleshooting](#troubleshooting). Deleting that dashboard makes the
integration forget it, so one you make on `/apollo-mmwave` later gets no
repair, unless you deleted it while the integration was not running (see
[Use your own dashboards instead](#use-your-own-dashboards-instead)).
Removing the integration removes the repair and keeps the copy.

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
    - url: /apollo_mmwave/apollo-radar-tuning.js?v=2.4.0
      type: module
    - url: /apollo_mmwave/apollo-radar-zone-map-card.js?v=2.4.0
      type: module
```

The `?v=` is the integration version, such as `?v=2.4.0`, and nothing else,
so a bundle's URL changes only when the version does. After every upgrade,
replace each row's URL with the new one from the warning instead of adding a
second row. An out-of-date row makes the browser run the bundle twice, once
from that row and once from the URL the integration adds itself; a duplicate
"Apollo Zone Map" entry in the card picker is the sign.

### After an update

After an update, a browser tab or the Home Assistant app can keep running the
cards it loaded before, and the new files can be on disk before Home
Assistant restarts into them. The cards ask Home Assistant which Apollo
mmWave it runs, when the page opens and again each time the page reconnects
to Home Assistant, and compare that with their own version. Any signed-in
user can ask, so the check works for everyone. When the two differ, the card
says so (the versions here are examples):

- **The page runs older cards:** "Apollo mmWave was updated to 2.4.1, but
  this page still runs 2.4.0." with a **Reload** button, and under it "In
  the Home Assistant app, if Reload does not help, close the app fully and
  open it again." If the app still shows the old cards after that, reset its
  cache:
  - Android: **Settings → Companion app → Troubleshooting → Reset frontend
    cache**.
  - iPhone and iPad: **Settings → Companion app → Debugging → Clear web view
    cache**.
- **The page runs newer cards:** "Apollo mmWave 2.4.1 is installed, but
  Home Assistant still runs 2.4.0. Restart Home Assistant to finish
  updating." There is no button: restart Home Assistant (Settings → System,
  the power icon in the top right).

If Home Assistant restarted into another version while the page was open,
also after going back to an older release, the card asks for a reload.
Matching versions, or an answer the card cannot read, show nothing.

The check runs in the cards the page has loaded, and cards from 2.4.0b2 and
earlier have none. On an update from them, a page that still runs the old
cards shows no notice, so no notice does not mean the page is current:
reload it anyway (Ctrl/Cmd+Shift+R in a browser, or close the Home
Assistant app fully and open it again).

One card per page shows the notice: on the Apollo mmWave dashboard that is
the **Radar setup** card near the top of the tab, above its checks. The zone
map card shows it under its title, also as a view-only map and on its error
screen, when it is the first card on the page that checks, as on a
dashboard of your own.

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
remove devices in the dashboard itself; the selection is kept and used if you
restore the automatic dashboard (see
[A saved copy misses new cards](#a-saved-copy-misses-new-cards)). A dashboard
you added yourself takes its own `devices` list (below).

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
optional LD2412. On a wide screen the cards sit in columns, and on R PRO-1
and MTR-1 tabs the zone map's column is twice as wide as the others; on a
phone they read top to bottom in the order below.

- **MSR-1 and MSR-2:** Start here, Radar setup, Auto-calibrate, LD2410
  Controls and LD2410 Zone Config; then LD2410 Distances, Detection Range
  and Target / Occupancy; then Gate Energy and Move Thresholds; then the
  occupancy history, Still Thresholds and the Device card.
- **R PRO-1:** Start here, the LD2412's Radar setup, Auto-calibrate, LD2412
  Controls and Target / Occupancy; then, in the wide column, the Zone Map
  heading with the LD2450's Radar setup and the zone map; then the LD2450's
  cards (see [The zone map and its cards](#the-zone-map-and-its-cards));
  then the LD2412's Distances, Detection Range, Gate Energy, Move
  Thresholds, Occupancy History, Still Thresholds and the Device card.
- **MTR-1:** in the wide column, Start here and Radar setup side by side,
  with the zone map under them; then Zone presence, LD2450 Live and
  Occupancy History; then LD2450 Controls, the radar's built-in zones and
  the Device card.

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
  2.5 ft" on a US customary system). Under the steps: "**In automations**,
  use **Radar Target** for the whole room. If it turns off while someone
  sits still, raise **Radar Timeout** to 60 s or more." It adds "To ignore
  people past End Zone 3, use **Any zone** instead." when the sensor has
  Any zone. A **Full tuning guide →** link opens the Apollo wiki.
- **R PRO-1:** first what each radar is for: the LD2412 senses people
  anywhere in range, even sitting still, and the LD2450 tracks where people
  are and drives the zone map. Then the LD2412 steps above, and for the
  LD2450: fix anything its Radar setup card flags, set **Cone rotation**
  (under Map settings on the zone map), then press **Add zone**, draw the
  zone and walk into it. **In automations**, use **LD2412
  Presence** (the Radar Target row on this tab) for the whole room, or a
  zone's presence sensor for one part of it.
- **MTR-1:** fix anything the Radar setup card flags, set **Cone rotation**
  (under Map settings on the zone map) to match how the sensor is mounted,
  then press **Add zone** under the zone map and drag on the map to draw the
  zone, reload the page, and walk into the zone to watch it turn on under
  Zone presence. **In automations**, use a zone's presence sensor, or
  **LD2450 Presence** for anywhere the radar sees. An R PRO-1 without the
  optional LD2412 gets these steps too.

An offline sensor's help card adds an "Offline right now" note. The note is
written when the page loads, so after the radar comes back it stays until you
reload the page.

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
  gives each gate's depth in your units, as Start here does ("about 0.75 m",
  or "about 2.5 ft" on a US customary system), and says that Radar Timeout
  is how long **Radar Target** (on the R PRO-1, **LD2412 Presence**) stays
  on after the radar last detects someone. Its gate sliders start locked;
  see [Locked sliders](#locked-sliders).
- **Distances:** a bar for each of Detection, Moving and Still, at the
  distance the radar gives for that target, over the gates and the range
  limits. A row whose target is off is faded and reads "no target". A row
  whose target is on while its distance reads unknown reads "distance
  unknown" instead of drawing 0, and its tooltip adds "The radar reports a
  target, but its distance reads unknown." The LD2410 zones need that
  distance, so they can read Clear meanwhile; Radar Target does not.
- **Gate Energy:** while Radar Engineering Mode is on, a move and a still
  bar for each gate, with a triangle at each threshold (▶ move, ◀ still).
  The legend says "outlined bar = above threshold". Gates the radar
  ignores, past Max Move Gate or Max Still Gate on the LD2410 or outside Min
  Gate to Max Gate on the LD2412, are faded and never outlined, and the
  legend then adds "faded = outside the radar's range (ignored)". Under the
  chart, the radar's own answer: "The radar reports a moving and a still
  target.", "The radar reports a moving target.", "The radar reports a still
  target." or "The radar reports no target." An outlined bar is not a
  detection by itself: when an LD2410 reports no target while a gate it uses
  is outlined, the chart adds "Energy above a threshold does not always mean
  a target. Once the LD2410 loses someone who sits still, it often needs
  them to move before it detects them again." With the mode off the chart
  is dimmed and offers **Turn on Radar Engineering Mode**.
- **LD2410 Zone Config** (MSR only): Start Zone 1 and End Zone 1 to 3. The
  note under it says the boxes are in cm, also on a US customary system
  ("100 cm is about 3.3 ft"), and that the zones sit back to back: Zone 1
  runs from Start Zone 1 to End Zone 1, Zone 2 from there to End Zone 2, and
  Zone 3 from there to End Zone 3. It adds that **Any zone** is on while
  someone is in any of the three zones, so it ignores people past End Zone
  3, and ends "For the whole room, use **Radar Target** in automations: the
  zone sensors also need the radar's distance, which can read unknown while
  someone is there."
- **Move Thresholds** and **Still Thresholds:** one row per gate, named for
  how far out the gate reaches: "G0 (at the sensor)", "G1 (about 0.75 m)" up
  to "G8 (about 6 m)" on the LD2410, in feet ("G4 (about 10 ft)") on a US
  customary system. The distances use 0.75 m gates, or the radar's own gate
  size when that hidden setting is enabled. The sliders start locked; see
  [Locked sliders](#locked-sliders).
- **Target / Occupancy:** Radar Target, Radar Moving Target, Radar Still
  Target and, on an MSR, Radar Zone 1 to 3 Occupancy and **Any zone**. Any
  zone is on while someone is in any of the three zones, so it ignores
  people past End Zone 3. The rows light up while on.
- **Occupancy History:** the last 24 hours. On an MSR (titled "LD2410
  Occupancy History"): Detected, Moving, Still, Any zone and Zone 1 to 3. On
  an R PRO-1: LD2412 Presence, LD2412 Moving, LD2412 Still, LD2450 Presence
  and each zone you drew. A zone you just drew joins the history after a
  page reload.

### Locked sliders

On MSR-1, MSR-2 and R PRO-1 tabs the gate radar's sliders start locked, so a
finger that lands on one while you scroll a phone cannot move it. That
covers every threshold on **Move Thresholds** and **Still Thresholds** and
the two gate sliders on **Detection Range** (Max Move Gate and Max Still Gate
on the LD2410, Max Gate and Min Gate on the LD2412).

- A locked slider is gray and still shows its value. A scroll that starts on
  it scrolls the page.
- Each of those cards has a **Sliders locked** row above its sliders. Press
  **Unlock** there to unlock all of that sensor's sliders on all three
  cards. The row then reads **Sliders unlocked**, and **Lock** locks them
  again.
- They lock again by themselves after 5 minutes without a change, when you
  leave the tab or the dashboard, and whenever the page loads. They never
  lock while you are dragging one.
- Touch a locked slider and it turns orange for a moment while **Unlock**
  flashes. Try again within 10 seconds and Home Assistant shows "These
  sliders are locked. Press Unlock above them to change one." with an
  **Unlock** button. With a keyboard, an arrow key on a locked slider shows
  that reminder at once.
- Not locked: number boxes such as Radar Timeout and the LD2410 Zone Config
  boxes, the LD2450's settings, a row's name (a tap opens its details, where
  you can still change the value), **Calibrate with empty room** and
  **Undo**.
- The lock lives in the browser page: another phone or browser tab has its
  own, and nothing is saved on the sensor. It is separate from the zone
  map's **Locked** button, which the browser remembers and which also locks
  the map's **Cone rotation** slider (see
  [Drawing zones](#drawing-zones)).
- A dashboard you took control of before 2.3.0 keeps plain slider rows with
  no lock. [Card options](#card-options) shows how to add it.

### Gate radar setup checks

The **Radar setup** card under Start here on MSR-1, MSR-2 and R PRO-1 tabs
checks the gate radar (the LD2410 or LD2412). It changes nothing on its own:
each button names what it does and makes that one change, the buttons are
greyed out while it is sent, and if Home Assistant refuses it the card says
why.
The card's second line names the chip and the sensor ("LD2412 · Office"),
so on an R PRO-1 you can tell it from the LD2450's card above the zone map.
Under that line it can show a notice that the page runs other cards than
Home Assistant does (see [After an update](#after-an-update)).

- **Radar Engineering Mode left on.** The card says "Radar Engineering Mode
  is on, so every gate's energy is saved to the database about once a
  second." The Gate Energy chart needs it only while you watch it. **Turn
  off Radar Engineering Mode** turns it off. While a calibration runs on the
  radar the card says nothing about it, because the calibration turns the
  mode on and off itself; until the card knows whether one is running, it
  shows "Checking the radar's settings...".
- **Settings not reported yet.** When a gate threshold, the detection range
  or the timeout reads unknown, their rows are blank, and unread thresholds
  stop calibration from starting. **Read settings from the radar** only asks
  the radar to send them; nothing on the radar changes. The card waits a few
  seconds for the answer and, if none comes, says "The radar has not sent
  its settings yet. Try again in a moment." When the radar's query button is
  not available, the card says to press Query Params on the radar's device
  page instead.
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
  it reads **Restart device (both radars)**, and on an MTR-1, or an R PRO-1
  without the optional LD2412, **Restart device (also restarts the radar)**.
  The device is offline for a short while before it reconnects.
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

Before a run, after an Undo and after a calibration that updated the
thresholds, the card also says "If Radar Target turns off while someone sits
still, raise Radar Timeout to 60 s or more on the Detection Range card. Undo
restores the thresholds from before a calibration." The radar can drop a
person who sits very still once their still energy stays under the threshold
for longer than Radar Timeout (5 s from the factory), and a calibration sets
each threshold with headroom above the empty room, so a longer Radar Timeout
is the first thing to try and Undo the second.

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
[Radar setup](#gate-radar-setup-checks) card near the top of the tab flags the
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
three columns, the first of them, with **Start here** at its top, twice as
wide as the others. On an R PRO-1 they come after the LD2412's first
column, under the **Zone Map** heading, also with the zone map in a column
twice as wide (see [What each tab shows](#what-each-tab-shows)). Where the
screen has room for only two columns, the wide column takes the whole row
and the cards after it move up into any gap. On a phone they read top to
bottom in this order:

- **Radar setup** checks the radar's settings and fixes them with one tap;
  see [Radar setup](#radar-setup).
- **The zone map** shows where the radar sees people and which zones are on
  (see [What the map shows](#what-the-map-shows)). Add, name and set zones
  in the **Zones** panel under it and draw them on the map; see
  [Drawing zones](#drawing-zones).
- **Zone presence** lists each zone's presence sensor, colored while someone
  is in the zone. A zone you add shows up here after you reload the page; a
  zone you delete leaves the list at once. With no zones it says "Press
  **Add zone** under the zone map to get a presence sensor for a zone.
  Reload this page to see it here." While the radar is offline the rows
  hide, because zone presence then reads `unavailable`.
- **LD2450 Live** shows what the radar reports right now: LD2450 Presence,
  Moving Target, Still Target, Target Count, and each target's distance and
  direction. LD2450 Presence covers the radar's whole view, not a room or a
  zone you drew. If the map shows no dot, check LD2450 Presence here: off
  with you in the room means the radar reports nobody (see
  [Troubleshooting](#troubleshooting)).
- **Occupancy History** (MTR-1, beside LD2450 Live) shows the last 24 hours
  of LD2450 Presence and each zone you drew. On an R PRO-1 the same lines
  join the LD2412's in one history in the tab's last column, above Still
  Thresholds.
- **LD2450 Controls** holds Zone Type, Multi Target Tracking, Radar Timeout,
  **Radar Bluetooth (HLK app)**, Restart Radar and Factory Reset Radar,
  whichever your sensor has (the MTR-1 has no Restart Radar). **Restart
  Radar** and **Factory Reset Radar** ask first, as they do on the LD2410 and
  LD2412 **Controls** cards. On the R PRO-1, Home Assistant hides Multi
  Target Tracking by default. The radar tracks several people unless that
  setting was turned off, so most people never need it. The note under the
  card says **Radar Timeout** is how long LD2450 Presence stays on after the
  radar last sees someone. It does not hold the zones you draw: a zone turns
  off as soon as nobody is in it, unless you give it a **Hold** time under
  Zones on the zone map (see
  [Ignore zones and hold time](#ignore-zones-and-hold-time)). The LD2450's
  firmware version is on the [Device card](#device-card).
- **Radar's built-in zones** shows the radar chip's own zone corners and
  counts. These are not the zones you draw on the map. The card shows only
  while Zone Type is not Disabled, and goes away when you set it to Disabled.
- The [Device card](#device-card) ends the tab.

### Radar setup

The **Radar setup** card sits right above the zone map. It checks the two
LD2450 settings that decide whether the zone map can show people, and fixes
them when you press its button. It changes nothing on its own. Apollo
firmware never sets these two, so they are whatever the radar chip holds. On
an R PRO-1 a second Radar setup card, near the top of the tab, checks the
LD2412; see [Gate radar setup checks](#gate-radar-setup-checks). On an MTR-1
this card also shows the notice for a page that runs other cards than Home
Assistant does (see [After an update](#after-an-update)).

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

### What the map shows

The zone map draws what the radar sees right now over the zones you drew:

- **Zones light up.** A zone is filled and outlined solid while its presence
  sensor is on, and pale with a dashed outline while it is off. Each zone
  keeps its own color either way. A zone whose presence sensor does not
  exist yet, or reads `unknown`, is drawn as off.
- **Targets are numbered dots.** Each person the radar tracks is a dot with
  a number: the target number (1, 2 or 3) on Apollo radars, or the place in
  the list on a DIY radar with its own `entities` pairs. The numbers are
  readable in light and dark themes.
- **Trails.** Each dot leaves a fading trail of about its last 3 seconds. The
  radar reports each position about once a second, so a trail is a few
  straight steps. A gap of more than 2.5 seconds, or the target vanishing,
  starts a new trail. Trails live in the open page only, so a reload starts
  them over.
- **Held zones.** A zone that stays on because of its hold time adds
  "(held)" to its label, so a lit zone with nobody on the map explains
  itself (see [Ignore zones and hold time](#ignore-zones-and-hold-time)).
- **Ignore zones** are hatched, with a dashed outline, and add "(ignored)"
  to their label. A target inside one is a hollow gray ring with a gray
  number, and its trail is gray: no zone counts it.
- **Radar offline.** While every target sensor the map tracks is
  unavailable, the map shows "Radar offline" in its top-left corner and the
  zones turn gray, because their presence sensors read `unavailable`.
- **Coverage.** Press **Coverage** under the map to paint every spot a
  target has been since the page opened, in 20 cm squares, deeper where
  targets were seen more often. It shows where the radar picks people up,
  ghosts inside ignore zones included, which helps you place zones.
  **Clear coverage** empties it. The paint lives in the open page only, and
  the browser remembers for each radar whether Coverage is on.
- **Flip.** An administrator can tick **Flip the map left to right (display
  only)** under **Map settings**. The hint under it reads "Turn this on if,
  with the map turned the way the room is, a dot moves the opposite way from
  you." To check, hold the phone so the map's view cone points the way the
  sensor faces in the room (at Cone rotation 0°, that is with the map's radar
  edge toward the sensor while you face it), stand about 2 m (6 ft) in front
  of the sensor and step to one side: the dot should move the same way on the
  screen. A radar that passes this at one rotation needs no flip at another.
  The flip is saved for the radar, so everyone who opens its map sees it
  flipped. Only the drawing changes: the zones as stored, their presence
  sensors, movement history and walked corners stay the same. The distance
  labels along the top keep their values, so they read from high to low, and
  the **Cone rotation** slider turns the cone the way you drag it. Other users
  see the box but cannot change it.

**History** under the map replays movement instead, when an administrator has
turned movement history on for the radar; see
[Movement history](#movement-history).

### Zoom and pan

The map zooms in up to 8x, so you can place a zone's corners to the
centimeter on any screen. At 8x a fitted 12 m map shows 1.5 m across. Zoom
and pan change only your own view: nothing is saved, and the zones, their
presence sensors and other viewers' maps stay as they are.

- **Buttons.** Over the map's lower right corner, above the **m / ft**
  switch, **Undo last zone change** and **Locked**, sit **−** (**Zoom out**),
  **+** and **Fit**. Each press of **−** or **+** zooms by a factor of about
  1.4 around the middle of the view, so two presses double it, and a readout
  such as "2x" shows while the map is zoomed in. The tooltip on **+** reads
  "Zoom in. You can also hold Ctrl or Cmd and scroll, or pinch."
- **Fit** shows every zone with some room around it (a tenth of the zones'
  longer side, at least 30 cm or about 1 ft), as large as the map can show
  them. Pressed again, or with no zones drawn, it shows the whole map. Its
  tooltip says which it does next, "Fit the zones in view" or "Show the whole
  map", and it is grayed out while the whole map shows with nothing to fit.
- **Mouse and trackpad.** Hold Ctrl (Cmd on a Mac) and scroll over the map
  to zoom around the pointer, one step per notch of a mouse wheel. A
  trackpad pinch does the same in Chrome, Edge and Firefox. A plain scroll
  still scrolls the page. Safari on a Mac does not pass a trackpad pinch to
  the card: use Cmd and scroll there, or the buttons.
- **Panning with a mouse.** Drag with Shift held, or with the middle mouse
  button, to move a zoomed map. The tooltip on the zoom readout says so:
  "Move the map by dragging with Shift held, with the middle mouse button,
  or with two fingers." A Shift-click places no corner, and a Shift
  double-click does not finish a polygon.
- **Phones and tablets.** Pinch with two fingers to zoom and drag with two
  fingers to pan. This works on every full map, also while it is locked,
  while you mark corners by walking and with no zone selected: put both
  fingers down before you move them, since a second finger cannot take over
  once one finger is scrolling the page. Over the map a pinch zooms the map,
  not the page. One finger draws or scrolls the page as before. A second
  finger that lands before the first has moved about 10 px starts a pinch
  and drops the rectangle or ellipse the first finger began, while a polygon
  keeps its corners. Once the first finger has moved farther, a second
  finger is ignored.
- **Grid lines** get finer as you zoom in: in meters 1 m, then 0.5 m, 0.2 m
  and 0.1 m apart, and in feet 2 ft, then 1 ft, 6 in and 3 in. When the
  radar's own axes are out of view, their distance labels run along the
  nearest edge of the map instead. Corners snap to about a tenth of the line
  spacing (see [Drawing zones](#drawing-zones)).
- **Walk** keeps you in view: on a zoomed map it pans after your dot as it
  nears an edge, and zooms out only if it must. **History** replays at the
  zoom you set.
- **When it resets.** The zoom stays through live updates, the **m / ft**
  switch and the map refitting to new zones. It goes back to the whole map
  when the page loads, when the card shows another radar, and when **Cone
  rotation** changes. A view-only map (see [Card options](#card-options))
  has no zoom.

## Drawing zones

The zone map card on R PRO-1 and MTR-1 tabs draws occupancy zones over the
LD2450's live targets. If the map shows no dot with someone in the room,
check the [Radar setup](#radar-setup) card first. Only administrators can
add, draw or change zones; other users see them, and the card answers a
change with "Could not save".

A new radar has no zones yet. The **Zones** panel under the map then says
"No zones yet. Press Add zone, then drag on the map to draw it.", and a
press on the map says "Press Add zone under the map first." If the sensor is
turned or mounted in a corner, set **Cone rotation** under **Map settings**
first (see [Map units and size](#map-units-and-size)). Then press **Add
zone**: it adds "Zone 1" and picks it. Drag on the map to draw it as a
rectangle, or first choose Ellipse or Polygon from the drawing-mode menu
(✎) on the map, or walk the zone's corners with 🚶 (see
[Mark corners by walking](#mark-corners-by-walking)). The zone's editor
under the chips says how to draw it in the mode you chose. Drawing a zone
that already has a shape replaces that shape. Naming, **Type**, **Hold**
and deleting are under [The Zones panel](#the-zones-panel).

- **Rectangle:** drag out a box. A click or a tap draws and saves nothing;
  on a zone it picks that zone instead. A perfectly straight drag saves
  nothing either.
- **Ellipse:** drag out its bounding box. A click or a tap saves nothing
  and picks the zone under it, as for a rectangle. A perfectly straight
  drag still saves an ellipse with a 1 mm radius one way, so use **Undo
  last zone change** (↶) if that happens.
- **Polygon:** click or tap each corner, then press **Finish polygon** (✓) or
  double-click or double-tap the last corner. A polygon needs at least 3
  distinct corners and finishes on its own at 32. With fewer, **Finish
  polygon** or a mouse double-click says "A polygon needs at least 3
  different points." and drops the corners, while a double-tap says the same
  and lets you add more. If no zone is selected by then, **Finish polygon**
  says "Select a zone first." Backspace or **Undo last point** removes the
  last corner and Escape discards the polygon; keys typed into a text field
  go to that field instead.
- Pressing anywhere else in the card, such as a zone's chip, **Add zone** or
  the rotation slider, cancels a shape in progress (the buttons on the grid
  itself do not). Moving the mouse off the grid cancels a rectangle or ellipse
  drag but keeps a polygon's corners.
- Only the left mouse button draws, and not with Shift held, which moves a
  zoomed map instead (see [Zoom and pan](#zoom-and-pan)). On a touch screen
  the finger that started a shape owns it: a second finger that lands before
  it has moved starts a pinch and drops a rectangle or ellipse, a second
  finger after that is ignored, and a touch the browser cancels saves
  nothing. A shape in progress is also dropped, unsaved, if the card is
  hidden or collapsed before you finish it.

**Corners snap** to round values in the map's unit, about a tenth of the
spacing of the grid lines shown, counted from the radar as the lines are:
every 10 cm at 1 m lines, 5 cm at 0.5 m, 2 cm at 0.2 m and 1 cm at 0.1 m; in
feet every 2 in at 2 ft lines and every inch at 1 ft or finer. So corners
snap finer as you zoom in. That covers a rectangle's corners, the corners of
an ellipse's box and a polygon's corners. Hold Alt (Option on a Mac) to place
a corner exactly where the pointer is; pressing or letting go of it in the
middle of a drag moves the corner at once. The corner you pressed first stays
where it was placed. Corners marked by walking never snap, and zones are
saved in whole millimeters.

While you draw, the shape's width and depth show right above the pointer, in
the map's unit, such as "2.4 m × 1.8 m" or "7 ft 11 in × 9 ft 10 in", and to
the centimeter, such as "2.45 m × 1.80 m", while corners snap finer than
10 cm. On a touch screen they sit higher, so your finger does not cover
them. Near the top edge of the map, where the radar is on most maps, a
mouse pointer's readout shows below it instead, and a finger's beside it, on
the side with more room. A polygon shows the size of the box around its
corners. The size is the one the save stores, as snapped. The zone's
editor under **Zones** reads sizes to 0.1 m.

The map starts locked once the radar has zones, so a scroll on a phone
cannot draw over a zone. The button in the corner of the map reads
**Locked** (🔒); press it to unlock, and press **Unlocked** (🔓) to lock again.
The card answers "Drawing and cone rotation locked. Unlock the map to change
them." or "Drawing and cone rotation unlocked. You can edit zones now." The
browser remembers your choice for each radar. While the map is locked:

- A swipe that starts on the map scrolls the page, and two fingers still
  zoom and pan it. A tap on a zone picks it. A tap anywhere else outlines
  the **Locked** button and says "Unlock the map to draw zones."
- **Clear all shapes** under **Map settings** looks dimmed and clears
  nothing: the **Locked** button is outlined and the card says "Unlock the
  map to clear zones."
- **Add zone**, a zone's name, **Type** and **Hold**, **Delete zone** and
  **Undo last zone change** still work. Instead of how to draw, the zone's
  editor says "The map is locked, so drawing is off. Unlock it to draw this
  zone or change its shape." Its **Unlock** button unlocks the map, as
  **Locked** does.
- The **Cone rotation** slider under **Map settings** is gray, a scroll
  that starts on it scrolls the page, and a tap or drag on it outlines the
  **Locked** button and shows "Cone rotation is locked. Press Locked on the
  map to change it."

An unlocked map lets a swipe scroll the page too while no zone is selected,
or while you mark corners by walking, since nothing can be drawn then.

### The Zones panel

The **Zones** panel sits right under the map, below **Coverage** (and
**History**, while movement history is on), and is always open. It has
three parts:

- **Add zone** adds a zone with the lowest free number, such as "Zone 2",
  with no shape yet, and picks it. Its sensors are created at once. The map
  holds up to 32 zones; then **Add zone** is grayed out and the panel says
  "The map holds up to 32 zones. Delete one to add another."
- **The chips** name each zone, with a dot in its color on the map: hollow
  and dashed while the zone is not drawn yet, and gray and hatched for an
  ignore zone. Press a chip to pick its zone. You can also tap the zone on
  the map: on a locked map, and in Rectangle or Ellipse mode on an unlocked
  one, a tap picks the zone under it, the smallest one where zones overlap.
  While the map is unlocked, the picked zone is outlined thicker. When the
  card opens, the first zone is picked.
- **The editor** under the chips belongs to the picked zone, with its
  number as the heading:
  - **Name.** Type a name and press Enter, or leave the field, to save it.
    Escape puts the saved name back, and an empty field saves the default
    name, such as "Zone 2". The chip and the label on the map change as you
    save.
  - The zone's size, such as "Size 2.0 m × 0.9 m", or "Not drawn yet".
  - **Type** and **Hold** (see
    [Ignore zones and hold time](#ignore-zones-and-hold-time)), with a line
    under them that says what they do for this zone.
  - **Now** says what the zone's presence sensor reads: "Someone is in this
    zone", "On, held for someone who went still", "Nobody is in this zone",
    or "Radar offline". An ignore zone reads "Never turns on, since it
    ignores targets", a zone with no shape "Turns on once the zone is
    drawn", and a zone whose sensor is not there yet "No presence sensor
    yet".
  - How to draw the zone in the drawing mode chosen on the map, such as
    "Drag on the map to draw this zone as a rectangle. ✎ on the map offers
    an ellipse or a polygon. A tap on another zone picks it.", or the lock
    note with **Unlock** while the map is locked.
  - **Delete zone** asks first, for example "Delete Couch? Its sensors
    leave Home Assistant, so automations that use them stop working. This
    cannot be undone." **Delete** deletes the zone, and **Keep it** or
    Escape keeps it. Undo does not bring a deleted zone back.

A name, a **Type** or a **Hold** saves on its own. Beside the zone's
heading the card shows "Saving...", then "Saved", or "Not saved" in red
with a "Could not save" message; a name you typed then stays in the field,
so you can try again. A shape you draw says "Couch saved", with the zone's
name. Saving a name for a zone that only the card's YAML `zones:` list
names creates that zone, so the name sticks, and a name you are typing is
kept when the card receives an update from elsewhere.

**Map settings**, at the bottom of the card, opens the map's options:
**Cone rotation** (see [Map units and size](#map-units-and-size)), **Flip
the map left to right (display only)** (see
[What the map shows](#what-the-map-shows)), **Movement history** (see
[Movement history](#movement-history)), a line that says which target
sensors the map reads, **Clear all shapes** and the grid's units and range.
**Clear all shapes** shows while any zone has a shape, and asks first:
"Clear every zone's shape? The zones keep their names, types and hold
times, and ↶ on the map brings the shapes back." **Clear shapes** clears
them and says "All shapes cleared", and **Keep them** keeps them. No button
clears a single zone's shape: draw a new one over it, delete the zone, or
send `shape: none` with `apollo_mmwave.update_zone`.

Other users see the zones and the editor, with its fields grayed out under
"Only an administrator can change these.", and no **Add zone**, **Delete
zone** or **Clear all shapes**. With no zones the panel tells them "No
zones yet. An administrator can add them." They also see the flip box
grayed out, and get no 🚶 (in the menu or as a chip), no **History** and no
Movement history setting.

### Mark corners by walking

Instead of drawing a zone, you can carry your phone around the area and mark
its corners where you stand. You need to be an administrator, the map must be
unlocked (on a locked map 🚶 says "Unlock the map to draw zones."), and you
must be the only person the radar sees.

1. Pick the zone with its chip under **Zones**. Open the drawing-mode menu
   (✎) and press 🚶 (**Mark corners by walking**). On a phone or tablet you
   can press the **🚶 Mark corners by walking** chip beside **Coverage**
   under the map instead. A panel opens under the map, and the chip hides
   until you leave Walk.
2. Stand still in one corner of the area for about 3 seconds and press
   **Corner here**.
3. Walk along the edge to the next corner, stand still for about 3 seconds,
   and press **Corner here** again. Go around the zone in order. Two corners
   make a rectangle (use opposite corners), three or more a polygon, up to
   32.
4. Press **Finish**. The zone is saved like one you drew, and the map leaves
   Walk.

The hint above the buttons says what to do next. Each corner is where the
radar placed you over the last 1.5 seconds, and the radar updates your
position about once a second, so stand still for about 3 seconds before you
press. **Corner here** refuses a corner within 30 cm of the last one ("That
is too close to the last corner. Walk farther, then press Corner here.") and,
once you have three corners, one back at the first ("That is where you
started. Press Finish to save the zone."): **Finish** closes the shape for
you.
**Finish** refuses corners that make a zone too thin to use, a rectangle
under 30 cm on a side or a polygon under 0.09 m² ("Those corners make a zone
too thin to use. Mark corners on opposite sides of the area."), and with no
zone selected it says "Select a zone first." Your corners stay either way.

**Corner here** is grayed out unless exactly one target is on the map, not
counting targets inside ignore zones. With nobody in view the hint says
"Nobody is on the map. Walk into the radar's view.", and with more than one
target "More than one target is on the map. Only the person marking corners
should be in view. If you are alone, a fan or curtain may be moving: add an
ignore zone over it." After 32 corners it says "That is the most corners a
zone can have. Press Finish."

**Undo corner** removes the last corner. **Cancel** leaves Walk; with two or
more corners it first asks "Drop the corners you marked?" with **Drop them**
and **Keep marking**. Locking the map or choosing another drawing mode leaves
Walk and drops the corners without asking. While you walk, a swipe on the map
scrolls the page, two fingers zoom and pan it, and **History** stays
unavailable ("Finish or cancel the walk first."). On a zoomed map, Walk pans
after your dot when it nears an edge, so you stay in view.

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

Set **Cone rotation** under **Map settings** to match how the sensor is
mounted. The hint under the slider reads "Mount the sensor first, then set
this. Zones match the room only while the sensor stays mounted that way."
Nothing on the radar tells the map how it is mounted, so a sensor that is
turned or picked up after you drew zones moves the room under them.

The map fills the card's width, and on the Apollo mmWave dashboard its
column is twice as wide on a wide screen. It is never taller than the
browser window less about 200 px: where the window is too short for the map
at the card's width, the map gets narrower and sits in the middle of the
card, so a meter stays as long across as down. That limit never makes it
shorter than 240 px, so a phone on its side still gets a map. On a narrow
phone held upright, the card's width sets the map's height, which can be
less. To see more detail, zoom in (see [Zoom and pan](#zoom-and-pan)).

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

### Ignore zones and hold time

Each zone's editor in the **Zones** panel (see
[The Zones panel](#the-zones-panel)) has two settings, **Type** and
**Hold**. The line under them follows the zone's type. For a detect zone it
reads "Detect: its presence sensor turns on while someone is inside. Hold
keeps it on for a while after someone inside goes still and the radar loses
them.", and for an ignore zone "Ignore: targets inside, such as a fan or a
curtain, are dropped before the other zones are checked. Ignore zones never
hold." A change is saved for the radar as soon as you pick it, and "Saved"
shows beside the zone's heading. Only administrators can change them; anyone
else sees them grayed out under "Only an administrator can change these."

**Type** is **Detect** (the default) or **Ignore**:

- A detect zone's presence sensor is on while a tracked target is inside it.
- An ignore zone hides the targets inside it. Every target inside any of the
  radar's ignore zones is dropped before its detect zones are checked, so a
  fan, a moving curtain or a reflection there turns no zone on, keeps no zone
  held and ends no hold. Movement history does not record it either. On the
  map an ignore zone is hatched and its targets are hollow gray rings.
- An ignore zone's own presence sensor always reads `off`, with the attribute
  `zone_type: ignore`. It never holds and stays available while the radar is
  offline.
- This is a mask inside Home Assistant. It is not the LD2450 Zone Type
  setting that the R PRO-1 and MTR-1 have (the support file reports that
  one), and nothing is written to the radar. Keep that setting on
  **Disabled**; see [Radar setup](#radar-setup).

**Hold** keeps a detect zone on after someone inside it goes still and the
radar loses them. The radar often loses a person who sits or lies still, so
without a hold the zone turns off while they are still there. The card offers
**Off** (the default), **15 s**, **30 s**, **1 min**, **2 min**, **5 min**,
**10 min** and **30 min**. `apollo_mmwave.update_zone` takes any whole number
of seconds from 0 to 3600 as `hold_s`, and the card then lists that value
too. Ignore zones never hold, so their **Hold** is grayed out.

How a hold works:

- When the last person in the zone vanishes, the zone stays on and its label
  on the map adds "(held)". The presence sensor's `held` attribute reads
  `true` while the zone is on only because of its hold.
- The zone turns off once the hold time has passed since it emptied.
- It turns off at once instead when everyone who was inside is accounted
  for, by either of two rules:
  - **Walked out.** The radar lost them while they were walking near the
    zone's edge or the edge of the radar's view (taken as 6 m and 120
    degrees): within 0.3 m, plus as far ahead as their speed carries them
    from the radar's last report of them until it lost them and 0.75
    seconds more, up to 1.5 m. An edge behind or beside them counts only
    within 0.3 m. Someone seen in the zone for under about 1.2 seconds
    counts only within 0.3 m of an edge, unless the radar saw them walk at
    0.85 m/s or more. So someone who walks into a couch or bed zone and is
    lost as they sit down is held.
  - **Seen outside.** In the first 3 seconds, the radar tracks a target
    outside the zone within 0.6 m of where they were, plus 1.6 m for each
    second since its last report of them, counting at most 1.2 seconds
    before the zone emptied. A target the radar was already tracking
    elsewhere when the zone emptied counts only within 0.6 m.
- Walking out of a zone into the room turns it off within about 3 seconds,
  usually as soon as the radar reports you outside it. Walking out of the
  radar's view, or through a doorway at the zone's edge, turns it off at
  once after about two seconds of walking in the zone (see the limits
  below).
- Someone in the zone again ends the hold: the zone is then on because of
  them, and follows them when they leave.
- The radar going offline or reconnecting and a Home Assistant restart end
  every hold on that radar, and holds are not restored after a restart.
  Redrawing the zone, changing the radar's rotation or tracked targets, or
  changing one of its ignore zones also ends the zone's hold. A new hold time
  counts from when the zone emptied, and **Off** releases a held zone at
  once.

The hold works from positions only, so it has limits:

- The LD2450 reports each position about once a second, so it needs about
  two seconds of walking in the zone to see someone walk. Someone it loses
  as they walk out of its view, or through a doorway at the zone's edge,
  after a shorter walk, for example from a seat beside the door, can keep
  the zone held for the full hold time.
- Someone who walks slowly through a zone and out of the radar's view soon
  after they enter it, at 0.6 m/s for example, often keeps the zone held for
  the full hold time: in a simulation at the R PRO-1's reporting rate, a
  walk like that through 1 to 1.5 m of a zone released the hold at once in
  only about 43 to 48% of runs. That is the price of holding someone who
  sits down right after walking in.
- Before it loses someone sitting still, the radar can move their position
  about half a meter in its last report. That alone is not walking out, but
  if it lands outside the zone it counts as stepping out, so a seat within
  about half a meter of the zone's edge can still turn the zone off early.
- A person or thing the radar was already tracking elsewhere when the zone
  emptied, such as someone across the room, a still object or a ghost, ends
  a hold only within 0.6 m of where the person was. Someone it picks up in
  the first 3 seconds, such as a person walking into view, can end it
  within the growing distance above, up to about 7 m.
- Someone passing through the zone ends a hold.
- If one person goes still and is lost while someone else stays in the zone,
  they are forgotten: the zone turns off when the other person leaves.
- When the radar swaps the numbers of two people in the zone, both can look
  as if they moved for a second or two, and a vanish near an edge right then
  turns the zone off.
- A target seen for under 1.2 seconds counts as moving, so a ghost that
  appears and vanishes in the middle of the zone holds it for the full hold
  time. An ignore zone over its source, such as a fan, stops that.
- The exit rule assumes the LD2450's 6 m and 120 degree view. Where a wall or
  the radar's own zone filter ends the view earlier, away from the zone's
  edge, someone walking out there holds the zone for the full hold time.

### Zones in automations

Each zone has two entities on the radar's device: a sensor that holds its
shape, and a presence binary sensor (for example
`binary_sensor.office_radar_zone_1_presence`) that is on while a tracked target
is inside the zone, or while the zone is held (see
[Ignore zones and hold time](#ignore-zones-and-hold-time)).

- Presence reads `unavailable` while the radar is offline, that is, while
  every target sensor it tracks that has a state reads `unavailable`. That
  also happens after every Home Assistant restart until the radar connects,
  so presence then goes from `unavailable` to `off` or `on`. A trigger with
  `to: "off"` and no `from:` fires on that step, after every restart and
  whenever the radar reconnects. For lights-off and similar automations,
  keep it that way, usually with `for:`: an extra `off` is harmless, and it
  also fires when someone left while the radar was offline, which takes
  presence from `on` to `unavailable` and then to `off`. Add `from: "on"`
  (or `not_from: unavailable`) only where an `off` after a restart or a
  reconnect would be wrong, such as a notification or a counter; it then
  also skips someone who left while the radar was offline. An ignore zone
  always reads `off`. Up to 2.3.0, presence read `off` while the radar was
  offline.
- Presence tests where the radar puts each target, and the R PRO-1 writes a
  target's X and Y about once a second, Y usually about 0.45 seconds after
  X. Zone presence waits for both before it tests a zone, so a zone beside a
  walking path never reads the point between them, a new X with the old Y,
  where nobody stood. A zone can therefore turn on or off up to about half a
  second after the first of the two writes, never sooner. A move along one
  axis only, which brings no second write, counts 0.55 seconds after it is
  written. The exception is a zone with a hold time when the radar loses
  someone between the two writes: it reads their last X write with the old
  Y once, as where they were lost, so it can turn on there and stay on for
  its hold time.
- A zone with a hold time adds the attribute `held` to its presence sensor:
  `true` while the zone is on only because of its hold. An ignore zone's
  presence sensor has the attribute `zone_type: ignore`. The shape sensor
  adds `zone_type` and `hold_s` to its attributes when they are not the
  defaults.
- Naming a zone (in its editor under **Zones**, or with `update_zone`'s
  `name`, also in the call that creates the zone) renames its entities to
  "Zone 1 - Couch" and "Zone 1 presence - Couch". The radar's name is then no
  longer part of their friendly names, so with several radars give zones
  distinct names, or rename an entity yourself in its settings (a name you set
  there is kept by later zone renames). Clearing the name sets them back to
  "Zone 1" and "Zone 1 presence", still without the radar name. The zone's
  editor saves a cleared name as the default "Zone 1", which does the same for
  entities that were named and leaves entities that never were as they are.
  The card's own zone labels are not affected.
- **Add zone** takes the lowest free zone number, up to 32, so after you
  delete a zone its number can come back. A zone number used before starts
  with fresh entity names: names Apollo mmWave gave the old zone, such as
  "Zone 1 presence - Couch", are cleared, and names you typed in the entity
  settings stay. An `update_zone` call that creates a zone with no name, or
  with its default name, does the same. Home Assistant brings the entity id
  back with the number, for example `binary_sensor.couch_presence` if you had
  renamed it, and no public Home Assistant API prevents that, so automations
  written for the deleted zone follow the new one. Check them after you add a
  zone.
- `apollo_mmwave.update_zone` changes zones from automations and scripts;
  Settings → Tools → Actions lists its fields (also in the table below). It
  takes the radar's `device_id` and a `zone_id` of 1 or more, with geometry in
  millimeters. To clear a zone send `shape: none`, and to remove it and its
  entities send `delete: true`. A call that changes nothing, such as a
  `zone_id` alone or `data` without a `shape`, is refused with a warning in
  the log. The `display_units` field sets the map unit for everyone: `m`,
  `ft`, or `auto` to follow Home Assistant's unit system again (`auto` with
  no unit saved changes nothing and is refused like any other empty call). An
  accepted call fires `apollo_mmwave_zone_updated` with the radar's
  `device_id`. Only administrators can call the action. Automations still
  can, and a call made by another user, from a script they run for example,
  is refused.

  [![Open your Home Assistant instance and show your action tools with a specific action selected.](https://my.home-assistant.io/badges/tools_perform_action.svg)](https://my.home-assistant.io/redirect/tools_perform_action/?service=apollo_mmwave.update_zone)

| Field | What it does |
|---|---|
| `device_id` | The radar. Required unless the deprecated `location` is given. |
| `location` | Deprecated: the radar's display name from before 2.0. Use `device_id` instead. |
| `zone_id` | The zone, 1 or more. Every field from `shape` to `hold_s` needs it. |
| `shape` | `rect`, `ellipse` or `polygon` together with `data`, or `none` to clear the zone's shape. |
| `data` | The geometry in millimeters, read only together with `shape`: `{x_min, x_max, y_min, y_max}` for a rect, `{cx, cy, rx, ry}` for an ellipse, `{points: [{x, y}, ...]}` for a polygon. |
| `name` | The zone's name. Naming a zone renames its entities (see above); an empty name clears it. |
| `delete` | `true` removes the zone and its two entities. |
| `zone_type` | `detect` (the default) or `ignore`; see [Ignore zones and hold time](#ignore-zones-and-hold-time). |
| `hold_s` | The hold time in whole seconds, 0 to 3600; 0, the default, turns the hold off. Detect zones only. |
| `rotation_deg` | The radar's rotation, -180 to 180. Positive swings its facing direction toward its right. Device-wide. |
| `display_units` | The map unit for everyone: `m`, `ft`, or `auto` to follow Home Assistant's unit system. Device-wide. |
| `mirror_x` | `true` draws this radar's map flipped left to right for everyone, `false` stops it. Display only. Device-wide. |
| `movement_history` | `true` keeps up to 24 hours of this radar's target positions (see [Movement history](#movement-history)); `false` turns that off and deletes them. Device-wide. |
| `input_units` | The unit of target sensors that have no length unit of their own, such as DIY template sensors. Device-wide. |
| `entities` | DIY radars: the X/Y target sensor pairs to track. An empty list changes nothing. Device-wide. |
| `clear_entities` | `true` empties the tracked pair list, so the radar tracks nothing. Device-wide. |

A default value counts as a change only when something else is stored:
`zone_type: detect` changes only an ignore zone, `hold_s: 0` only a zone with
a hold, and `mirror_x: false` or `movement_history: false` only a radar that
has them on. Otherwise the call is refused like any other empty call.
`zone_type` and `hold_s` need a `zone_id`; without one they are ignored with a
warning. Sent with a `shape` they apply to the new zone, and sent without one
they need a zone that exists. Redrawing or clearing a zone keeps its type and
hold time. To give zone 2 a two-minute hold:

```yaml
action: apollo_mmwave.update_zone
data:
  device_id: your_device_id
  zone_id: 2
  hold_s: 120
```

## Movement history

Movement history keeps where the radar saw people, so you can replay it on
the zone map: to find where a ghost comes from, see how people move through a
room, or learn why a zone turned on. It is off for every radar until an
administrator turns it on, one radar at a time.

**Turn it on.** On the zone map, open **Map settings** and tick **Movement
history**. Its hint reads "Keeps up to 24 hours of target positions so
administrators can replay them here. Backups include them. Turning it off
deletes them from Home Assistant." The card answers "Movement history is on.
Open History under the map to replay it." From then on Home Assistant records
that radar's targets whether or not any dashboard is open. Automations can
turn it on and off with `update_zone`'s `movement_history`.

**Replay it.** Press **History** under the map. The panel has **1 h**,
**6 h** and **24 h**, a small chart of how much was recorded over that time,
a slider to pick a moment, **Play** and **Pause** at **1x**, **10x** or
**60x**, and **Heatmap**, which shades where people spent the most time.
While the panel is open the map shows the replay instead of the live view:
"Replay" and the time in its top-right corner, numbered dots with short
trails where the targets were, and each zone lit while a replayed dot is in
it. As the panel's hint says, "Zones are drawn with their current shapes,
rotation and flip." History keeps positions, not which zone was on, so a zone
you redrew lights up where it is now. **Back to live** closes the panel. You
can still draw a zone while History is open, with the heatmap as a guide.

Home Assistant records a point when a target appears, when it moves 5 cm or
more (at most twice a second), and every 15 seconds while it stays in view,
plus a mark when it leaves. An R PRO-1 updates each target's X and Y about
once a second, often Y about half a second after X, and a move waits up to
about half a second for its other coordinate, so a walk is kept as about one
point a second, each where the radar placed the person. Positions are kept as
the radar reports them, so a rotation or flip you change later applies to the
replay too. Targets inside ignore zones are not recorded.

Privacy and storage:

- **Who can see it.** Only administrators can turn it on, open **History** or
  clear it, and only they see the **History** button and the setting. That
  includes any dashboard signed in as an administrator, such as a wall
  tablet. Other users see nothing of it.
- **Where it is kept.** In `.storage/apollo_mmwave.movement` in Home
  Assistant's configuration folder. Home Assistant makes the file private to
  its own user and never serves it at `/local/` or any other address, but
  anything that can open the configuration folder can read it, such as the
  Samba share and Terminal & SSH apps, and backups include it.
- **How long.** Up to 24 hours, and less in a busy room: each radar keeps
  about 100,000 records (up to 105,000 before the oldest are dropped back to
  100,000), as little as about 4.6 hours with three people moving all the
  time. Records older than 24 hours are removed also while nobody is in
  view. Home Assistant writes the file a minute after a change, so a crash
  can lose up to the last minute.
- **Backups.** Home Assistant backups include the file, also backups that
  leave out the database. Turning history off does not remove it from
  backups made before.
- **Not the recorder.** It is separate from Home Assistant's recorder and
  history. A recorder `exclude` or `recorder.purge_entities`, as in the
  wiki's
  [Minimize activity spam](https://wiki.apolloautomation.com/products/general/tutorials/minimize-mmwave-activity-spam/)
  guide, neither stops it nor deletes it.
- **SD cards.** Each save rewrites the whole file, so a busy radar at the cap
  rewrites about 1.3 MB a minute.
- **Support file.** The [support file](#support-file) says whether history
  is on for each radar and how many points it holds, never the points.

To delete it:

- **Clear history** in the History panel asks "Delete this radar's movement
  history?" and deletes it. Recording goes on.
- Turning **Movement history** off asks "Turning this off deletes this
  radar's movement history from Home Assistant. Backups made while it was on
  keep their copy." **Turn off and delete** turns it off and deletes that
  radar's history; **Keep it** leaves it on. When no radar has history left,
  the file is removed.
- Removing a radar from Home Assistant deletes its history. If the same
  radar comes back with its old device id, recording starts again.
- Deleting Apollo mmWave deletes the file (see
  [Removing Apollo mmWave](#removing-apollo-mmwave)).
- While the integration is disabled nothing runs, so the file keeps what it
  had until the next start drops anything older than 24 hours.

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
  catch: give yours a URL other than `apollo-mmwave`. When you delete the
  integration's own dashboard, the integration forgets it, so a dashboard you
  make on that URL later is yours. It cannot forget a dashboard you deleted
  while it was not running, for example while it was disabled. Then a
  dashboard you make on `apollo-mmwave` is taken for its own if its
  configuration is exactly the strategy above, and if it holds Apollo mmWave
  cards, it is offered the restore of
  [A saved copy misses new cards](#a-saved-copy-misses-new-cards). Either
  way nothing changes until you press **Submit**. While a dashboard of yours
  holds `apollo-mmwave`, the integration cannot add its own there and says
  so. A YAML dashboard on `apollo-mmwave` is left alone, and so is a
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

  Editing a strategy view in the Home Assistant UI throws away its cards. Use
  **Take control** on the dashboard instead.

- **Cards**: `custom:apollo-radar-calibrate-card`,
  `custom:apollo-radar-distance-card`,
  `custom:apollo-radar-gate-energy-card`,
  `custom:apollo-radar-setup-card`, and
  `custom:apollo-radar-zone-map-card` can be placed individually (they're in
  the card picker). See [Card options](#card-options). The rows
  `custom:apollo-radar-slider-row` and `custom:apollo-radar-slider-lock-row`
  lock sliders inside your own entities cards (YAML only, see
  [Card options](#card-options)).

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
Lock toggle is remembered per radar in the browser (see
[Drawing zones](#drawing-zones)). Set `start_locked: true` or `false` (also
in the card editor) to force the starting state instead.
Without a `grid`, the zone map fits the radar's view (see
[Map units and size](#map-units-and-size)). A `grid` (`x_min`, `x_max`,
`y_min`, `y_max`, in `grid_units`) fixes the map instead and draws it on a
square canvas, so a `grid` whose X span differs from its Y span is drawn
stretched; give both the same span for a true-to-scale map.
`cone.angle_deg` only sets where a double-click on the rotation slider resets
to: the cone, the live targets and the presence sensors all use the radar's
stored rotation, which is 0 until you set it with the slider (or with
`update_zone`'s `rotation_deg`).
In a sections view of your own, a section is one column wide by default, so
the map is at most about 500 px wide there. For the dashboard's wider map,
give the zone map card's section `column_span: 2` in the view's YAML and the
card `grid_options: {columns: full}`, or put the card on a Panel view.

**View-only zone map.** Set `view_only: true` on a zone map card, or tick
**View only (the map without drawing tools)** in its card editor, for a map
with nothing to press: the title and the map with its lit zones, numbered
dots, trails, the "Radar offline" note and the flip. It has no drawing tools,
lock, undo, unit switch, zoom, Zones panel, Coverage, History, Walk or Map
settings, and a finger on it scrolls the page, which suits a phone dashboard.
The card editor hides the lock setting while View only is ticked, since a
view-only map has no lock. The Apollo mmWave dashboard keeps the full map.

```yaml
type: custom:apollo-radar-zone-map-card
device_id: your_device_id
title: Living room   # optional
view_only: true
```

**Locked slider rows.** Two entities card rows put sliders behind the same
lock the dashboard uses (see [Locked sliders](#locked-sliders)). Both take
`device_id`: the radar's device id, or any text, as long as a lock row and
its slider rows share it. Put the lock row above the sliders it locks:

```yaml
type: entities
title: Move Thresholds
entities:
  - type: custom:apollo-radar-slider-lock-row
    device_id: <device id>
  - type: custom:apollo-radar-slider-row
    entity: number.apollo_msr_2_abc123_g0_move_threshold
    name: G0 (at the sensor)
    device_id: <device id>
```

A slider row is Home Assistant's own number row behind the lock and takes the
same `name` and `icon`. A number Home Assistant shows as a box is never
locked. Neither row is in the card picker.

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
  - its zones as stored, with each zone's type and hold time, the radar's
    rotation, units, flip and movement history setting, and this
    integration's zone entities;
  - whether movement history is on and how many points it holds, never the
    points themselves;
  - the running calibration, the saved snapshots and the last calibration
    result.

Each entity is listed with its state, unit, device class and whether it is
disabled.

Left out: the radar's MAC address, IP address, Bluetooth MAC and Wi-Fi
network name are never read, and any value stored under a name such as
`mac`, `ip`, `ssid`, `host`, `password`, `token` or `user_id` is replaced
with `**REDACTED**`. Text you typed yourself, such as a device or zone name,
is kept as it is. Device names and entity ids stay, because support needs
them to tell radars apart.
Apollo's default device names, and so the entity ids, end in the last six
characters of the device's MAC address (for example `apollo_msr_2_7a711c`).

Downloading the file changes nothing: no setting, zone, movement history,
dashboard or resource is written.

## Removing Apollo mmWave

Deleting Apollo mmWave in Settings → Devices & services (the ⋮ menu on the
entry, then **Delete**) removes what it made: the Apollo mmWave dashboard it
created (unless you took control of it; dashboards you made yourself are never
touched), every zone and its two entities, the saved calibration values that
**Undo** uses, and the movement history file
(`.storage/apollo_mmwave.movement`) if any radar had history on, though
backups made before keep their copy. From 2.2.5 it also removes its two
Lovelace resources, so dashboards stop asking for files that are gone.
The thresholds a calibration wrote stay on the radars. Setting Apollo mmWave
up again starts from nothing.

Deleting the entry leaves the integration's files in place. On Home Assistant
2026.11 or later, if Apollo mmWave came from HACS or the Marketplace, Home
Assistant then asks **Also uninstall Apollo mmWave?**: **Uninstall** removes
the files too, and **Keep** leaves them. With HACS 2.0.5, open Apollo mmWave
in HACS and choose **Remove** from the menu (⋮). Restart Home Assistant after
removing the files.

With Lovelace resources managed in YAML, the integration cannot remove them:
delete the two `/apollo_mmwave/` rows from your `resources:` by hand. It logs
a warning that names them. If you removed a release older than 2.2.5, delete
the two rows yourself under Settings → Dashboards → ⋮ → **Resources**.

[![Open your Home Assistant instance and show your dashboard resources.](https://my.home-assistant.io/badges/lovelace_resources.svg)](https://my.home-assistant.io/redirect/lovelace_resources/)

## Troubleshooting

- **A card or the dashboard does not load.** Do a hard refresh
  (Ctrl/Cmd+Shift+R) in a browser, or close the Home Assistant app fully and
  open it again. If the app still shows the old cards, reset its cache:
  **Settings → Companion app → Troubleshooting → Reset frontend cache** on
  Android, **Settings → Companion app → Debugging → Clear web view cache** on
  an iPhone or iPad. With Lovelace resources managed in YAML, add the two
  module resources from the log warning (see
  [Lovelace resources](#lovelace-resources)). A resource row you deleted comes
  back at the next Home Assistant restart, not on an integration reload.
- **A card says this page still runs an older Apollo mmWave.** The page
  loaded its cards before the update. Press **Reload**. In the Home
  Assistant app, if that does not help, close the app fully and open it
  again, then reset its cache as in the item above. **A card says to restart
  Home Assistant to finish updating.** The new files are installed, but Home
  Assistant still runs the old version: restart it. See
  [After an update](#after-an-update).
- **The dashboard misses newer cards**, such as Radar setup, **LD2450
  Controls** or the Device card, while their sensors exist. The dashboard is
  a saved copy from an older release: someone used **Take control** on it.
  Open Settings → System → Repairs and press "The Apollo mmWave dashboard is
  a saved copy", or choose **Restore the automatic dashboard** in the
  integration's options, then press **Submit** (see
  [A saved copy misses new cards](#a-saved-copy-misses-new-cards)). If
  neither shows up, the integration no longer knows that dashboard as its
  own, for example because it was taken control of under 2.2.5 or earlier.
  Then either add a second dashboard with the Community dashboards picker
  (see [Use your own dashboards instead](#use-your-own-dashboards-instead)),
  or delete the old one in Settings → Dashboards, after copying anything you
  want to keep from its raw configuration editor, and add it again from the
  integration's options with **Add the Apollo mmWave dashboard**.
- **Where are a zone's name, Type and Hold?** In the **Zones** panel right
  under the map: press the zone's chip, or tap the zone on the map, and its
  editor opens under the chips. **Cone rotation**, the flip, movement
  history and **Clear all shapes** are under **Map settings** at the bottom
  of the card (see [The Zones panel](#the-zones-panel)).
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
  Radar setup card near the top of the tab. If neither offers it, open the
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
  zones. If Zone Type is already Disabled and **LD2450 Presence** on the
  **LD2450 Live** card stays off with you in front of the radar, the radar
  itself sees nobody: check that it is online and facing the room.
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
- **Zone presence reads unavailable.** The radar is offline: every target
  sensor the zone tracks reads `unavailable`, and the map says "Radar
  offline". Presence also reads `unavailable` after every Home Assistant
  restart until the radar connects. Check the radar's power and Wi-Fi;
  presence comes back on its own. Meanwhile the Zone presence card hides its
  rows. An automation triggered by `to: "off"` without `from:` fires when the
  radar comes back, which suits turning lights off. A notification or a
  counter that must see someone leave can add `from: "on"`, which then also
  skips someone who left while the radar was offline (see
  [Zones in automations](#zones-in-automations)).
- **A dot moves the opposite way from you.** Hold the phone with the radar's
  edge of the map ahead of you, so the map is turned the way the room is,
  face the radar and step to your right: the dot should move right. If it
  moves left, an administrator can tick **Flip the map left to right
  (display only)** under **Map settings** (see
  [What the map shows](#what-the-map-shows)). It changes only the drawing,
  not the zones or their presence sensors.
- **Zones are hard to place precisely.** Zoom in with **+**, with Ctrl or
  Cmd and the scroll wheel, or with two fingers on a phone, and press
  **Fit** to show your zones or the whole map again (see
  [Zoom and pan](#zoom-and-pan)). Corners snap to round values; hold Alt
  (Option on a Mac) to place one freely. On a phone you can also mark a
  zone's corners by walking them, which uses where the radar sees you
  instead of where your finger lands (see
  [Mark corners by walking](#mark-corners-by-walking)).
- **A zone stays on after everyone left.** If its label on the map ends in
  "(held)", and its presence sensor's `held` attribute is `true`, the zone's
  hold time keeps it on: it turns off once that time has passed since the
  zone emptied. A hold is for someone the radar lost while they sat still.
  Someone walking out into the room turns the zone off within about 3
  seconds, and someone walking out of the radar's view after about two
  seconds of walking in the zone turns it off at once, but a shorter walk
  out of view, from a seat beside a door for example, can keep it held (see
  the limits under
  [Ignore zones and hold time](#ignore-zones-and-hold-time)). Lower the
  zone's **Hold**, or set it to **Off**. A ghost that shows up briefly in
  the middle of the zone can start a hold too, so cover its source, such as
  a fan, with an ignore zone. Without "(held)", a target is still inside:
  look for its dot, and cover a fan or curtain that keeps one there with an
  ignore zone. **Radar Timeout** does not hold the zones you draw.
- **Corner here is grayed out.** It needs exactly one target on the map,
  not counting targets inside ignore zones. The hint above the buttons says
  which: "Nobody is on the map. Walk into the radar's view." or "More than
  one target is on the map. Only the person marking corners should be in
  view. If you are alone, a fan or curtain may be moving: add an ignore zone
  over it." Ask others to step out of the radar's view, or cover the fan or
  curtain with an ignore zone. After 32 corners, press **Finish** (see
  [Mark corners by walking](#mark-corners-by-walking)).
- **Movement history is empty.** History says "No movement recorded in this
  range yet." when nothing was recorded in the range you picked. Recording
  starts when an administrator turns **Movement history** on under
  **Map settings**, and keeps nothing from before that. Targets inside ignore
  zones are never recorded, and **Clear history**, turning it off and
  removing the radar delete what was there. Try **24 h**. If History says
  "Only an administrator can open movement history.", sign in as an
  administrator (see [Movement history](#movement-history)).
- **A tab says the radar is offline, but it works.** The help card's
  "Offline right now" note is written when the page loads, and a radar
  coming back does not rebuild the dashboard. Reload the page. It happens
  most after a Home Assistant restart, when the radars reconnect after the
  dashboard has opened.
- **A repair says `apollo_mmwave.movement` is corrupt.** Home Assistant
  could not read the movement history file and set it aside, so the history
  starts over. Apollo mmWave deletes the set-aside copy, because it holds
  where people were. Dismiss the repair: nothing needs restoring, and
  recording carries on.
- **Zones are missing after a restart.** If `.storage/apollo_mmwave.zones` was
  edited by hand or partly restored and has the wrong shape, the integration
  logs what it could not read and loads the rest (possibly nothing), and the
  next save writes the file without it. Restore that file from a backup, with
  Home Assistant stopped, if the zones mattered.
- **Going back to an older release.** If a future release changes the zone
  store format, an older release cannot read the newer file: setup fails and
  the file is left untouched. Restore the backup you took before upgrading.
  Going back from 2.4.0 to 2.3.0 needs no restore, but first turn **Movement
  history** off on every radar, which deletes `.storage/apollo_mmwave.movement`.
  2.3.0 neither reads nor deletes that file, and removing the integration
  under 2.3.0 leaves it on disk and in every later backup. 2.3.0 also drops
  each radar's flip and movement history setting the next time it saves the
  zone store. It keeps a zone's type and hold time only until it rewrites
  that zone (a redraw, Undo, a clear, **Clear All Zones** or `shape: none`),
  and until then ignores them: ignore zones act as detect zones and nothing
  holds. 2.3.0 ignores `view_only` too, so view-only cards show the full map
  with its drawing tools again, and on a phone a swipe that starts on the
  map does not scroll the page; remove or replace those cards before going
  back.
- **Still stuck?** Send Apollo a support file with your question: Settings →
  Devices & services → Apollo mmWave → ⋮ → **Download diagnostics**. It
  leaves out MAC and IP addresses and Wi-Fi names; see
  [Support file](#support-file).
