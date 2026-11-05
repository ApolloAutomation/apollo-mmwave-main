# Changelog

What changed in each release of Apollo mmWave, newest first. Setup and
everyday use are in [README.md](README.md) and
[docs/configuration.md](docs/configuration.md).

## What changed in 2.4.0

The zone map on R PRO-1 and MTR-1 tabs now shows what each zone is doing: a
zone lights up while someone is in it, each target is a numbered dot with a
short trail, and Coverage paints where people have been. Zones are added,
named and set in a **Zones** panel right under the map, instead of two
levels down under **Configure → Zones**. A zone can stay on for someone who
sits still, or ignore a fan or a curtain. The map is twice as wide on a wide
screen, fills the whole window with one press, and zooms in up to 8x, and
corners snap to round values, so you can place them to the centimeter. You
can mark a zone's corners by walking them,
read a zone's size while you draw it, put a view-only map on a phone
dashboard, and, as an administrator, replay up to 24 hours of movement. On a
phone, a locked map now scrolls the page. If someone used **Take control**
on the Apollo mmWave dashboard, so it misses the cards added since, a repair
offers to restore the automatic dashboard and keeps the copy. An Apollo
R PRO-1's or MTR-1's Target X and Y now show mm, the unit the radar reports,
instead of the inches Home Assistant picks on US customary units. Gate radar
tabs show the radar's own answer under the Gate Energy chart, and from the
next update on, every tab says when the page runs other cards than Home
Assistant. What changed since the last test build is under
[Changed since 2.4.0b3](#changed-since-240b3).
Nothing needs changing by hand unless your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)), or an
automation expects zone presence to read `off` while the radar is offline. It
now reads `unavailable`, also after every Home Assistant restart until the
radar connects, so a `to: "off"` trigger without `from:` fires when the radar
comes back (see the offline item below). Zone presence also waits for both
of a target's coordinates now, so a zone can turn on or off up to about half
a second later than in 2.3.0 (see the presence item below). Something that
reads an Apollo radar's Target X or Y in inches and that Apollo mmWave cannot
see, such as a YAML template sensor, a dashboard card or another tool, reads
mm after the update (see the Target X and Y item below).

- **Zones under the map.** A **Zones** panel right under the map holds
  **Add zone**, a chip for each zone with a dot in its color, and an editor
  for the picked zone. Press a chip, or tap the zone on the map, to pick it.
  The editor has the zone's **Name**, which saves when you press Enter or
  leave the field (there is no **Save** button), its size, **Type** and
  **Hold** with a line that says what they do, **Now** (whether someone is
  in it), how to draw it, and **Delete zone**, which asks first. A name,
  Type or Hold shows "Saving..." and then "Saved" beside the zone's
  heading. A radar with no zones says "No zones yet. Press Add zone, then
  drag on the map to draw it." **Add zone** stops at 32 zones. See
  [The Zones panel](docs/configuration.md#the-zones-panel).
- **Map settings.** **Configure** is now **Map settings**, at the bottom of
  the card, with **Cone rotation**, the flip, **Movement history** and
  **Clear all shapes**. **Clear all shapes** replaces **Clear All Zones**
  under the map, asks first and says "All shapes cleared". Double-clicking a
  zone's chip no longer clears its shape, and a click or a tap in Ellipse
  mode picks the zone under it instead of saving a 1 mm ellipse.
- **Lit zones, numbered dots and trails.** A zone is filled and outlined
  solid while its presence sensor is on, pale and dashed while it is off,
  and gray while the radar is offline, so you can watch a zone react as you
  walk through it. Each target is a dot with its number (Target 1, 2 or 3)
  and a fading trail of its last 3 seconds. A zone that stays on because of
  its hold time adds "(held)" to its label. A distance label that a zone's
  name or a button over the map would cover is left out. See
  [What the map shows](docs/configuration.md#what-the-map-shows).
- **Zoom and pan.** The zone map zooms in up to 8x with **+**, **−** and
  **Fit** over its lower right corner, with Ctrl or Cmd and the scroll
  wheel, or a trackpad pinch in Chrome, Edge and Firefox, and with two
  fingers on a phone, also on a locked map. Shift and drag, the middle mouse
  button or two fingers move a zoomed map. **Fit** shows your zones, and
  pressed again the whole map. Grid lines get finer as you zoom in, down to
  10 cm or 3 in. A plain scroll still scrolls the page, and a view-only map
  has no zoom. See
  [Zoom and pan](docs/configuration.md#zoom-and-pan).
- **Expand map.** The button in the map's top right corner (**Expand
  map**) fills the browser or app window with the map. Walk, Coverage,
  History, the **Zones** panel and **Map settings** sit beside it, or under
  it on a phone held upright, so you can draw, pick, rename and delete zones
  there. Your zoom, the picked zone and an unfinished polygon come along
  both ways, and the grid lines and the snap are finer on the larger map. To
  return, press × before the title, the same corner button, Esc, or Back on
  Android. Esc first puts back a zone name you were changing, drops an
  unfinished polygon's corners, or closes a **Delete zone** or **Clear all
  shapes** question; the next Esc closes the window. A view-only map, the
  card editor's preview and a map inside a pop-up have no expand button.
  See [Expand the map](docs/configuration.md#expand-the-map).
- **A sharper map.** The map is drawn at the screen's own resolution, so it
  is sharp on phones and other high-resolution screens. The zone map card
  draws Home Assistant's own card background, border and corner radius, so
  it lines up with the cards around it, and without the padding it had
  around it the map is up to 32 px wider.
- **Corners snap.** Corners you draw land on round values, about a tenth of
  the grid line spacing: every 10 cm at 1 m lines, every 2 in at 2 ft
  lines, and finer as you zoom in. Hold Alt (Option on a Mac) to place one
  freely. Corners marked by walking never snap. See
  [Drawing zones](docs/configuration.md#drawing-zones).
- **A wider map.** On R PRO-1 and MTR-1 tabs the zone map's column is twice
  as wide as the others on a wide screen, and the map is never taller than
  the window less about 200 px. On an MTR-1 tab, Start here and Radar setup
  sit side by side above the map. Phones are unchanged.
- **Zone size.** While you draw a rectangle, ellipse or polygon, its width
  and depth show above the pointer in the map's unit, such as
  "2.4 m × 1.8 m" or "7 ft 11 in × 9 ft 10 in", to the centimeter while
  corners snap finer than 10 cm, and higher up on a touch screen so your
  finger does not cover them. Near the radar, where there is no room above,
  a finger's readout sits beside it. Each zone's editor under the map shows
  its size too.
- **View-only map.** Add a zone map card with `view_only: true`, or tick
  **View only (the map without drawing tools)** in its card editor, to show
  the map with its lit zones, dots and trails and nothing to press. A finger
  on it scrolls the page, so it suits a phone dashboard. The Apollo mmWave
  dashboard keeps the full map. See
  [Card options](docs/configuration.md#card-options).
- **Mark corners by walking.** An administrator can press 🚶 (**Mark corners
  by walking**) in the drawing menu of an unlocked map, or the **🚶 Mark
  corners by walking** chip under the map on a phone or tablet, stand still
  for about 3 seconds in each corner of an area and press **Corner here**,
  then **Finish**. Two corners make a rectangle, three or more a polygon.
  Only the person walking may be on the map, and a zoomed map pans after
  them. See
  [Mark corners by walking](docs/configuration.md#mark-corners-by-walking).
- **Coverage paint.** **Coverage** under the map paints every spot a target
  has been since the page opened, so you can see where the radar picks people
  up, ghosts included. It stays in your browser, and **Clear coverage**
  empties it.
- **Hold time.** Each zone has a **Hold** setting in its editor: **Off**
  by default and up to 30 minutes in the card, or 0 to 3600 seconds with
  `apollo_mmwave.update_zone`'s new `hold_s`. It keeps the zone on after
  someone inside goes still and the radar loses them, and still turns the
  zone off when the radar sees them walk out: within about 3 seconds when
  they walk out into the room, or at once when they walk out of its view
  after about two seconds of walking in the zone. Someone seen in the zone
  for under about 1.2 seconds walks out only within 0.3 m of an edge,
  unless the radar saw them walk at 0.85 m/s or more, so someone who walks
  into a couch or bed zone and is lost as they sit down is held. A shorter
  or slower walk out of view, from a seat beside a door for example, can
  keep the zone held.
  Someone new the radar picks up within a few meters in the first 3 seconds
  can end a hold early; someone or something it was already tracking counts
  only within 0.6 m. A radar reconnect or a Home Assistant restart ends a
  hold. The presence sensor's `held` attribute says when a zone is held.
  See
  [Ignore zones and hold time](docs/configuration.md#ignore-zones-and-hold-time).
- **Ignore zones.** Set a zone's **Type** to **Ignore** to drop every target
  inside it, such as a fan or a moving curtain, before the radar's other
  zones are checked: it turns no zone on and ends no hold. An ignore zone is
  hatched on the map, its targets are hollow gray rings, and its own
  presence sensor always reads `off`. This is a mask inside Home Assistant,
  not the LD2450 Zone Type setting of the R PRO-1 and MTR-1, which should
  stay Disabled. Automations can set it with `update_zone`'s new
  `zone_type`.
- **Zone presence pairs X and Y.** A target's X and Y are two writes, and
  the R PRO-1 writes Y about 0.45 seconds after X. Zone presence now waits
  for both before it tests a zone, so a zone beside a walking path no
  longer turns on for a moment at a point between them, a new X with the
  old Y, where nobody stood. A zone can turn on or off up to about half a
  second later than in 2.3.0, never sooner, and a move along one axis only
  counts 0.55 seconds after it is written. The exception is a zone with a
  hold time when the radar loses someone between the two writes: it reads
  their last X write with the old Y once, as where they were lost, so it
  can turn on there and stay on for its hold time. See
  [Zones in automations](docs/configuration.md#zones-in-automations).
- **Offline presence reads unavailable.** While the radar is offline, its
  zone presence sensors read `unavailable` instead of `off` (ignore zones
  stay `off`), the zones turn gray and the map says "Radar offline". The same
  happens after every Home Assistant restart until the radar connects, and
  the Zone presence rows on the dashboard hide meanwhile. An automation
  triggered by `to: "off"` without `from:` now also fires when the radar
  comes back, which suits lights-off automations. Add `from: "on"` only
  where that `off` would be wrong, such as a notification or a counter: it
  then also skips someone who left while the radar was offline, whose zone
  goes from `on` to `unavailable` to `off`. See
  [Zones in automations](docs/configuration.md#zones-in-automations).
- **Target X and Y in mm.** The LD2450 reports where each target is in mm,
  and the radar's built-in zone corners and Apollo's zone guides use mm too,
  but Home Assistant on US customary units picks inches for the Target X and
  Y sensors on its own. Apollo mmWave now shows them in mm on Apollo R PRO-1
  and MTR-1 radars:
  - A radar you add while Home Assistant runs shows mm about 2 seconds
    after its sensors appear, with no message.
  - A radar you already have is switched once, after Home Assistant has
    started with 2.4.0. A notification, "Apollo mmWave: Target X and Y now
    in mm", lists the radars and sensors it switched and says "Nothing was
    written to the radar."
  - Only the unit Home Assistant picked on its own is switched. A unit you
    picked in a sensor's settings stays, and so does a sensor that an
    automation, a script or a helper uses, including a device trigger or a
    template in an automation. A metric install already shows mm. Each sensor is decided
    once, so Apollo mmWave never changes it again, and Target Distance,
    Speed and Resolution keep their units.
  - To go back, open the sensor's settings (⚙), choose **in** under **Unit
    of measurement** and select **Update**.
  - For a radar whose sensors were left alone, the **Radar setup** card
    above the zone map tells administrators which unit Home Assistant shows
    and offers **Show Target X and Y in mm**.

  Automations, templates and history graphs read these sensors in mm after
  the switch, and a history graph that spans it shows a step of 25.4 times.
  The zone map and zone presence work in either unit, as they have since
  2.2.7. The zone map's grid line under **Map settings** names the unit the
  target sensors show, and the support file says for each one whether its
  unit was picked and whether Apollo mmWave switched it or left it. See
  [Target X and Y units](docs/configuration.md#target-x-and-y-units).
- **Movement history.** Off until an administrator ticks **Movement
  history** for a radar under **Map settings**. Home Assistant then keeps up
  to 24 hours of that radar's target positions in
  `.storage/apollo_mmwave.movement`, and **History** under the map replays
  them, with the zones lighting up, a heatmap and a timeline. A move is
  recorded once both of its coordinates are in. Only administrators can
  turn it on, open it or clear it. Backups include the file. The support
  file never does: it only says whether history is on and how many points it
  holds. Turning it off deletes that radar's history from Home Assistant,
  while backups made before keep their copy. See
  [Movement history](docs/configuration.md#movement-history).
- **Flip left to right.** If, with the map turned the way the room is, a
  dot moves the opposite way from you, an administrator can tick **Flip the
  map left to right (display only)** under **Map settings**, and everyone
  sees that radar's map flipped. Zones, presence and history are not
  changed. `update_zone` takes it as `mirror_x`. A hint under **Cone
  rotation** says to mount the sensor before you set it.
- **Restore the automatic dashboard.** A dashboard someone took control of
  keeps the cards of the release it was saved under, so it misses the Radar
  setup card, **LD2450 Controls** (Zone Type and Multi Target Tracking), the
  Device card and this release's layout. While the dashboard Apollo mmWave
  created is such a saved copy, Settings → System → Repairs lists "The
  Apollo mmWave dashboard is a saved copy", and the integration's options
  offer **Restore the automatic dashboard**. Nothing changes until you press
  **Submit**. Then your copy is kept as a dashboard of its own, **Apollo
  mmWave (saved copy)**, out of the sidebar (open it from Settings →
  Dashboards), and only after that is `/apollo-mmwave` the automatic
  dashboard again. The repair covers only the dashboard the integration
  still knows as the one it created: not one taken control of under 2.2.5
  or earlier, nor one whose options were saved after it was taken control
  of, from 2.2.6 to 2.4.0b3, since those releases forgot it then. See
  [A saved copy misses new cards](docs/configuration.md#a-saved-copy-misses-new-cards)
  and its Troubleshooting item for those.
- **Phone and lock fixes.** A swipe that starts on a locked map, on a map in
  Walk, or on a map with no zone selected scrolls the page instead of being
  taken for drawing. The lock covers drawing, Walk, **Clear all shapes** and
  **Cone rotation**: while the map is locked, **Clear all shapes** clears
  nothing and says "Unlock the map to clear zones.", a tap on a zone picks
  it, and the zone's editor has an **Unlock** button. Names, Type, Hold,
  **Add zone** and **Delete zone** work while it is locked. The lock
  messages say "map" instead of "grid". Finishing a polygon with fewer than
  3 points now says "A polygon needs at least 3 different points." A radar
  going offline or coming back no longer rebuilds the dashboard, which
  dropped a zone being drawn on any tab; a tab's "Offline right now" note
  now stays until you reload the page.
- **Zone names.** Clearing a zone's name sets its entities back to "Zone 1"
  and "Zone 1 presence" instead of "Zone 1 - Zone 1". A name sent with
  `update_zone` in the call that creates a zone now renames its entities
  too, and a zone that reuses the number of a deleted one starts with fresh
  entity names (its entity id still comes back; see
  [Zones in automations](docs/configuration.md#zones-in-automations)).
- **LD2450 Presence.** The first row of LD2450 Live and the LD2450's line in
  the occupancy history read "LD2450 Presence" on every tab, so it is clear
  that it covers the radar's whole view, not a zone.
- **Counts as whole numbers.** LD2450 Live showed the radar's Target Count
  as "0.0", and the **Radar's built-in zones** card showed each zone's
  counts the same way. The Target Count now sits under LD2450 Live's rows as
  a whole number, and the built-in zones' counts are a table of whole
  numbers under their corners. Nothing is written to the sensors.
- **Combined Presence in Start here.** On R PRO-1 firmware newer than
  26.3.2.1, which adds **Combined Presence** (on while either radar sees
  someone), Start here recommends it for whole-room automations, as the
  Apollo wiki does. With older firmware the advice is unchanged. See
  [Start here](docs/configuration.md#start-here).
- **Gate radar tabs.** The Gate Energy chart's legend says "outlined bar =
  above threshold" instead of "(detecting)", gates outside the radar's range
  are faded, and while Radar Engineering Mode is on a line under the chart
  gives the radar's own answer, such as "The radar reports no target." On an
  LD2410 that reports no target while a bar is outlined, a second line says
  that it often needs someone who sits still to move before it detects them
  again. The Distances card reads "distance unknown" instead of drawing 0
  while the radar reports a target with no distance. On MSR-1 and MSR-2
  tabs, Start here and the LD2410 Zone Config note recommend **Radar
  Target** for automations instead of **Any zone**, since the zone sensors
  need that distance. The Auto-calibrate card says to raise Radar Timeout to
  60 s or more if Radar Target turns off while someone sits still. See
  [Gate radar cards](docs/configuration.md#gate-radar-cards).
- **Out-of-date pages.** After an update, the Radar setup card, or the zone
  map card when it comes first on the page, says when the page still runs
  the old cards, with a **Reload** button, or when Home Assistant needs a
  restart to finish updating. This works from the next update on, once the
  page runs these cards: cards from 2.4.0b2 and earlier, 2.3.0 among them,
  have no check, so on the update from them, reload the page even when no
  notice shows. See
  [After an update](docs/configuration.md#after-an-update).
- **README links.** Old links to the README's `#install-with-hacs`, such
  as the one in the 2.2.6 notes, land on the install heading again.
- **Going back to 2.3.0.** Before going back to 2.3.0, turn Movement history
  off on every radar. 2.3.0 neither reads nor deletes the movement history
  file, so it would stay on disk and in every later backup. 2.3.0 also
  forgets each radar's flip, treats ignore zones as detect zones and holds
  no zone. It ignores `view_only`, so view-only cards show the full map with
  its drawing tools again, and on a phone a swipe that starts on the map
  does not scroll the page: remove or replace those cards first. A saved
  copy that a restore kept stays a dashboard of its own. See "Going back to
  an older release" under
  [Troubleshooting](docs/configuration.md#troubleshooting).
- **Credits.** Ideas for several of these features, such as the hold time
  and movement replay, came from
  [bb12ett/esphome-radar-suite](https://github.com/bb12ett/esphome-radar-suite)
  and [baes-cloud/ha-rmm-replay](https://github.com/baes-cloud/ha-rmm-replay),
  both MIT licensed. They were reimplemented here, and no code was copied.

### Changed since 2.4.0b3

2.4.0b3 owners found the zone settings hard to reach, under **Configure →
Zones** below the map, and the map cramped. A dashboard taken control of
under an older release showed none of the cards added since, such as
**LD2450 Controls** with Multi Target Tracking, and moving Target X and Y
off inches meant opening six sensors' settings one at a time.

- **Zones panel.** New: **Zones** under the map, with **Add zone**, the
  zone chips and the picked zone's editor (name, size, Type, Hold, Now, how
  to draw it and **Delete zone**). **Configure → Zones** is gone. The name
  saves on Enter or when you leave the field, with no **Save** button, and
  Name, Type and Hold show "Saving...", "Saved" or "Not saved" beside the
  zone's heading instead of a "Couch saved" message. A tap on a zone on the
  map picks it.
- **Map settings.** **Configure** is renamed **Map settings**. **Clear All
  Zones** moved there as **Clear all shapes**, which asks first; its message
  is now "All shapes cleared". **Delete zone** asks first too. A
  double-click on a zone's chip no longer clears its shape, and a click or a
  tap in Ellipse mode no longer saves a 1 mm ellipse.
- **Restore the automatic dashboard.** New: the repair "The Apollo mmWave
  dashboard is a saved copy" and the options action **Restore the automatic
  dashboard**, which keep your copy as **Apollo mmWave (saved copy)** and
  put the automatic dashboard back. A saved copy also stays recorded when
  you save the options, so the restore stays on offer. Deleting the
  integration's dashboard while it runs makes it forget that dashboard, so
  one you make on `/apollo-mmwave` later is not taken for a saved copy.
- **Dashboard text.** The MTR-1 and R PRO-1 Start here steps, the Zone
  presence card's hint and the note under LD2450 Controls now point to
  **Add zone**, **Map settings** and **Hold** under Zones.
- **Expand map.** New: the expand button in the map's top right corner
  fills the window with the map and its Zones panel. × before the title, the
  same button, Esc or Back returns to the card with your zoom and picked
  zone.
- **Sharper map and card edge.** New: the map is drawn at the screen's own
  resolution, and the card draws Home Assistant's card background, border
  and corner radius instead of its own padding, so the map is up to 32 px
  wider.
- **Target X and Y in mm.** New: Apollo R PRO-1 and MTR-1 radars show
  Target X and Y in mm, a new radar at once and an existing one once after
  the start, with one notification and the safeguards described above. The
  Radar setup card offers **Show Target X and Y in mm** to administrators
  for sensors left alone. The zone map's grid line names the units the
  target sensors show, and the support file says whether each one's unit
  was picked and who picked it.
- **Counts as whole numbers.** LD2450 Live's Target Count and the built-in
  zones' counts read whole numbers instead of "0.0".
- **Combined Presence in Start here.** On R PRO-1 firmware newer than
  26.3.2.1, Start here recommends Combined Presence for the whole room.
- **README links.** Old `#install-with-hacs` links land on the install
  heading again.
- **Card size.** The zone map card now gives Home Assistant a card size of
  14 instead of 8, so a masonry view of your own may place the cards around
  it differently.
- **Out-of-date pages.** 2.4.0b3's cards have the check, so after updating
  from 2.4.0b3 a page that still runs it says so, with a **Reload** button.

## What changed in 2.3.0

R PRO-1 and MTR-1 tabs now have everything for the zone map in one place: a
Radar setup card that finds the settings that hide people from the map and
fixes them with one tap, and the radar's live status and controls next to the
map, so there is no need to open the device page. The zone map is in feet or
meters to match Home Assistant and fills the card with what the radar can
see. Every tab is also easier to read: setup checks on MSR-1, MSR-2 and
R PRO-1 tabs too, plainer labels and help, a fuller occupancy history, a
Device card at the bottom, and a support file to send Apollo. On a phone, a
scroll can no longer move a threshold, Detection Range or Cone rotation
slider by accident.
Nothing needs changing by hand unless your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)), or you added
a zone map card from the card picker before 2.3.0 (see the last item).

- **New Radar setup card.** It sits above the zone map on R PRO-1 and MTR-1
  tabs and checks two radar settings. Apollo firmware never sets them, so
  they are whatever the radar chip holds:
  - **Zone Type** should be **Disabled**, because the zone map replaces the
    radar chip's own built-in zones. On Detection the radar reports only
    people inside those built-in zones, and with none set it reports nobody,
    so the map stays empty. On Filter it hides people inside them. **Set Zone
    Type to Disabled** fixes it.
  - **Multi Target Tracking** off means only one person is tracked. **Turn on
    Multi Target Tracking** fixes it.

  When both need fixing, **Use recommended settings** does both. The card
  changes nothing until you press a button. It is also in the card picker as
  **Apollo Radar Setup**; see
  [Radar setup](docs/configuration.md#radar-setup).
- **Setup checks on MSR-1, MSR-2 and R PRO-1 tabs.** A second kind of Radar
  setup card now sits right under **Start here** on every tab with an LD2410
  or LD2412. It flags:
  - **Radar Engineering Mode left on**, which saves every gate's energy to
    the database about once a second. **Turn off Radar Engineering Mode**
    fixes it. The card says nothing about it while a calibration runs, since
    the calibration needs the mode on.
  - **Settings the radar has not reported yet**, so their rows are blank.
    **Read settings from the radar** only asks the radar to send them.
  - **LD2410 zones that can never turn on**, because their distances are out
    of order or past what the radar can see, and an **LD2412 Min Gate** at or
    above Max Gate. The card explains these and leaves the fix to you.

  It changes nothing until you press a button; see
  [Gate radar setup checks](docs/configuration.md#gate-radar-setup-checks).
- **The radar's status and controls next to the map.** R PRO-1 and MTR-1
  tabs gain **Zone presence** (each zone's presence sensor, lit while someone
  is in it; a zone you just drew shows after a page reload), **LD2450 Live**
  (whether the radar sees anyone, how many, and each target's distance and
  direction) and **LD2450 Controls** (Zone Type, Multi Target Tracking, Radar
  Timeout, Radar Bluetooth (HLK app), Restart Radar and Factory Reset Radar).
  A note under it says Radar Timeout holds LD2450 Presence only: a zone you
  drew turns off as soon as nobody is in it. A **Radar's built-in zones** card
  shows the chip's own zones only while Zone Type is not Disabled.
- **Resets and restarts ask first.** On every tab, **Factory Reset Radar**,
  **Restart Radar** and the whole-device restart now ask before they act
  instead of going off on one tap of **Press**.
- **Sliders lock so a scroll cannot move them.** On MSR-1, MSR-2 and R PRO-1
  tabs, the sliders on Detection Range (Max Move Gate and Max Still Gate, or
  Max Gate and Min Gate on the R PRO-1), Move Thresholds and Still
  Thresholds start locked every time the dashboard opens. A locked slider is
  gray and still shows its value, and a scroll that starts on it scrolls the
  page. Press **Unlock** above them to change them; that unlocks the
  sensor's sliders on all three cards. They lock again after 5 minutes
  without a change or when you leave the tab, but never while you drag one.
  Touch a locked slider and **Unlock** flashes; try again within 10 seconds
  and Home Assistant shows a reminder with an **Unlock** button. Number boxes
  such as Radar Timeout are never locked, tapping a row's name still opens
  its details, and Auto-calibrate works either way. See
  [Locked sliders](docs/configuration.md#locked-sliders).
- **The zone map's Locked button also locks Cone rotation.** While the map
  is locked, the **Cone rotation** slider under Configure is gray, a scroll
  that starts on it scrolls the page, and a tap or drag on it outlines
  **Locked** and shows a reminder of how to unlock. A radar with no zones yet
  starts unlocked, as before, so a new sensor can still be turned to match
  how it is mounted. See [Drawing zones](docs/configuration.md#drawing-zones).
- **ESP Reboot moved to the Device card.** It restarts the whole device, both
  radars on an R PRO-1, so it left the radar's Controls card. It is now
  **Restart device** on the MSR-1 and MSR-2, **Restart device (both radars)**
  on the R PRO-1 and **Restart device (also restarts the radar)** on the
  MTR-1 and on an R PRO-1 without the optional LD2412.
- **New Device card** at the bottom of every tab: the Apollo firmware
  version, the radar chip's firmware version (the R PRO-1 hides both of its
  chips' versions until you enable them), the firmware update (tap it for
  Home Assistant's own update window), the restart, a link to the device's
  own page, and how to download a support file. A weak Wi-Fi note shows
  while the signal is below -75 dBm.
- **Clearer labels and help on every tab.** Every tab, a live MTR-1
  included, starts with **Start here** steps and a link to the device's own
  page. The R PRO-1 help covers both radars and says which presence sensor to
  use in automations. The help no longer tells you to change Gate Size, which
  is hidden on every model. Threshold rows say how far out their gate reaches,
  such as "G4 (about 3 m)", in feet on a US customary system, and the
  Detection Range tip gives each gate's depth the same way. **Bluetooth** is
  now **Radar Bluetooth (HLK app)**. The LD2410 Zone Config card says its
  boxes are in cm and how the three zones sit back to back, and each Radar
  Timeout says what it holds.
- **Clearer occupancy.** MSR-1 and MSR-2 tabs add **Any zone** (on while
  someone is in any of the three zones) to Target / Occupancy and the
  history. Target / Occupancy rows light up while on. The history adds
  **Moving** and **Still** lines and covers 24 hours instead of 1. The R PRO-1
  history, now **Occupancy History**, shows LD2412 Presence, Moving and
  Still, LD2450 Presence and each zone you drew. MTR-1 tabs get the same
  history for the LD2450 and its zones.
- **A support file for Apollo support.** Settings → Devices & services →
  Apollo mmWave → ⋮ → **Download diagnostics** saves a file with the
  versions, the dashboard and resource state, and for each radar its model,
  firmware, settings, zones and last calibration. MAC and IP addresses, Wi-Fi
  names and tokens are left out. Only administrators can download it; see
  [Support file](docs/configuration.md#support-file).
- **New tab layout.** An MTR-1 tab is no longer just the zone map: its help,
  Radar setup and the map come first, then the cards above. On an R PRO-1
  they sit after the LD2412's first column, under the Zone Map heading. MSR-1,
  MSR-2 and R PRO-1 tabs start with **Start here**, then the gate radar's
  Radar setup card and Auto-calibrate, and every tab ends with the Device
  card.
- **The zone map in feet or meters.** The map follows Home Assistant's unit
  system: feet for US customary, meters otherwise. The new **m / ft** switch
  on the map changes it. An administrator's choice is saved for that radar,
  so everyone sees it; anyone else only changes their own view. Labels in
  feet now read "4 ft". Automations can set it with `apollo_mmwave.update_zone`
  and its new `display_units` (`m`, `ft`, or `auto` to follow Home Assistant
  again).
- **The map fits what the radar sees.** The radar sees 120 degrees wide and
  about 6 m (20 ft) out. The map now fits that area, turned the way the radar
  is rotated, plus any zone you drew, instead of a fixed 10 m square where the
  radar's view filled only the top half. A caption at its edge reads "Radar
  range 6 m (20 ft), 120°". A card with its own `grid` in YAML keeps it.
  Zone map cards added from the card picker before 2.3.0 carry a `grid`,
  `grid_units: mm` and `unit_display: false` in their YAML. Delete `grid` and
  `grid_units` and set `unit_display: true` to get the fitted map in your
  units, with its distance labels and range caption.

## What changed in 2.2.7

The zone map card and zone presence sensors now work when Home Assistant
shows the radar's targets in inches or any other unit. Nothing needs changing
by hand unless your Lovelace resources are managed in YAML (replace both
`?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Zone map dots and zone presence follow each sensor's unit.** If Home
  Assistant is set to US customary units, or you changed a Target X or Y
  sensor's unit in its settings, the zone map card's dots stayed at or right
  around the sensor and zone presence sensors did not turn on for people in
  the zone. Home Assistant shows those sensors in inches on a US customary
  system, and Apollo mmWave read every number as millimeters. 2.2.7 reads
  each sensor's unit, so nothing needs changing by hand. If you set the
  card's `input_units` to work around this, it no longer matters for these
  sensors and can stay.
- **Check zones drawn while the dots were wrong.** A zone drawn around where
  the dots used to sit may not cover where people actually show up now. Walk
  through the room, watch the dots, and redraw any zone that is off.

## What changed in 2.2.6

The Apollo mmWave dashboard is created once, when you add the integration,
and is no longer recreated or rewritten at every start. Startup no longer does
disk work on Home Assistant's event loop, and old zone locations no longer
bring a deprecation warning. Nothing needs changing by hand unless your
Lovelace resources are managed in YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **The dashboard is created once.** Adding Apollo mmWave creates the
  dashboard right then, if you leave its box ticked, and Home Assistant no
  longer recreates, rewrites or deletes it at restart or when the integration
  reloads. New dashboards are for administrators only unless you untick
  **Only administrators can see it**; change that later in the dashboard's
  settings under Settings → Dashboards. A dashboard you already have is left
  as it is, including who can see it. With the dashboard turned off, setup
  no longer deletes a dashboard you made yourself on `/apollo-mmwave`. To add
  or remove the dashboard, or choose its devices, open the integration's
  options (Settings → Devices & services → Apollo mmWave → **Configure**); see
  [The Apollo mmWave dashboard](docs/configuration.md#the-apollo-mmwave-dashboard).
- **Only administrators can change zones.** The `apollo_mmwave.update_zone`
  action, which the zone map card uses to save, now refuses users who are not
  administrators, so they can no longer change zones or create and remove zone
  entities. They still see the zones and their presence sensors, and the card
  answers a change with "Could not save". Automations are not affected.
- **Startup stays off the event loop.** The startup check for the bundled
  card files no longer touches the disk on Home Assistant's event loop, and
  the integration now loads all of its own code when Home Assistant imports
  it, instead of importing modules on the event loop partway through setup.
- **No deprecation warning for old zone locations.** Matching a 1.x zone
  location to its radar by name no longer uses a device registry call that
  Home Assistant is retiring (2026.10 warns about it in the log). It also
  matches only ESPHome devices, so a router integration's device with the
  same name cannot take the zones.

If HACS shows Apollo mmWave installed as 4263323, 5299868 or 96245a2, open it
in HACS, choose **Redownload**, pick 2.2.6, then restart. Those commit codes
read as very high version numbers, so HACS would not offer releases
otherwise.

## What changed in 2.2.5

Removing Apollo mmWave now also removes its dashboard resources, and the
README explains switching from the original repository. Nothing needs
changing by hand unless your Lovelace resources are managed in YAML (replace
both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Removal cleans up its resources.** Deleting Apollo mmWave in
  Settings → Devices & services now also deletes its two Lovelace resources,
  so dashboards no longer ask for two files that are gone after the next
  restart. Other resources are left alone. With resources managed in YAML,
  the log names the two rows to delete by hand. If you removed an older
  release, delete the two `/apollo_mmwave/` rows yourself; see
  [Removing Apollo mmWave](docs/configuration.md#removing-apollo-mmwave).
- **Switching from the original repository.** If you installed from
  bharvey88/apollo-mmwave, which is no longer on GitHub, the README now has
  the steps to move HACS to this repository and what not to press on the way.
  See
  [Switching from the original repository](README.md#switching-from-the-original-repository).
  It also says to take a backup before updating, and to restart and refresh
  the browser after.
- **Developer tooling.** Ruff 0.17.1, vitest 5.0.5, happy-dom 21.0.4 and a
  newer hassfest action; none of it ships to Home Assistant.

## What changed in 2.2.4

Auto-calibration leaves more headroom, so a calibrated radar triggers less
often when nobody is there. Nothing needs changing by hand unless your
Lovelace resources are managed in YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Less sensitive calibration.** Each new threshold is now the highest energy
  the gate reached in the empty room plus 15 points or 35% of that peak,
  whichever is larger, instead of 10 points or 25%. Quiet gates end up about
  5 points higher than before. Calibrated radars could still trigger with
  nobody there: Home Assistant sees only about one in ten of the radar's
  readings during the listen, and something that moves now and then, like a
  fan or the heating, may not move during the one-minute listen.
- **Thresholds you already have stay as they are.** Press **Calibrate with
  empty room** again to get the new headroom, and **Undo** still puts your
  previous values back.
- **Still too sensitive, or now missing people?** The headroom is a card
  option. `margin` (points) is the one that moves quiet gates, which is most
  of them; `margin_pct` (percent of the peak) only takes over on gates whose
  peak is 43 or more at the defaults, such as gates right at the sensor. Add
  `calibration: {margin: 20}` to the Auto-calibrate card or the dashboard
  strategy, or pass `margin` and `margin_pct` to the
  `apollo_mmwave.calibrate_gates` action.
  `calibration: {margin: 10, margin_pct: 25}` gives the 2.2.3 headroom back.
  See [Auto-calibration](docs/configuration.md#auto-calibration).

## What changed in 2.2.3

A new wiki link, a note for R PRO-1 owners and a newer build toolchain.
Nothing needs changing by hand unless your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Tuning guide.** The help card's **Full tuning guide** link now opens the
  new
  [Apollo mmWave dashboard guide](https://wiki.apolloautomation.com/products/general/setup/apollo-mmwave-dashboard/)
  on the Apollo Automation wiki instead of the older zone pages. On an R PRO-1
  tab it opens the R PRO-1's own copy of the guide at its LD2412 section. The
  README links the new setup and tuning guides too.
- **R PRO-1.** Every R PRO-1 has the LD2450 for the zone map; the LD2412 that
  radar tuning uses is an optional add-on. The README and
  [Auto-calibration](docs/configuration.md#auto-calibration) now say so. On an
  R PRO-1 without the LD2412 the tab still shows the tuning cards, but the
  Auto-calibrate card says the radar is offline and the charts say "device not
  found", so use the zone map on that tab.
- **Build toolchain.** The cards are now built with Vite 8 and type checked
  with TypeScript 7. They work as before, and the files your browser downloads
  are smaller because they are now minified: the tuning cards went from 158 kB
  to 100 kB and the zone map from 122 kB to 72 kB (41 kB to 30 kB and 31 kB to
  20 kB compressed).

## What changed in 2.2.2

Two fixes to the Auto-calibrate card from a second round of hardware testing.
Nothing needs changing by hand unless your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Preview table fits the card.** A preview no longer adds "(would set)" to
  every cell, because the line above the table already says these are the
  values calibration would set. On a narrow card a note such as "(was off)"
  now wraps under its value instead of pushing the Still threshold column out
  of view.
- **Clearer gate names.** Warnings now name the threshold, so "G2 still is
  off" no longer reads like "G2 is still off". The card says "The G2 still
  threshold is off (set to 100). Calibrating will turn it back on." and, for
  several, "These thresholds are off (set to 100): G0 move, G2 still." A value
  the radar did not confirm reads "G3 move threshold reads back 35 (asked for
  27)".

## What changed in 2.2.1

2.2.1 fixes what testing auto-calibration on real MSR-1, MSR-2 and R PRO-1
radars turned up. Nothing needs changing by hand unless your Lovelace resources
are managed in YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

- **Gates you turned off.** A threshold at 100 means that gate never triggers.
  Calibration still sets those gates, and the card now says so: before a run it
  names them ("G2 still is off (set to 100). Calibrating will turn it back
  on."), the result table marks them ("100 → 15 (was off)"), and a line under
  the table says how to turn one off again. Gates the radar is not using
  (beyond your max gate) are left out, and so are gates the last calibration
  turned off itself.
- **Thresholds the radar has not reported yet.** A radar that has been running
  for a long time can show every threshold as unknown. The card now says how
  many ("The radar has not reported 18 of its threshold values yet.") instead
  of listing every entity, and offers **Read settings from the radar**, which
  asks the radar for them and then tries again. The entity ids go to the Home
  Assistant log.
- **Undo and Redo.** The button says what it puts back: **Undo (restore your
  previous values)** after a calibration and **Redo (put the calibrated values
  back)** after an Undo. The card also shows when those values were saved.
- **After a restart.** A run stopped by a Home Assistant restart now reads "Last
  preview ... was stopped by a Home Assistant restart. Nothing was changed."
  in the card's footer instead of "failed", and a preview is called a preview.
- **Wording.** The card says it sets each threshold "a margin above" the
  background it heard, not "just above" it.
- **Icon.** Apollo mmWave shows its own icon in Settings → Devices & Services
  instead of a placeholder.
- **Distances chart.** With nobody in the room, the Detection, Moving and Still
  rows now say "no target" instead of showing an old distance from before a
  restart.
- **Zone map labels.** On a narrow card the distance labels along the top no
  longer run into each other, and the center line no longer prints each
  distance twice ("2m2m").

## What changed in 2.2.0

2.2.0 adds auto-calibration and the fixes from a full review of the code.
Nothing needs changing by hand unless your automations call
`apollo_mmwave.update_zone` directly or your Lovelace resources are managed in
YAML (replace both `?v=` URLs; see
[Lovelace resources](docs/configuration.md#lovelace-resources)).

**New**

- An **Auto-calibrate** card at the top of every gate-radar tab, backed by
  three new services (see
  [Auto-calibration](docs/configuration.md#auto-calibration)).
- First-run help on each tab: a "Start here" list, a button on the Gate Energy
  chart that turns on Radar Engineering Mode, outlined bars for gates above
  their threshold, a hint when an MSR still has factory thresholds, and the
  R PRO-1's Dynamic Background Correction rows in its Controls card.

**For automations that call `update_zone`**

- `zone_id: 0` is refused now; ids start at 1. A zone 0 made earlier from YAML
  or Developer Tools (the card never made or edited one) can no longer be
  changed or deleted through the service. To remove it, stop Home Assistant,
  take a backup, delete zone `"0"` from `.storage/apollo_mmwave.zones`, then
  start Home Assistant and delete the zone's two leftover entities in
  Settings → Devices & Services → Entities.
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
  [Choosing which devices appear](docs/configuration.md#choosing-which-devices-appear)).
- Zone presence no longer flickers on or off when a target's X and Y arrive
  together, which is the normal case.
- Zone map drawing: touch input follows one finger, a click in rectangle mode
  no longer wipes the zone, a polygon survives the mouse leaving the grid, and
  Backspace or Escape typed into a text field leave it alone (see
  [Drawing zones](docs/configuration.md#drawing-zones)). Right after a restart
  the card retries instead of showing "Unknown command."
- Zone manager: **Delete** can no longer be undone, a name you are typing
  survives updates, and names from the card's YAML `zones:` list stick. The
  map draws the stored rotation, not the YAML `cone.angle_deg`.
- Duplicate Lovelace resource rows are removed. A dashboard row the integration
  made earlier on `apollo-mmwave` is no longer deleted while a YAML dashboard
  holds that path (deleting it took the YAML dashboard's panel with it). A zone
  store file with the wrong shape no longer stops the integration from loading.
  It loads what it can, logs what it could not read, and rewrites the file
  without the unreadable parts, so keep a backup (see
  [Troubleshooting](docs/configuration.md#troubleshooting)).

Developer tooling changed too; see
[Development](CONTRIBUTING.md#development).

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
