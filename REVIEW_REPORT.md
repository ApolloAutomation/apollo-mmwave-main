# Review report

This is the final report of the full audit of Apollo mmWave (the `apollo_mmwave` Home Assistant integration and its Lovelace frontend). It ran unattended on 2026-10-10 and 2026-10-11 on branch `review/full-audit`, starting from tag `pre-audit-2026-10-10` (49e8225).
The audit mapped the code into ARCHITECTURE.md, found 336 unique issues and verified each one (334 confirmed, 2 refuted). It grouped them into 164 commit-sized clusters: 99 fixed or improved with one commit each, 1 that needed no change, 3 documentation clusters handled after integration (in repair and the docs pass), and 61 flagged in place with a recommendation. One flagged item, X10, was fixed after the review showed it reopened a fixed bug (711f65b), so 60 remained flagged. X54, X56, X57, X60 and X61 have been done since, so 55 are open. X05, X24, X38 and X39 among them are resolved by documentation: the docs say what their recommendation asks, and their code is unchanged.
It also built the scope you added during the run: empty-room auto-calibration for LD2410 and LD2412 radars and first-run dashboard improvements (shipped on `main` as 2.2.0; `main` is now at 2.2.6. GitHub releases now exist, starting with 2.2.6, so HACS offers releases; before that it installed the latest `main` commit, shown as a commit hash), plus two Apollo Wiki guides.
All 7 high-severity findings are fixed. pytest went from 107 to 490 tests, vitest from 208 tests in 20 files to 737 in 27, and npm audit from 10 advisories (3 critical) to 0. The shipped bundles stayed byte-identical through the toolchain upgrade.
As of ca4d56e the branch had 129 commits on top of the baseline. Two more fixes (cdd64a5, 711f65b) and the docs commit that adds this file come on top of that.
Merge status: all merge conditions met (full build, every baseline test kept or deliberately replaced, all new tests, CI green, no conflicts). Merged into `main` with a merge commit through PR #7; the post-merge verification is recorded as the final comment on the PR.
PR: [ApolloAutomation/apollo-mmwave-main#7](https://github.com/ApolloAutomation/apollo-mmwave-main/pull/7) (merged into `main`).
Wiki: [ApolloAutomation/docs#1150](https://github.com/ApolloAutomation/docs/pull/1150), branch `docs/apollo-mmwave-dashboard`, merged into `dev` (90748c86) and published through [ApolloAutomation/docs#1151](https://github.com/ApolloAutomation/docs/pull/1151). The guides are live on the Apollo Automation wiki.

## Repo health before and after

Baseline is `pre-audit-2026-10-10` (49e8225). "Final" is the current tip, ca4d56e, re-run for this report. The fix-phase final verification at 971bbde gave the same pytest, vitest, ruff, tsc and bundle results. The dependency upgrade (npm audit 0) was merged after that verification, in a316b03.

| Measure | Baseline (49e8225) | Final (ca4d56e) |
|---|---|---|
| pytest | 107 passed | 490 passed |
| vitest | 208 tests in 20 files | 737 tests in 27 files |
| ruff format / ruff check | 26 files formatted; all checks passed | 41 files formatted; all checks passed (select=ALL unchanged) |
| tsc --noEmit | clean | clean |
| Committed bundles match a fresh build | yes | yes (byte-identical at 971bbde; byte-identical at ca4d56e under vite 6.4.4) |
| npm audit (frontend-src, build and test tooling only) | 10 advisories: 3 critical, 4 high, 3 moderate | 0 vulnerabilities |
| pip-audit (test environment) | cryptography 48.0.1 (PYSEC-2026-3554) and pyjwt 2.13.0 (14 PYSECs), both transitive pins of homeassistant 2026.8.1 | cleared by moving the test pins to HA 2026.10.0 (7a5845f); not re-run at the end |
| CI jobs | 5: Ruff, pytest, vitest + bundle sync, Hassfest, HACS | the same 5. Ruff installs only the pinned ruff, pytest prints a coverage table, the frontend job pins Node 22 and also fails on untracked or deleted bundle files, and Dependabot now covers npm |
| Home Assistant versions tested | 2026.8.1 (CI and local) | CI: 2026.10.0 (pytest-homeassistant-custom-component 0.13.371). Local .venv: re-synced to the same pins after the docs pass (X56), 490 passed on HA 2026.10.0. Most local runs during the audit used 2026.8.1, the hacs.json floor, so both ends of the supported range were exercised |
| Frontend toolchain | vite 5.4.21, vitest 2.1.9, happy-dom 14.12.3, TypeScript 5.9.3 | vite 6.4.4, vitest 5.0.3, happy-dom 20.14.6, TypeScript 5.9.3 |
| Integration version | 2.1.3 (pyproject.toml said 0.1.0, the lockfile root said 1.2.2) | 2.2.0 everywhere, pinned by tests |
| Docs present | README.md, CONTRIBUTING.md | plus ARCHITECTURE.md and REVIEW_REPORT.md |

At the baseline, lint and type checks were clean and the bundles were in sync, but test coverage was thin and the review found real data-loss bugs: `input_units` was dropped on every restart (B03), merged v1 locations lost their entities (B06), and non-finite or oversized service values could break every later zone-store write (B01). Every high-severity finding and every fix cluster is now committed with a regression test, and the reviewers' mutation checks showed the new tests catch most reverted fixes (36 of 38 backend, 83 of 89 frontend; the misses changed no behavior or were redundant guards). The remaining risk sits in two places. Some flagged items have user impact (see Recommended next steps). The auto-calibration has not run on real hardware. X10, which could reopen B01's failure through extra keys, was fixed in 711f65b, and the local venv was re-synced to the pinned Home Assistant (X56).

## Process

1. **Map** (2026-10-10). Eleven reader agents each mapped one subsystem, a synthesizer drafted ARCHITECTURE.md, and a critic checked the draft against the code. Its 10 citation fixes and 13 omissions were applied before 7df6a6f.
2. **Baseline and environment.** The full suite was run on origin/main (numbers above) and recorded in the audit notes, along with the dependency audit and the environment changes. The audit pushed `review/full-audit` and opened draft PR #7 so that CI runs on every push.
3. **Find.** 12 finders, one per area, ran 3 rounds, seeded with the map's observations. They produced 431 raw findings, 336 unique after deduplication: 7 high, 62 medium, 267 low.
4. **Verify.** Two independent verifiers checked each of the 69 high and medium findings. File-batched verifiers checked the 267 low ones, and a synthesizer followed (242 agents in the run that finished). Result: 334 confirmed, 2 refuted. Actions: 84 fix, 154 improve, 74 flag-only, 22 confirmed but dropped.
5. **Synthesize.** The findings became 159 commit-sized clusters. Five more were added before the lanes started: E01 to E03 for the copy rules, and X60 and X61 for open items in the calibration feature. That made 164 clusters: 51 fix, 52 improve, 61 flag-only.
6. **New scope.** Your request arrived at about 00:20 ET on 2026-10-11, after the audit had started. The auto-calibrate feature went through design (3 designs, 3 judges, synthesis, critique, revision, recheck), then implementation in a separate worktree in parallel with verification (backend, frontend, 3 reviewers, 2 fixers, final verifier). It was merged into `review/full-audit` first (73c6da5). The wiki guides were written in the docs repo in parallel (3 writers, 3 reviewers, a fixer and a build check).
7. **Fix lanes.** Five git worktrees ran in parallel, each on its own branch: be-a (store, migration, update_zone; 19 clusters), be-b (entities, LD2450, websocket, frontend.py, config flow; 17), fe-a (tuning cards, detection, strategy; 29), fe-b (zone map card; 27) and tooling (8). Inside a lane the clusters ran in sequence, one agent and one commit per cluster. The full suite (ruff format check, ruff check, pytest, tsc, vitest) had to pass before each commit. Each lane then added one commit of TODO markers for its flag-only clusters and ran a final lane check. The lanes used 110 agents: one per cluster (100), one flag commit per lane (5) and one final check per lane (5).
8. **Integrate.** The lanes were merged in order (be-a, be-b, fe-a, fe-b, tooling). The only conflicts were in three test files in the be-b merge, and both sides were kept. One commit (87d847f) rebuilt the bundles.
9. **Review the integrated diff.** Three reviewers covered backend regressions, frontend regressions, and policy and completeness. They found no must-fix items, 5 should-fix items and 20 notes. The policy reviewer found that D02, D03 and D05 had never been assigned to a lane.
10. **Repair.** Four should-fix items were fixed in 0765952 (B05 store sections), 58737d9 (US spellings), aa3f6d9 (D05) and 8c81cfb (the non-README half of D02), and 971bbde rebuilt the zone-map bundle. The fifth, D03, and the README half of D02 were routed to the docs pass.
11. **Final verification** at 971bbde. Every check passed and the tree was clean (see the last section).
12. **After verification.** The dependency branch was merged (a316b03), then three fixes landed (b9b88b9, e76b424, ca4d56e), then the docs pass and this report.

**Interruptions and incidents**

- The first review run's verify phase stopped twice: first on the account session limit, then on the workflow's 1000-agent cap. The finder results were recovered from the workflow journal into `candidates.json`.
- The next two verification launches failed at startup because of launch mistakes, and no agents ran (see "Attempted and reverted").
- Early on 2026-10-11 the Fable session limit hit (it reset at 4:50 pm ET). Verification stood at 198 of 242 agents. The implementation run had finished the frontend, and the backend stopped mid-work. You then said to use Opus 5.5 if Fable hit its limit again; that was saved as a memory. Over its life the verification run was interrupted three times by usage limits and resumed from its journal each time.
- In the evening the Fable model limit hit and you switched the session to Opus 5.5. Around the same time a cleanup of `/private/tmp` removed part of the scratchpad: `candidates.json`, the maps, the seeds, the audit notes and the docs clone. State was rebuilt from the durable workflow journals under `~/.claude/projects/.../subagents/workflows/`. `candidates.json` was rebuilt, and its ordering was checked against the high-severity indexes. The audit notes were reconstructed from the session log, and the backend agent recovered `CALIBRATION_SPEC.md` and its addendum byte for byte from earlier agents' read results. Durable copies were then kept in `audit-backup/`.
- A `git push` over HTTPS hung in `git-credential-osxkeychain`, waiting on a Keychain approval nobody could answer. The process was killed, and pushes since then go through the GitHub CLI credential helper (`git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push ...`). This was saved as a memory too.
- The git stash is shared across worktrees, so two lanes that stashed within seconds of each other got each other's stash (tooling C01 and fe-a V01). Both agents noticed, put their own edits back and committed only their own files. ab26185 contains only `.devcontainer.json` and its test, and c04fee8 contains no `.devcontainer.json`. The policy reviewer confirmed that every file touched by one lane matches that lane's tip.
- CI failed the vitest job on the 73c6da5 push (00:25 UTC on 2026-10-12) and again on e76b424. The same ten calibrate-card and calibration-model tests rendered dates and failed once it was past midnight UTC. ca4d56e fixed it, and all five jobs passed there.

## Changes by category

Each row is one committed cluster from the fix lanes. "Why" is the problem the commit fixed. "Behavior impact" is "None" when nothing a user, an automation or a log reader can see changes.

### Correctness and data integrity (backend)

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| B01 | 4b9f800 | Reject non-finite, oversized and zero values in update_zone | Non-finite coordinates or rotation raised OverflowError or ValueError after the in-memory entry had already changed. Values like 1e20 were stored as integers over 64 bits that HA cannot serialize, which broke every later zone-store write for every radar. `zone_id` also accepted 0. | Bad rect, ellipse or polygon values now clear with the existing warnings instead of raising, and coordinates past 2**53-1 are refused. `zone_id: 0` now fails schema validation, so a zone 0 created earlier by hand can no longer be addressed by the service. A stored non-finite rotation is treated as no rotation. |
| B02 | 061e552 | Refuse update_zone calls that change nothing | Any call that carried a `zone_id` counted as a change. A bare zone_id, data without a shape, `data: null` or a rename of a missing zone minted an empty store entry, saved it and fired `SIGNAL_ZONES_UPDATED` and `apollo_mmwave_zone_updated`. | Such calls are now refused with a WARNING and fire no event. Mixed calls still apply their other fields and warn that the name was not applied. The card is unaffected. |
| B03 | 3bde3f4 | Restore input_units when the zone store loads | `_parse_entry` dropped `input_units` on every load, so DIY units were lost on each restart or reload, and the next save erased them from disk. Four of the seven high-severity findings were this bug. | Devices set to cm, m, in, ft or yd keep that unit across restarts and reloads. Apollo firmware (millimeters, key absent) behaves as before. |
| B04 | ecde637 | Treat an empty v1 placeholder zone as a gap when rekeying | In the v1 to v2 rekey, an empty `{}` placeholder from one location blocked a real zone from a second location on the same device, and logged a false collision warning. | One-shot migration only: a real zone now replaces an empty placeholder with no warning. Real conflicts still keep the first writer and warn. |
| B05 | b518db0 | Reject a malformed zone store payload without a traceback | A zone store file of the wrong shape (v1 `data` null or a list, a list for `locations`, v2 `data` as a list) raised AttributeError and failed setup. | The entry now loads with an empty zone store and logs an ERROR. In the v2 case the bad file is overwritten on setup, as a v2 `data: null` file already was. |
| B06 | 05046d7 | Keep every merged v1 location name bridgeable after migration | When two v1 or legacy locations merged onto one radar, only the first name was kept. The second location's entities were silently abandoned on their old unique ids and duplicated (high severity). | Upgrades from 1.x now adopt the entities from every merged location, keeping their entity id, name and area. `location:` accepts any merged name, and the store can hold an optional `aliases` list. Installs already on 2.x are not repaired. |
| B07 | d319347 | Count placeholder replacements in the zone_mapper import | The import counted zones by key growth, so filling an empty placeholder counted 0 and logged nothing. | The "imported N zone(s)" INFO line now includes those zones. Stored data is unchanged. |
| B08 | 8d06a63 | Invalidate every radar affected by a target-sensor registry change, and only then | The LD2450 pair cache missed a target sensor that moved between devices, or was renamed and moved. Every unrelated registry event, including the integration's own zone entities, re-sent `SIGNAL_ZONES_UPDATED`. | The old device is now invalidated when a sensor leaves it. Non-target registry events no longer signal, so creating or renaming a zone gives one websocket push instead of two or three. |
| B09 | 39eee24 | Forget refused adds on disabled devices and stop zone nudges during unload | A zone on a disabled radar left the tracker's pending flag set forever, so every later removal sent retry nudges. During unload, those nudges re-added live zone entities bound to the old store. | Deleting a zone sends one signal instead of three. Unloading leaves every zone entity unavailable, with no zombie entities and no unique-ID errors, and presence follows the reloaded store. |
| B10 | 445736b | Coalesce presence evaluation for a target's X and Y updates | Presence was evaluated inside each X and Y state change, so the mixed point (new X, old Y) could publish a false on/off pulse. | Presence is written once per event-loop turn, so the pulse is gone when X and Y arrive in the same turn, which is the normal ESPHome batching path. The final state is unchanged. |
| B11 | 3756804 | Clean up the service and store on failed setup and on removal | HA never calls `async_unload_entry` for a failed setup, so `update_zone` and a stale store were left behind. Removing the entry left the live store's delayed save running, and it rewrote the file. | A failed setup leaves no service or store behind, and removal no longer rewrites `.storage/apollo_mmwave.zones` about 2 s later. On unload, the websocket subscriptions now close before the store is popped. |
| B12 | 1ef5b6b | Keep exactly one module resource row per bundle | Resource rows were keyed by base URL, so a duplicate row for a bundle (an old `?v=` copy or a hand-added `js` row) was never removed. Such a row could load the bundle twice or fail on `export`. | Duplicate rows under `/apollo_mmwave/` collapse to one `module` row at the current `?v=`. The log's "removed" list now shows full URLs. |
| B13 | e752aa3 | Decide dashboard ownership from our own row and roll back a half-made one | A user's YAML dashboard on the `apollo-mmwave` path that shadowed a leftover auto-created row could be deleted or written to on every boot. A failed first save left a row with no config that was never recognized again. | The shadowed row is left alone. A failed first save rolls the new row back, so the next setup creates the dashboard properly. |

### Zone map card

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| F14 | 7537a44 | Retry the zone subscription while its command is not registered | On a fresh boot, HA answers `unknown_command` until the integration registers its websocket commands. The card showed "Unknown command." and never retried. | The card shows the "not loaded ... will come back on their own" text and retries with the existing bounded backoff. |
| F15 | 6a17d2b | Cancel drawing on outside clicks using the composed path | The outside-click handler checked `event.target`, which the browser retargets to the shadow host, so it never canceled. On touch, a half-drawn polygon was saved under a newly selected zone. | On touch devices, tapping another card control mid-shape now cancels the shape. Desktop is unchanged. |
| F16 | 71a43d9 | Finish polygons only on a real double-tap and never store its extra vertex | Any two clicks within 350 ms finished the polygon wherever they landed, and the finishing click was saved as a duplicate vertex. | A finish now needs a second tap within 350 ms and within 24 CSS px of the last vertex. The finishing tap is never stored, and a same-spot double-tap with two vertices saves nothing. |
| F17 | 0119c91 | Keep a half-drawn polygon when the pointer leaves the canvas | Moving the mouse off the canvas mid-polygon silently discarded every vertex. | The vertices are kept. Only the rubber-band line disappears until the pointer comes back. Rect and ellipse drags still cancel. |
| F18 | 5a160dd | Reset in-progress drawing only when the mode or radar actually changes | Re-clicking the active mode, or any re-render, hid a half-drawn polygon while Finish still used it. Pointing the card at another radar carried the old vertices into the new radar's zone. | A shape in progress survives re-renders and same-mode clicks. A real mode change or a different `device_id` drops it. |
| F19 | 7ae0464 | Keep the rect and ellipse preview across repaints | Only `draw()` painted the dashed preview, so any hass push or zone payload mid-drag erased it. | The preview stays during repaints and is now drawn under the target dots. Saved geometry is unchanged. |
| F20 | f74b695 | Draw the cone and targets at the stored rotation, not the YAML angle | With no stored rotation, the card drew the cone and targets at the YAML `cone.angle_deg`, while the presence sensors evaluated unrotated coordinates. | Only for a hand-written non-zero `cone.angle_deg` with no stored rotation: the card now draws at 0, matching the sensors. Double-click still resets to the YAML angle and saves it. |
| F21 | 2f6a746 | Never save a degenerate rect from a click or a collapsed canvas | A click or a straight drag in rect mode sent a zero-area rect, which the backend stores as `data: null`, wiping the zone, while the card said "saved". A canvas with no layout box produced corner-pinned shapes or NaN radii. | Those gestures now save nothing and leave the zone and the undo snapshot untouched. Real drags save as before. |
| F22 | 1833fda | Ignore drawing shortcuts typed into text fields | Backspace and Escape typed into the zone-name field, or any field, deleted polygon vertices or discarded the polygon. | Keys typed into inputs no longer touch the polygon. Elsewhere the shortcuts work as before. |
| F23 | dcc2227 | Track the drawing finger and handle touchcancel | A second finger mid-drag moved the drag's start point, and the next lift saved a collapsed shape. There was no touchcancel handling. | A second finger no longer affects the shape. A canceled touch saves nothing, and a polygon keeps its placed points. |
| F24 | ee1669e | Do not commit a drag whose zone was removed meanwhile | If the selected zone disappeared mid-drag, the card added a phantom zone 0 to the map while the backend refused the save. | The drag ends with nothing saved and no phantom zone. |
| F25 | 7d4e7c5 | Save renames of YAML-seeded zones as new zones | Renaming a zone named only in the card YAML sent a name-only update that the backend drops. The card still said "saved", and the next payload put the YAML name back. | Save now creates that zone in the store, with no shape and the typed name, so the rename sticks. |
| F26 | b9348ae | Keep a zone name being typed across payload pushes | Every payload rebuilt the zone manager rows, so a name being typed was replaced and focus was lost. The card's own writes come back as payloads, so this happened often. | Unsaved name edits, focus and caret survive pushes. Nothing sent to the backend changes. |
| F27 | 6a565f5 | Restore card defaults when config keys are removed | Removing `grid`, `cone`, `show_undo`, `unit_label_size` or `start_locked` from a live card's config kept the old values. | A live card now matches a fresh card with the same config, and an unusable `unit_label_size` falls back to 18. |
| F28 | 9f32e45 | Re-render the card's error screen on a theme flip | A theme change re-rendered only when a canvas existed, so the load-error screen kept the old dark or light class. | The error screen follows theme flips. |
| F29 | 94cd3f1 | Drop undo entries for a deleted zone | Delete left the zone in the undo snapshot, so Undo re-created the deleted zone and its entities, or overwrote a zone added later under the same id. | Undo no longer brings deleted zones back. Entries for other zones can still be undone. |
| F30 | 1f28e97 | Clamp ellipse corners to the grid before deriving radii | A touch drag that ended off the canvas clamped the ellipse center but not its radii, so the saved ellipse reached past the grid. | Such ellipses now fit inside the grid, like a rect does. Drags that stay on the canvas save the same payload as before. |
| F31 | d672693 | Clear the polygon start point when its only vertex is undone | Undoing the only vertex left a dot and a rubber band at the removed point. | The dot and the rubber band disappear. |
| F32 | 8fcef63 | Ignore non-primary mouse buttons on the zone map canvas | Right and middle clicks started drags, placed vertices and saved zones. | Only the left button and touch draw. The context menu still opens. |
| F33 | 6aac16a | Keep YAML zone names the store does not carry | Geometry writes carry no name, so drawing on a YAML-named zone ("Kitchen") turned its label into "Zone 1" on the next payload. | The YAML name stays on the chip, the manager row and the canvas label. A non-blank stored name still wins. |
| F34 | e9313b2 | Show one toast when a zone save fails | A rejected save showed HA's own "Failed to perform the action" toast and haptic as well as the card's toast. | Only the card's "Could not save: <reason>" toast appears. |
| F35 | df43e58 | Say the card is waiting before the first payload | Before the first payload, the status line said "No targets are tracked, which is what this radar was told to do", which was not true. | The line reads "Waiting for this radar's configuration." until the store answers. |

### Tuning dashboard and detection

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| F01 | c1ba0b1 | Derive the chart gate count from the longest gate array | The charts counted gates from `move_threshold` alone, so a disabled top-gate threshold entity dropped a distance band and gate 8's live energy. | Only when the gate arrays differ in length: both charts now show the full gate count. |
| F02 | 360af01 | Size the distance chart axis band for rotated labels | The fixed axis band cut off rotated tick labels wider than about 30 px, dropping digits from mm labels and showing wrong ft values. | The SVG is 16 viewBox units taller (`AXIS_H` 36 to 52) and labels fit in every unit. The card size is unchanged. |
| F03 | c6c7b1e | Say the radar is unavailable instead of asking for engineering mode | An engineering-mode switch reading "unavailable" (radar offline) was treated as off, so the overlay asked the user to turn the mode on. | In that case the overlay now reads "Radar unavailable / Waiting for the device to reconnect". A switch that is off or missing still gets the prompt. |
| F04 | 07c6a9d | Stop LD2450 detection leaking across same-named radars | The LD2450 probe built entity ids from the base name and looked them up globally, so an MSR-2 renamed to the same name as an R PRO-1 or MTR-1 got a zone map card. | An LD2410-only radar that shares a base name no longer gets a Zone Map heading or card. A DIY device with no registry model gets its LD2450 flag one registry update later. |
| F05 | 3a19762 | Regenerate on radar renames and honour legacy strategy options | The regeneration key ignored device names, so a renamed radar kept stale tab titles and paths. Legacy `{options: {devices}}` configs were keyed on every detected device instead of the selected ones. (The title's British spelling is left as committed.) | Renaming a radar or its entity ids now regenerates the dashboard. Legacy configs regenerate only when the selected devices change. |
| F06 | 3b0a940 | Show the help card on tabs without a gate-radar profile | The help card lived only in the gate-radar column. An offline MTR-1 tab had no "Offline right now" note, and a forced device with nothing detectable got an empty tab. | Those tabs now start with a help section: the offline note, or the "no radar data" card. A live MTR-1 still shows only the zone map. |
| F07 | ba16330 | Ignore the integration's own zone entities as radar liveness | The liveness fallback counted the integration's own zone entities, which never go unavailable. A dead, renamed radar with zones showed as online, and drawing a zone forced a regeneration mid-draw. | Such a radar now reads offline with the offline note, and drawing its first zone no longer regenerates the dashboard. |
| F08 | 9f7984b | Explain a stale device selection on the empty dashboard | When every selected device id was missing, the dashboard showed the generic "add your radar" text even though the radar was added. | The empty dashboard now says the selection points at devices that no longer exist and where to change Dashboard devices. Other cases are unchanged. |
| F09 | a32781e | Do not count the ESP Reboot button as a found gate radar | A device whose only classified entity is ESP Reboot (an AIR-1, an MTR-1, any ESPHome board) passed the "device found" check, so the card rendered blank or an empty axis. | That card now shows "Apollo mmWave: device not found". Devices with gate entities are unchanged. |
| F10 | 871adb9 | Title the tuning cards with the resolved chip | Card headers and chart aria-labels hard-coded "LD2410", so R PRO-1 (LD2412) cards were mislabeled. | LD2412 cards without a title now read "LD2412 Distances" and "LD2412 Gate Energy", with matching aria-labels. An explicit title still wins. |
| F11 | 396a7fd | Recompute card resolution when fallback detection changes | The resolution cache ignored `hass.states`. An R PRO-1 card resolved by base name before its LD2412 switch appeared kept LD2410 ids and showed "device not found". | Fallback-resolved cards switch to LD2412 ids on the tick the switch appears. Registry-resolved cards are unchanged. |
| F12 | 086aacb | Keep the full base name when a device name contains the chip token | The suffix patterns cut at the first `ld2412` or `ld2450` token, so "Office LD2412" became "office". | Such devices keep their full base name for the view path and the fallbacks. Other names are unchanged. |
| F13 | 9ca9c33 | Ignore non-array gate overrides in card config | A YAML `entities:` override of a gate slot with null or a string replaced the gate array, so the card crashed or read the string as characters. | Non-array gate overrides are ignored. Array and scalar overrides behave as before. |
| Q03 | c16883e | Use the registry profile in the base-name fallback | The base-name fallback chose the chip from `hass.states` alone, so a registry-known R PRO-1 with no chip marker got the LD2412 profile but a 9-gate LD2410 entity map. | That one case now gets the 14-gate LD2412 map. Other fallbacks are unchanged. |

### Validation and configuration

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| V01 | c04fee8 | Keep version numbers in sync across manifest, package files and lockfile | The lockfile's root package version still said 1.2.2 and pyproject.toml said 0.1.0, while everything else said 2.2.0. The only test checked semver shape. | None at runtime (metadata only). Tests now assert that every version equals `CARD_VERSION`. |
| V02 | 9bb6cc4 | Remove the unreachable entity translations | `en.json` had an `entity` block that HA never reads, because the zone entities set `_attr_name`. | None. |
| Q06 | 4863533 | Make update_zone geometry warnings name the right problem | The warnings said "in location" while being passed a device id. An unparseable polygon was reported as "insufficient points", and a drawable shape with no data cleared the zone without a log line. | Log output only: warnings name the device, a new `WARN_POLY_MALFORMED` covers bad points, and a shape sent without data now logs a WARNING. |
| Q11 | 82e8bed | Use the base OptionsFlow config_entry and cross-check the model list | The options flow kept its own copy of the config entry, which HA's OptionsFlow already provides. The docstrings described only one option, and `MMWAVE_MODELS` was not linked to the frontend's model list. | None. A new test fails if the Python model list and the profiles.ts prefixes disagree. |
| Q17 | 9b33d5b | Report dropped store entries and clarify the migrate function | Malformed entries in a hand-edited or partly restored zone store were dropped silently, and the next save made the loss permanent. | Logging only: one WARNING per dropped entry or zone. |

### Code quality

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| Q01 | a4be87f | Build the per-device entity index once per registry object | Seven detection helpers each scanned all of `hass.entities`. That made `shouldRegenerate` cost O(devices x entities) on every availability flip, about a 1 s stall at 300 devices and 5k entities (high severity). | None (output-identical). A WeakMap-backed index is built once per registry object. |
| Q02 | ceed91f | Re-render each tuning card only for the entities it draws | Each card re-rendered on every tick of any resolved entity, including entities it does not draw. | None visible. Renders that would produce identical output are skipped. |
| Q04 | 493094d | Repaint the zone map only when tracked target states change | Every hass update, meaning any state change anywhere, repainted the whole canvas. | None visible. The canvas repaints only when a tracked target changes. |
| Q05 | 7d9fd76 | Remove dead code and duplication in the zone-map card | The card had unreachable branches, an unused field and helper, three copies of the vertex-dot code, and a stroke color derived by string replacement. | None. The new tests pass on both the old and the new code. |
| Q07 | 9bb32df | Read the store from entity platforms without minting entries | `ZoneStore.zone()` and the entity readers went through the `device()` setdefault, so reading an unknown device created an entry that would be saved. | None for stored devices. Readers no longer create entries. |
| Q08 | 8693556 | Tidy the presence platform | The polygon boundary rule was undocumented, an import was deferred for a cycle that does not exist, and two pairs sharing an entity subscribed to it twice. | Presence results are unchanged. A shared entity is subscribed once. |
| Q09 | eb2dc3b | Tidy migration helpers | The legacy migration saved the store and its caller saved it again right after, and a private store helper was imported across modules. | A fresh setup writes the store once. If the zone_mapper import raises, no half-filled file is left behind. |
| Q10 | cf03275 | Simplify the dashboard register return and correct its docstrings | `async_register_dashboard` returned a bool that nothing read, and it returned True even on failure. A docstring still named HA 2025.9. | None. |
| Q12 | 6934f7e | Remove the unused panel keys | `PanelKey`, `ALL_PANEL_KEYS` and the `panels` config field were dead code. | None. Both bundles rebuild byte-identical. |
| Q13 | 7a13b00 | Share the history row type and presence filter | strategy-core.ts and the panels duplicated a row type, a helper and an inline presence filter. | None. |
| Q14 | 4208409 | Tidy duplicated chart and card constants | Several constants, the card picker registration and a tooltip existed in two copies that could drift apart. The LD2412 Min Gate row showed the upper-limit tooltip. | The LD2412 Min Gate tooltip now describes a lower limit. Outside HA, gate-energy labels get a gray fallback color. |
| Q15 | 8463f9a | Type legacy placeholder zones in ZoneDef | `ZoneDef` declared shape and data as required, although the store forwards `{}` placeholders. | None (type-only). |
| Q16 | d11f4e7 | Correct the EntityMap comments and test LD2412 and sparse rows | The `EntityMap` comment said gates are indexed 0..8, but LD2412 maps cover 0..13 and maps can be sparse. It also did not mention the LD2412 max/min slot overload. | None. |

### Tests

Every row in this table changes tests only, with no production code change, except T05, which also rewords one warning.

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| T01 | 08f960e | Add update_zone characterization tests | Most update_zone validation and normalization paths had no test: rect refusal and rounding, the ellipse radius floor, dropped polygon points, the add-zone payload, entity pairs, names, units, device_id handling and the schema's negative cases. Some tests record current behavior that may be unintended (see X01 and X14). | None. |
| T02 | a6b6a4c | Test ellipse, unusable-zone, unit and invalid-state presence, and the rotation twins | Presence was tested only against one rect zone. The ellipse tester, the unusable-zone guards, the unit factors, invalid states and the card's twin rotation were untested. | None. |
| T03 | c0524d3 | Test the debounced save and the name_by_user v1 match | No test advanced the clock to check the save debounce, and none set `name_by_user` for the v1 device match. | None. |
| T04 | 92616c2 | Test uncovered migration branches and tidy test helpers | Several migration branches worked but had no test: promoted-orphan rekeying, an entity with no device_id, fractional or garbage legacy rotation, and the zone_mapper no-match warning. | None. |
| T05 | e5cc2ef | Test the frontend registration branches and spell out the YAML-resource upgrade step | None of frontend.py's warning branches had a test. The YAML resource-mode warning did not say that each `?v=` changes with every upgrade. | Log text only: the YAML resource-mode WARNING now says to replace each bundle's existing row after every upgrade instead of adding a second row. |
| T06 | e9c58e0 | Test the options flow toggle and entry teardown | No test saved the options form with the dashboard toggle off or checked its device filter. Nothing checked that removal deletes the store file, that refused calls stay off the bus, or what a failed platform unload does. | None. |
| T07 | c9f6815 | Test the LD2450 startup listener and the removal scan | The STARTED one-shot never ran in tests because the fixture starts in the running state, and no test removed a target sensor. | None. |
| T08 | 1b370c8 | Test websocket payload fields, access and disconnect | Nothing recorded that the zone commands are open to non-admin users on purpose. Stored payload values, the unload guard and client disconnect were untested. A comment now explains the non-admin access. | None. |
| T09 | 364be58 | Test the zone entity tracker against the real platform | The tracker's retry path and its disabled-entity path had never run through HA's real entity platform. | None. |
| T10 | 3928cda | Strengthen the zone sensor tests | The missing-device log test still passed if either of its two warnings was deleted, and the zone-name attribute was untested. | None. |
| T11 | 890847d | Test the zone-map card state machine and config handling | Coordinate transforms, rect and ellipse payloads, the polygon cap, undo payloads, Clear All batching, Add Zone id choice, load-error recovery and several bounds had no tests. 17 card tests and 1 API test were added. | None. |
| T12 | 6ea99d3 | Test chart renderers and tuning cards | Tick labels per unit, band labels, the sparse gate-8 render, the 14 LD2412 energy slots and several card paths were untested. A comment now explains the happy-dom SVG limitation. | None. |
| T13 | 29c3320 | Test entity, profile and LD2450 detection edge cases | No test called `isEsphomeDevice` or `detectProfile` directly, used a deduplicated LD2450 id, or tied `MMWAVE_MODELS` to `APOLLO_MODELS`. The new parity test reads config_flow.py. | None. |
| T14 | 1f7d46d | Test every unit conversion factor | The mm and yd factors, and ft as a source unit, were never exercised, so a typo in them would pass every test. | None. |
| T15 | 83afaaf | Test register.ts against a faithful polyfill model | The fake polyfill registry never touched the native registry, so the stand-in forwarding, the `hc-main` marker and the swallowed `define()` error were untested. It is now a model of scoped-custom-element-registry 0.0.10, checked against the pinned HA frontend bundle. | None. |
| T16 | 56fd032 | Pin cross-language contracts in tests | Strings that both halves must spell alike (the LD2450 regexes, element names, unique-id formats) were linked only by "keep in sync" comments. `tests/test_contracts.py` now checks them. | None. |
| T17 | 99feaf3 | Make the canvas test stub non-thenable | The canvas stub returned a function for `then`, which made it a thenable that never resolves, so awaiting it hung until the timeout. | None. |
| T18 | 009d3be | Tidy Python test imports and fixture comments | A fixture comment gave a false reason for its direct store write, and two imports inside test functions carried false `noqa` notes. | None. |
| T19 | e9e113b | Test the strategy layer output and glue | Exact column layouts per device type, the offline note, the history column rules and other strategy outputs were untested. | None. |

### Tooling, CI and dependencies

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| C01 | ab26185 | Run the devcontainer on Python 3.14 with the project venv | The devcontainer image was Python 3.13, but the project and HA 2026.10.0 need 3.14.2 or newer, so bootstrap could never install (high severity). VS Code also pointed at the system interpreter. | Contributor tooling only. A static test now fails if the image falls below `requires-python`. |
| C02 | 8d976e3 | Run scripts/develop from the project venv and describe it | `scripts/develop` called a bare `hass`, which exists only in `.venv`, so it failed with "command not found" from a clean shell. | Developer tooling only. |
| C03 | dc56c27 | Make bootstrap and lint scripts self-contained | Bootstrap required uv or pipx that it never used, and it had no Python version check. The lint scripts ran uv in project mode (writing `uv.lock`) and formatted before fixing. The Lint CI job installed all of HA to get ruff. | Developer tooling and CI only. Lint results are unchanged. |
| C04 | 4546c0a | Update Dependabot coverage and the pin comments | Dependabot had no npm entry for `frontend-src`, and the pin comments were stale. | None at runtime. Dependabot will open npm PRs and stops proposing bumps to the two lockstep HA test pins. |
| C05 | 0748387 | Tighten the frontend CI job | `git diff` cannot see untracked files, so a renamed bundle could pass the sync check. The job also had no Node version pin. | None at runtime. CI also fails on untracked or deleted files under `www/`, and it builds on Node 22. |
| C06 | b0304a0 | Report Python test coverage in CI | Nobody could see which Python code the tests miss. | None. The pytest log ends with a per-module coverage table (92% locally at the time) and no threshold. |
| C07 | 67ecf03 | Watch both frontend bundles | `npm run watch` rebuilt only the tuning bundle. | Developer tooling only. It needs a POSIX shell, so on Windows run the two watch scripts separately. |

### Documentation and copy

| ID | Commit | Title | Why | Behavior impact |
|---|---|---|---|---|
| D01 | 826fedb | Document zone naming and rotation sign | services.yaml did not say which way positive rotation turns, and the name field did not explain what renaming does. | Service field descriptions only. |
| D04 | 1354cd2 | Correct the LD2450 module docstring | The docstring made two false claims about how the frontend handles disabled entities and pairing. | None. |
| D06 | 6051166 | Fix the issue templates | The duplicate-search links pointed at the predecessor zone-mapper repository, and the bug form asked for a diagnostics dump the integration does not provide. | GitHub issue form text only. |
| E01 | 7379a82 | Remove em dashes and the R-PRO-1 spelling from backend user-facing text | Three backend strings broke the product copy style. | The config flow description, the `no_gate_entities` error and the `calibrate_gates` device field description read differently. A test now fails on an em dash or the "R-PRO-1" display spelling in en.json or services.yaml. |
| E02 | 448c7fc | Remove em dashes and fix copy in tuning-dashboard and calibrate-card text | Help cards, not-found messages and a tooltip used em dashes. The empty dashboard said "R-PRO-1", and the calibrate card said "afterwards". | Wording only: "R PRO-1" and "R PRO", colons and periods instead of dashes, and "afterward". |
| Q19 | 7e623d3 | Name MTR-1 in the strategy picker and doc comments | The "New dashboard" picker description left out the MTR-1. | The picker description now names MTR-1 (LD2450). No logic changed. |

### Auto-calibrate feature and first-run UX

You asked for this during the run. It was designed, implemented, reviewed and fixed on `feature/auto-calibrate`, then merged first (73c6da5) so that the fix lanes worked against the final code.

| Commit | Title | What and why | Behavior impact |
|---|---|---|---|
| e3a74ad | Add empty-room gate calibration service | A backend job sets each gate's move and still threshold from an empty-room listen: threshold = ceil(peak + max(10, 25% of peak)), rounded to the number's step and clamped to its min and max. The defaults are a 15 s countdown and a 60 s listen. Before the first write, the job hard-saves a snapshot of every current threshold and refuses to write if that save fails. It writes with pacing, reads each value back, and turns engineering mode on only for the listen (off again only if the job turned it on), including on unload and HA shutdown. Snapshots live in their own `apollo_mmwave.calibration` store, capped at 5. Exposed as the services `calibrate_gates`, `cancel_calibration` and `restore_gate_thresholds` (Undo), two websocket commands, bus events and translated errors. | New services and events. Nothing writes to a device without a service call or a button press, nothing runs on install or startup, and no existing tuning default changes. On the LD2412, Dynamic Background Correction stays a firmware button, and the job refuses to start while it runs. |
| 7f91130 | Add the calibrate card and first-run dashboard improvements | New users had no guided way to set thresholds. `apollo-radar-calibrate-card` ("Calibrate with empty room") is the first card on every gate-radar tab, with live progress, a per-gate before/after table, an Undo button labeled with the snapshot time, an interrupted-run banner and reconnect handling. The commit also adds a "Start here" help card, turns the Gate Energy chart's "Turn on Radar Engineering Mode" overlay into a working button, outlines bars above their threshold, adds a factory-thresholds hint and LD2412 Dynamic Background Correction rows, and points the tuning tips at Radar Timeout and at calibration. | New card and dashboard content on every gate-radar tab. Closing the browser does not stop a run. |
| ff16ae7 | Release 2.2.0: rebuild bundles, bump version, document calibration | The `?v=` cache buster is the integration version, so without the bump, cached browsers would never fetch a bundle that defines the new card. The commit rebuilds both bundles and documents the feature in the README and ARCHITECTURE.md. | Version 2.2.0, so browsers fetch the new bundles. |

How it was built and checked: three designs, three judges (two of three picked "backend calibration service with snapshot undo"), synthesis, a critique (3 blockers, 7 major, 14 minor), a revision and a recheck that resolved all 24 items. Implementation was followed by three reviewers: spec conformance, HA and ESPHome correctness, and test quality with the new-user experience. They found 5 major problems, and all were fixed before the commits:
- HA storage only logs write errors, so the "hard save before the first write" could not actually fail. It now raises, and the job fails with `snapshot_failed` and writes nothing.
- A listen with no usable gate data saved an empty snapshot that broke Undo. It now fails with a new `no_gate_data` code and takes no snapshot.
- The card judged LD2412 background correction from a payload that is not refreshed while idle. It now reads the live state.
- A rejected service call showed HA's "Validation error:" prefix. The card now shows the translated message.
- "Try again" on a failed restore restored the wrong snapshot. It now uses `restored_from`.

The final verifier also corrected a lockfile slip, where a search-and-replace had bumped two unrelated dependencies to 2.2.0. Tests at the merge: pytest 247 (from 107), vitest 394 in 23 files (from 208 in 20).

### Dependency upgrades (audit/deps)

These were made on `audit/deps` from 73c6da5 and merged after the lanes in a316b03. Every step rebuilt the bundles and checked that they were byte-identical to the committed ones.

| Commit | Title | Why | Behavior impact |
|---|---|---|---|
| 95739c5 | Apply non-breaking npm audit fixes to the frontend toolchain | `npm audit fix` updated nanoid, postcss and source-map-js inside the lockfile (high-severity, build time only). Advisories went from 10 to 7. | None. The bundles are byte-identical. |
| 73bfb45 | Upgrade happy-dom to 20 for the frontend tests | happy-dom 14 had three advisories, one critical (script execution, VM context escape, fetch credential origin). It is the test DOM only and is never bundled. Advisories went from 7 to 6. | None. |
| 483f561 | Upgrade the frontend test toolchain to vite 6.4 and vitest 5 | vitest 2 carried the critical tinypool and @vitest/mocker advisories, fixed only in vitest 5, which needs vite 6.4 or newer. vite 5.4 also carried dev-server advisories. npm audit now reports 0 vulnerabilities. | None. Two builds with vite 6.4.4 produced md5-identical bundles. |
| 8f64026 | Credit Brandon Harvey for starting the project | You asked for a thank-you to bharvey88 with a link to the bharvey88 GitHub profile on the repo page. | README Credits entry only. |

### Repair commits

These came out of the three reviews of the integrated diff.

| Commit | Title | Why | Behavior impact |
|---|---|---|---|
| 0765952 | Report a malformed devices, orphans or zones value in the zone store | The backend reviewer found that B05 guarded only the top level. A v2 file whose `devices` or `orphans` was a list or a string still failed setup with a traceback, and a non-object `zones` value dropped every zone of an entry silently. | Such files now load, logging an ERROR (bad section) or a WARNING (bad `zones`). An empty list for `devices` or `orphans` now also logs the ERROR. |
| 58737d9 | Use US spellings in the audit's new comments, tests and service text | The audit's new text used British spellings ("millimetres", "centre", "labelled" and others) against the US English rule. | Only the `update_zone` service description shown in HA changes. |
| aa3f6d9 | Correct frontend comments | Cluster D05 was never assigned to a lane. Five comments cited only the LD2410, or described behavior the code does not have. | None. |
| 8c81cfb | Document strategy device precedence and the dashboard devices caveat | Cluster D02 was never assigned to a lane. Nothing said that `device_id` wins over `devices`, or that the "Dashboard devices" option stops applying after "take control". | Only the "Dashboard devices" description in the options flow changes. A test pins the precedence. |
| 971bbde | Rebuild frontend bundles | The zone-map bundle keeps `card.ts` comments, so the comment fixes changed it. | None. The diff is comment lines only. |

D03 (the developer setup instructions) only touches README.md and CONTRIBUTING.md, so it was routed to the docs pass together with the README half of D02.

### Post-integration commits

| Commit | Title | Why | Behavior impact |
|---|---|---|---|
| b9b88b9 | Let vitest 5 read config_flow.py for the model cross-check test | After the vite 6.4 merge, vite's stricter `server.fs` rule refused T13's `?raw` import of `config_flow.py`, so the whole test file failed to load and only 718 of 737 tests ran. The test config now allows that one folder. The bundle builds use a different config and are unaffected. | None (test configuration only). |
| e76b424 | Correct the calibrate card's walk-test instruction | The wiki's first-time-reader review found that the card said Radar Target should turn off "a few seconds after you stop" moving. Radar Target covers still presence, so a user who sat still could press Undo on a good calibration. | The post-calibration line now says to walk around and then sit still for a minute, and that Radar Target should stay on the whole time you are in the room and turn off a few seconds after you leave. |
| ca4d56e | Make the calibration tests independent of the date and time zone | CI failed 10 calibrate-card and calibration-model tests after midnight UTC. The fixtures are stamped 2026-10-11, and the card adds the date to any time that is not today. Tests now freeze the date and run in UTC, and pass under six time-zone settings. | None (tests only). |
| cdd64a5 | Use US spellings in the remaining service text and comments | The docs pass found "millimetres" and "afterwards" left in services.yaml, and four British spellings in new comments. | The `input_units` and `calibrate_gates` service descriptions read "millimeters", "afterward" and "a margin above". |
| 711f65b | Store only the geometry keys of rect and polygon zones | Flagged as X10, but the integrated-diff review showed it reopened B01: an extra data key holding an int past 64 bits was stored and broke every later zone-store write for every radar. Ellipses already kept only their own keys. | Extra keys in rect and polygon `data` are dropped, as for ellipses. The card never sends them. A new test fails on the old code and passes now. |

### Commit accounting

The 129 commits in `pre-audit-2026-10-10..ca4d56e`:
- 99 cluster commits (above)
- 5 flag commits: c7460cb, 01d4487, 5d4531d, 4f87e36, 03ceb9e
- 4 feature commits: e3a74ad, 7f91130, ff16ae7 and the merge 73c6da5
- 4 audit/deps commits: 95739c5, 73bfb45, 483f561, 8f64026
- 5 lane merges: 55311a3, f8544f9, 2464b61, 7702dfb, 5ddf890
- the integration bundle rebuild 87d847f and the deps merge a316b03
- 5 repair commits
- 3 post-integration commits (5 counting cdd64a5 and 711f65b, which came after this accounting)
- 2 commits from before the lanes: 7df6a6f (ARCHITECTURE.md) and 7a5845f (test against HA 2026.10.0, which also cleared the pip-audit advisories)

## Decisions made without you

**Scope, order and branches**
- **Feature first, then fixes.** The plan was first to merge auto-calibrate after the fix phase. That changed: the feature was merged first (73c6da5) and the lanes branched from it, so fixes were written against the final code instead of facing a large conflicting merge at the end.
- **Feature in a separate worktree** (`feature/auto-calibrate` from 7a5845f), built while verification was still running, so the two did not block each other.
- **Push and draft PR.** `review/full-audit` was pushed at the main milestones (7a5845f after the baseline, 73c6da5 after the feature merge, e76b424 after integration, repair and the deps merge, and ca4d56e), and draft PR #7 was opened so that CI ran on each push. Nothing was merged into `main` during the run; PR #7 was merged afterward (see the top of this file).
- **Wiki PR targets `dev`.** It is a public wiki in a different repository, and maintainers publish `dev` to `main`. The branch was built from `dev` and follows STYLE_GUIDE.md. It was left unmerged during the run, and was merged into `dev` and published afterward (see the top of this file).

**How the lanes worked**
- **Five parallel lanes, one agent and one commit per cluster.** The full suite had to pass before each commit. An agent that could not get the suite green would discard its change and report "reverted" (this never happened).
- **Bundle policy.** Lane commits never include `www/`, because the single minified files would conflict across lanes. One rebuild commit followed the integration (87d847f, and 971bbde after repair). As a result, reverting a single frontend source commit on its own needs a bundle rebuild. The zone-map bundle also keeps `card.ts` comments, so even a comment edit there changes it.
- **README.md and ARCHITECTURE.md were off limits to lanes.** Agents wrote what the docs must say into per-lane notes, and one docs pass applies them after integration. ARCHITECTURE.md's Known limitations were trimmed early to items not planned for fixing.
- **Flag-only clusters change no code.** Each lane added one commit of `TODO(REVIEW_REPORT.md Xnn)` comments. ruff `select=ALL` flags every TODO, so the first line of each Python marker ends with `# noqa: FIX002, TD003` instead of adding a project-wide ignore.
- **D02, D03 and D05** were not assigned to any lane when the lanes started. Once the policy reviewer caught this, D05 and the non-README half of D02 were committed in repair, and D03 and the README half of D02 went to the docs pass.

**Dependencies and environment**
- **hacs.json minimum kept at 2026.8.1** while the test pins moved to HA 2026.10.0 (7a5845f). Nothing needs a newer release, and raising the floor would only lock users out. CI does not test the floor (see next steps).
- **npm audit fix applied, and test-only tools upgraded only if the suite stayed green.** The first plan kept vite at 5.x, because a vite major could change the minified bundles in ways tests cannot prove harmless. That plan was reversed only after two vite 6.4.4 builds produced md5-identical bundles. The upgrade took vite 6.4, the lowest version vitest 5 accepts, and leaves vite 8 as a follow-up.
- **Not upgraded:** TypeScript 5.9 to 7 (a major, likely to surface new type errors) and terser 5.48 to 5.51 (it would change the minified output). Both are listed under next steps.
- **audit/deps merged after the lane integration** (a316b03, on top of repair), because its package-lock.json changes overlap V01's lockfile-root fix in fe-a (c04fee8). Its vitest 5 check had run on the pre-lane code, which is why T13's `?raw` import broke afterward (see Attempted and reverted).
- **Environment.** uv was missing on this Mac. It was installed into the user site with `pip install --user uv`, and Python 3.14.8 was installed with `uv python install`. `~/.npm/_cacache` has a folder with an EACCES owner, so npm ran with a cache in the session scratchpad instead of changing your home configuration.

**Auto-calibrate**
- **Design picked by the judges:** a backend calibration service with snapshot undo, so a run survives closing the browser and can be called from automations. Nothing writes without a button press or a service call, and nothing runs on install or startup.
- **Version 2.1.3 to 2.2.0** in manifest.json, package.json and index.ts. The `?v=` cache buster is the only thing that makes browsers fetch rebuilt bundles. Without it, the strategy would reference a card element that cached bundles do not define. V01 then synced pyproject.toml and the lockfile root to 2.2.0.
- **store.py untouched by the feature.** The implementation brief mentioned a store.py allow-list change, but spec 3.1 says snapshots live in their own file (`apollo_mmwave.calibration`) so that a downgrade cannot drop them. The spec won.
- **Choices the spec did not cover:**
  - a new `no_gate_data` error code instead of reusing `no_energy_data`, whose message would be wrong;
  - the threshold arithmetic lives in a separate `calibration_math.py`;
  - a restore that changes nothing takes no redo snapshot;
  - the chart's turn-on button lets HA show its own error toast, because the chart has nowhere else to show one;
  - the spec's exact interrupted-banner text was kept, even after a reload;
  - 31 `SPEC NOTE:` comments mark places where the spec was unclear and the conservative choice was taken;
  - spec follow-ups F1 to F11 (for example live peak markers, a walk test and an older-snapshot picker) were left out;
  - CI tests only HA 2026.10.0, documented per addendum item 8 rather than adding a test matrix.
- **The factory-threshold table was left unconfirmed (X60).** The values match the commonly published HLK defaults, but the HLK-LD2410B datasheet in the MSR-2 repository does not list default sensitivities. The table only decides whether the card shows its "these look like factory thresholds" hint, so the values stay as they are, with a TODO. Hardware testing on 2026-10-12 later confirmed them: a real MSR-1 read back exactly this table (X60, done in 2.2.3).
- **The walk-test copy fix (e76b424).** The wiki's first-time-reader review found that the card's post-calibration line contradicted how Radar Target works. The product copy was corrected instead of explaining the old line in the wiki, and the wiki now quotes the new line (0b782fbf).

**Wiki**
- **Help-card links stay on the old pages until the wiki is live (X61).** `profiles.ts` still links to `products/msr2/setup/zones-ha/` and `products/rpro1/setup/zones-ha/#ld2412-configuration`, because the new guide would 404 until it is published. Done in 2.2.3: both now link to the new tuning guide.
- **The MTR-1 tip uses a site-absolute `.md` link,** against the style guide's relative-link rule. The page is included at three folder depths, and only that form resolves on all of them. The repo already uses it in 102 places.
- **Left for you:** the Homey copy of the MTR-1 page now shows the Home Assistant tip, because it includes that page.
- **Navigation:** each new page appears once under General > Radar Tuning, and the product sections get link entries, so the sidebar does not jump between products.

**Credit for Brandon Harvey**
- Added at your request on `audit/deps` (8f64026). The name and handle were confirmed through the GitHub API, and the entry links to https://github.com/bharvey88. The wording sticks to what is known: Brandon started the project and published the original repository this one continues. The docs pass was told to keep the entry exactly as it is.

**Choices fix agents made inside clusters** (conservative unless noted)
- **B01:** a huge finite rotation such as 1e20 still clamps to 180 instead of being ignored. `zone_id: 0` is now refused, because two copies of one bound disagreed (the schema said min 0; services.yaml and the card said min 1). That breaks any hand-made zone 0, and the workaround is to edit `.storage/apollo_mmwave.zones` with HA stopped.
- **B05:** a malformed v2 store file is overwritten on setup, as the cluster specified. A verifier's alternative was to refuse to load and keep the file for manual repair.
- **B06:** ties between labels now resolve first-wins in both lookups, and no extra duplicate-label warning was added.
- **C01:** a static test was added to guard the devcontainer image, although the cluster asked for no test, because Dependabot never bumps that image.
- **C04:** ignoring pytest-homeassistant-custom-component in Dependabot reverses the expectation in PR #4. It also stops security-update PRs for the two test pins (alerts still show).
- **C05:** `actions/setup-node` is pinned to v7.1.0 by commit SHA. No `.nvmrc` or `engines` field was added.
- **E02:** the bare "R-PRO" in four picker descriptions was also changed to "R PRO" (revert those four strings if only "R-PRO-1" was meant).
- **F15:** polygon mode is not exempt from the outside-click cancel (finding 99 was followed over finding 268).
- **F18:** where the two verifiers disagreed, the agent kept the shape in progress instead of canceling it.
- **F23:** the multi-touch guard counts every finger on the screen, so a thumb resting elsewhere blocks canvas drawing. Changing that needs a product decision.
- **F25:** an extra guard sends a name-only save when the zone has local geometry not yet saved, so Save cannot wipe a newly drawn shape.
- **F26:** only edited inputs survive a payload, so a focused but unedited field still takes another client's rename.
- **F27:** an unusable `unit_label_size` now resets to 18, as on a fresh card.
- **Q02:** two checks beyond the cluster text keep the old re-render guarantees.
- **Q17:** stored rotation strings are not coerced, as the verifier advised.
- **Integrator and Q10:** both amended only their own unpushed commit messages (see below).

## Flagged and left alone

These 61 items were flagged rather than fixed; X10 was later fixed (711f65b), X54, X56, X57, X60 and X61 have been done since, and all of them are kept here for traceability. They touch tuning values, would change intended behavior, or need a product decision. 54 of the 55 open items have a `TODO(REVIEW_REPORT.md Xnn)` comment at their code site, 63 comments in all (`www/` left out). That includes X05, X24, X38 and X39, which are resolved by documentation but keep their markers because their code is unchanged. X55 (a binary image) is the one open item with no marker, by design. X56 (the untracked local venv) and X57 (ARCHITECTURE.md, which lanes could not edit), both done since, never had one. Up to 2.2.2, four markers also shipped inside each built bundle, because Vite 6 kept those comments: X24, X32 and X61 (twice) in the tuning bundle, and X24, X42 and X61 (twice) in the zone-map bundle. Since 2.2.3 terser strips them, and the X61 markers are gone.

### Tuning-parameter items

A finder marked these as touching a tuning parameter, or the work list names a tuning value or limit for them.

| ID | Site | Issue | Recommendation |
|---|---|---|---|
| X02 (tuning) | `charts/distance-chart.ts` `distInUnit` | A distance entity with no unit, or with km, mi or nmi, is drawn in the chart unit without conversion. Shipped Apollo firmware always reports cm. | If hardening, pass "cm" as the fallback, optionally add km, mi and nmi, and test the unit-less and unknown-unit cases. |
| X04 (tuning) | `zone-map/card.ts` `LENGTH_UNITS`; `const.py` `INPUT_UNIT_FACTORS` | The card has no yd, so `input_units: yd` silently becomes mm. The card's YAML unit also overwrites the store's unit on every save, and the payload value is never read. | Decide who owns `input_units`. If the card does, add yd (914.4) and its aliases, plus a test that the card's units equal `INPUT_UNIT_FACTORS`. Otherwise use the store's unit when the YAML sets none. Do not remove yd from the backend. |
| X11 (tuning) | `__init__.py` `_normalize_polygon` (the `POLYGON_MAX_POINTS` slice) | The list is cut to 32 points before malformed points are filtered, so junk uses up slots and later valid vertices are lost. | Filter first, then slice (the same result for clean input), base the truncation warning on the valid count, and keep the limit at 32. |
| X19 (tuning) | `services.yaml` `update_zone.zone_id` selector; `zone-map/card.ts` `_handleAddZone` | The maximum of 32 exists only in the UI selector. The schema allows 1 to 2**53-1, and Add Zone has no cap. | Decide. Either no cap (drop max 32 and use a box input), or a `MAX_ZONE_ID` in const.py enforced in the schema, services.yaml and Add Zone, with a test and a plan for stored ids above it. |
| X22 (tuning) | `charts/geometry.ts` `parseGateSizeMeters` | "0m" parses to 0 and collapses the axis. No real select state does this. | If hardening, add only a value > 0 guard with tests. Keep the loose number match and `DEFAULT_GATE_SIZE_M` 0.75. |
| X23 (tuning) | `entities.ts` `GATE_PATTERNS` | The gate index capture is unbounded, so a misnamed `_g42_` entity creates a 43-slot array and rescales both charts. Apollo firmware cannot produce this. | No change. A bound would be a tuning decision. |
| X26 (tuning) | `store.py` `_merge_location` | v1 entities and `rotation_deg` are copied without validation, unlike every other import path. | If parity is wanted, add type checks only (string ids, `round(float())` for rotation), without the [-180, 180] clamp, which is a tuning bound. |
| X36 (tuning) | `strategy-core.ts` `deviceView` | No `max_columns` is set, so an R PRO-1's five sections exceed HA's default of 4 and the Zone Map wraps to a second row. | Product choice: `max_columns: 5`, a `column_span`, or accept the wrap. |
| X39 (tuning) | `zone-map/card.ts` `setupCanvas` | The canvas has a fixed 800 x 800 backing store with no devicePixelRatio scaling (blurry on HiDPI screens), and a non-square grid is drawn stretched. | DPR sizing would also have to scale `GRID_MIN_SPACING_PX`, the label thresholds and the marker sizes. Document the stretch in the README card options. **Resolved by documentation:** docs/configuration.md:428-431 (Card options) says a `grid` with unequal X and Y spans is drawn stretched and to give both the same span. The HiDPI blur is unchanged. |
| X42 (tuning) | `zone-map/card.ts` `getStubConfig` | Cards added from the picker draw -6000..6000 by 0..12000 mm with `unit_display` false, while strategy cards use `DEFAULT_GRID` (-5000..5000 by 0..10000, `unit_display` true). | Pick one and derive the stub from `DEFAULT_GRID` and `DEFAULT_CONE`, or drop `grid` from the stub, with a test. |
| X45 (tuning) | `zone-map/card.ts` `_getConeRingsRenderState` | Cone rings are built out to `cone.y_max`, which has no ceiling, even past the visible grid. Only a hand-edited `y_max` is affected. | If touched, stop at the farthest grid corner (no visible change). Do not clamp `y_max`. |
| X59 (tuning) | `binary_sensor.py` `_LINE_INTERSECTION_EPSILON` | The `or epsilon` fallback in `_point_in_polygon` can never run, because the crossing guard already excludes y1 == y2. | Removing the fallback and the constant changes no output. Do it together with the polygon tests, if whoever owns the tuning table agrees. |
| X60 (tuning) | `profiles.ts` `LD2410_FACTORY_THRESHOLDS` doc block | The table (move 50,50,40,30,20,15,15,15,15; still 0,0,40,40,30,30,20,20,20) matches the commonly published HLK defaults but was not confirmed on hardware. It only decides whether the calibrate card shows its factory-thresholds hint. The doc block says "from the manual", but the repo's HLK-LD2410B manual does not list these values. | **Done in 2.2.3:** a real MSR-1 read back exactly this table during hardware testing on 2026-10-12. The doc block no longer says "from the manual", and the TODO comment is gone. |

### Other flagged items

| ID | Site | Issue | Recommendation |
|---|---|---|---|
| X01 | `__init__.py` `handle_update_zone` (geometry path, before `_update_registry_names`) | A name sent with the call that creates a zone is stored, but the registry rename runs before the entities exist, so the friendly name stays "<radar> Zone N". | Limit any fix to the creating call: a one-shot pending name consumed in `ZoneEntityMixin.async_added_to_hass`. Decide first what the card's default "Zone N" should write, and never apply the stored name on every add. Also correct the comment in `_handleAddZone`. |
| X03 | `frontend.py` `async_remove_dashboard` | With auto-create off, every setup and reload deletes the storage dashboard on url path `apollo-mmwave` when its config is our strategy, even a hand-built one. The docstrings say otherwise. | Maintainer decision. Either keep the reconciliation, fix the docstrings and tell users to give a hand-built dashboard another path, or remove the dashboard only from the options listener and on entry removal. Longer term, record ownership by item id. **Documented:** docs/configuration.md:332-335 tells users to give a hand-built strategy dashboard a URL other than `apollo-mmwave`. The docstrings and the code are unchanged. |
| X05 | `.pre-commit-config.yaml` | The hooks use `language: system`, so committing without `.venv` active fails with "Executable ruff not found" or runs an unpinned ruff. CI is unaffected. | Switch to astral-sh/ruff-pre-commit at v0.16.10, or point the entry at `.venv/bin/ruff`, or document in CONTRIBUTING.md that commits need `.venv` active. **Resolved by documentation:** CONTRIBUTING.md:34-36 says to commit from a shell with the venv active and names both failures. The hooks are unchanged. |
| X06 | `zone-map/card.ts` lock button handler | The lock only blocks drawing. Chip double-click clear, Clear All, Undo, Delete, Add, rename and rotation still write while the card says Locked, and the toast says "Unlock the grid to edit zones." | Gate the two one-gesture clears with a throttled toast and a disabled state, leaving Undo ungated. Or reword the toast to "Unlock the grid to draw zones." |
| X07 | `ld2450.py` `_registry_updated`; `binary_sensor.py` `_track_coordinate_entities` | Renaming a sensor listed in `STORE_ENTITIES` leaves the dead id in the store and the payload, and presence reads off with no log. | On an update with a different `old_entity_id`, rewrite exact matches in every `STORE_ENTITIES` list (before the B08 target filter), then save and signal, with a regression test. At minimum, warn once per configured pair that has no registry entry. |
| X08 | `__init__.py` `_device_id_from_call` (registry refusal) | Zones stored under a device id that left the registry for good can never be deleted, and their device-less entities come back with warnings on every setup. | Accept `delete: true` only for an id that is in the store but not in the registry, without minting an entry. Do not prune on device removal, because re-adding the same MAC within 30 days restores the id. |
| X09 | `binary_sensor.py` `_evaluate_and_write` | When every tracked coordinate is unavailable (radar offline), zone presence writes off instead of unavailable. | Mark the entity unavailable when the pair list is non-empty and every tracked id with a state is unavailable, with a test and a changelog note. **Documented:** docs/configuration.md:294-296 (Zones in automations) says presence reads `off` while the radar is offline and to check the radar's own availability. |
| X10 | `__init__.py` `_normalize_rect` and `_normalize_polygon` | Extra keys in `data` are stored, sent in payloads and recorded as attributes, while the ellipse path drops them. The backend reviewer showed that an extra key such as `{"note": 10**20}` still makes every later zone-store write fail for every radar, which is the failure B01 exists to prevent. | **Fixed in 711f65b** after the review: rects keep only the four bounds and polygons only `points`, with `test_extra_data_keys_are_dropped`. |
| X12 | `__init__.py` `_resolve_target_device` | When both `device_id` and `location` are given, `location` is ignored with no deprecation warning. The schema comment "Exactly one of the two" is wrong, because the schema requires at least one. | Log the once-per-run deprecation warning whenever `location` is present, plus a debug line, and correct the comment. Do not make the keys exclusive. |
| X13 | `binary_sensor.py` `_coerce_float` | This copy of `__init__._coerce_float` has drifted: it has no finite or size guard and no OverflowError catch. | Share one helper from a new module that both can import. Keep the presence tester's own shape validation. |
| X14 | `__init__.py` `_coerce_zone_name` | A blank or whitespace name is stored and writes the bare "Zone 1" as an explicit registry name instead of clearing it. | Strip the name and treat blank as a clear (registry name None when generated). services.yaml documents today's result and must change with the fix. |
| X15 | `__init__.py` `handle_update_zone` (delete branch) | `delete: true` for a zone that does not exist mints an empty entry, saves, signals and fires `apollo_mmwave_zone_updated` with no warning. | Warn and return when `delete` names a missing zone and the call carries nothing else. Card calls always carry `input_units`, so they still count. |
| X16 | `__init__.py` `_device_id_for_label` | Labels that slugify alike resolve to the first stored device without a log, and punctuation-only values match each other through HA's "unknown" slug. | Try an exact match first, then a unique slug match, else warn. Treat "unknown" as no match. This is of little value if `location` is removed next release. |
| X17 | `__init__.py` `_coerce_float` | Booleans and YAML on/off/yes/no become 1 or 0 for bounds, rotation and zone_id, the same as HA's `cv.positive_int`. | If that is unwanted, refuse bool in both copies and add bool-refusing validators, with a test. |
| X18 | `config_flow.py` `async_step_user` | Single instance is enforced in code, not by the manifest's `single_config_entry`. | Optional: add `"single_config_entry": true`. The abort reason becomes `single_instance_allowed`, so update `test_single_instance`, and keep the unique-id stamp. |
| X20 | `cards/distance-card.ts` and `cards/gate-energy-card.ts` `render` | A device that resolves but has no gate entities renders nothing, so the card is invisible. | Render a note, "No gate radar (LD2410/LD2412) entities found for this device", with a test. |
| X21 | `charts/distance-chart.ts` `distanceModel` and `renderDistanceChart` | Inverted zone bounds draw a 1 px rect and a stray circle. An offline device shows "0.0" bars on the default axis. Tick labels mix precision. The max and zone rows vanish when unavailable, which shrinks the SVG. | Add an invalid-zone marker, an unavailable flag with "n/a" rows, and fixed decimals per unit, and keep the rows with a dash placeholder. |
| X24 | `profiles.ts` `LD2410_PROFILE.entityMap` | The base-name map uses the MSR-2 spellings for Bluetooth and gate size, so a `device_base_name`-only card on an MSR-1 hides both and falls back to 0.75 m. | Use the MSR-1 ids in the fallback when they exist, or document that MSR-1 users should set `device_id`. **Resolved by documentation:** docs/configuration.md:406-408 (Card options) says a base name builds MSR-2 ids and to set `device_id` on an MSR-1. |
| X25 | `store.py` `resolve_device_id` | Two devices whose names slugify alike resolve by registry order with no log, on every setup. | At least log a WARNING naming the candidates. Refusing to pick is a product decision. |
| X27 | `websocket.py` `_payload` (label field) | `label` is written only by migration, goes stale after a rename and is missing for devices that never ran a 1.x version, yet the card uses it as its heading. | Send the registry name (`name_by_user` or `name`) with the label as a fallback. Update the tests and the "display only" comments. |
| X28 | `frontend.py` `async_register_frontend_assets` | The once-per-run flag also skips the Lovelace resource reconciliation, so a deleted resource row comes back only after a restart, not a reload. | Keep the static paths once per run, but reconcile the resources on every setup, with a test. **Documented:** docs/configuration.md:26-27 (Lovelace resources) and :458-459 (Troubleshooting) say a deleted row comes back at the next restart, not on a reload. 2.2.5 recreates the rows on setup only after the entry was removed and added again in the same run. |
| X29 | `migration.py` `async_migrate_unique_ids` | The "could not be migrated ... can be deleted" WARNING repeats on every setup and reload until the stale entity is deleted. | Raise a repairs issue keyed by the stale entity id, or comment that the repetition is deliberate. |
| X30 | `strategy.ts` view and section strategy `generate` | Both render nothing, with no message, when no device is found. | Add a hint card to the view strategy. Keep the section strategy blank, because a test pins that. **Documented:** docs/configuration.md:364-366 says both strategies show nothing, with no message, when nothing matches. |
| X31 | `strategy.ts` `shouldRegenerate` | Liveness is part of the regeneration key, so any radar going online or offline rebuilds every tab and drops an unfinished zone drawing on any tab. | Regenerate on a liveness change only when it changes the set of rendered devices, or debounce it, with a flapping test. |
| X32 | `strategy.ts` `EMPTY_VIEW.title` | "Apollo Radar Tuning" appears only in the zero-device state, under the "Apollo mmWave" sidebar entry. | If unifying, use "Apollo mmWave" for `EMPTY_VIEW`, `STALE_SELECTION_VIEW` and the dashboard title, with a test. |
| X33 | `strategy-core.ts` `generateViews` (path dedup) | The bare view path goes to whichever same-base device `hass.devices` lists first. | Sort the colliding devices by id, or suffix all of them, with a test that paths do not depend on order. |
| X34 | `strategy-core.ts` `strategyDevices` | A hand-written `devices: "id"` string throws, and HA shows an error card. | Optionally turn a string into a one-item list, with a test. |
| X35 | `strategy-core.ts` `cardMap` | Chart cards are emitted for offline or unresolvable devices. This is deliberate, per `OFFLINE_NOTE`. | At most, drop `device_base_name` when it equals the device id. |
| X37 | `strategy-core.ts` `hasLiveRadarEvidence` | The liveness slot list leaves out Bluetooth and gate size, so a device with no registry model whose only live entities are those two is dropped. | Build the list from the resolved entity ids minus the chip-agnostic buttons, keeping the ghost-device tests green. |
| X38 | `strategy-core.ts` `generateSections` | The view strategy runs several devices' sections together with no separator. | Document the view strategy as single-device, or add a full-width heading per device when more than one renders. **Resolved by documentation:** docs/configuration.md:351-353 (View strategy) says the sections run together with no separator and to set `device_id` for one device per view. |
| X40 | `zone-map/card.ts` `_attachGlobalListeners` | `render()` wires window and document listeners on a card that is not attached yet. The handlers do nothing but keep the card in memory. | Attach the listeners and the subscription only while the card is connected, and update the tests that rely on detached cards. |
| X41 | `zone-map/card.ts` `buildTrackedEntities` | `direct_entity` YAML target pairs are only a placeholder that the first store payload overwrites. | Retire the key deliberately (a release note, coordinated with zone-mapper-card) or document it. |
| X43 | `zone-map/card.ts` `_clearAllZones` | Clear All, and Undo of a first drawing, write `shape: none` for YAML-seeded ids the store never held, which creates entities for them. | Clear only ids in `this.zones` or in the payload. Do not send `delete` from Undo, because it races with Add Zone. |
| X44 | `zone-map/card.ts` `finishPolygon` | Finishing with fewer than 3 distinct points, or with no zone selected, cancels without a message. | Show a toast ("A polygon needs at least 3 points", "Select a zone first"), optionally keep the vertices, and add a test. **Documented:** docs/configuration.md:266-267 (Drawing zones) says a polygon needs at least 3 distinct corners. The card still gives no message. |
| X46 | `zone-map/card.ts` canvas touch listeners | A locked canvas still calls `preventDefault` on every touch, so on a phone the page cannot be scrolled past the map. | While locked, skip `preventDefault` and set `touch-action: pan-y`, with a test and a check on a real phone. |
| X47 | `zone-map/card.ts` `render` | With a cached payload, the chips, manager, status and grid are drawn twice per config change or theme flip. The cost is negligible. | Skipping the first pass would change which zone is selected after a same-device config change, so decide that first. |
| X48 | `zone-map/api.ts` `subscribeZones` | HA can silently refuse the re-subscribe that the websocket library sends after a reconnect, leaving the card on stale zones. | Design it together with F14: subscribe with `resubscribe: false` plus a "ready" listener that reopens the subscription, with a fake-connection test. |
| X49 | `zone-map/editor.ts` device picker handler | The picker's `value-changed` event is not stopped, unlike the two `ha-selector` handlers. | If symmetry is wanted, add `stopPropagation` with a test, and reword the selector comment to say those stops are defensive. |
| X50 | `cards/distance-card.ts` `render` (unit fallback) | An invalid `distance_unit` ("CM", "feet") silently falls back to HA's default, and a test pins that fallback. | Throw in `setConfig` (the HA convention) or warn once, document the six valid tokens, and do not fold case silently. **Documented:** docs/configuration.md:393 (Strategy options) lists the six units and says any other value is ignored without a warning. |
| X51 | `index.ts` module top | An eslint directive does nothing, because no linter is installed or run. | Adopt eslint and typescript-eslint with a CI step, or replace the directive with a plain comment. |
| X52 | `websocket.py` zone get and subscribe schemas | `device_id: ""` passes the schema and is answered `not_found`. | Keep it as is. Optionally pin the current contract with tests. |
| X53 | `websocket.py` `_payload` (suggested entities) | Each subscriber re-resolves the target pairs on every `SIGNAL_ZONES_UPDATED`, about 66 microseconds per resolve. | Low priority, since B08 removed the duplicate signals. Leave it unless profiling shows a cost. |
| X54 | `.github/workflows/validate.yml` (`ignore: brands`) | The HACS brands check is turned off, and the integration ships no brand images, so HA shows a placeholder icon. The `Main` push-branch filter is dead. | **Done in 2.2.1:** `brand/icon.png` and `brand/icon@2x.png` ship as HA 2026.3+ local brand images (`tests/test_brand.py`), and `validate.yml` no longer ignores the brands check or lists `Main`. No logo or dark variants yet. |
| X55 | `images/hero.png` (no marker: binary file) | A 708 KB upstream zone_mapper banner showing the pre-2.0 card. Nothing references it, and HACS does not ship it. | Delete it, or replace it with a current screenshot before any README uses it. |
| X56 | local `.venv` against the requirements pins (no marker: untracked) | `.venv` still has HA 2026.8.1, pytest-homeassistant-custom-component 0.13.355 and frontend 20260930.2, while the repo pins 2026.10.0, 0.13.371 and 20260930.3. Local runs, including this audit's, therefore tested 2026.8.1. | **Done** after the docs pass: `.venv` re-synced to 2026.10.0, 0.13.371 and 20260930.3; 490 passed. Keep it in step whenever the pins move. |
| X57 | ARCHITECTURE.md Known limitations intro (no marker: docs were off limits to lanes) | It pointed at REVIEW_REPORT.md before that file existed. | Resolved by this file. `test -f REVIEW_REPORT.md` should pass before merge. |
| X58 | `zone_entities.py` module docstring and `_sync_entities` | Four items that were never verified: a disabled entity is constructed on every signal before being skipped; an add that raises inside HA is never retried; the removal nudge fires before HA frees the old state, so a retry could get a `_2` entity id; the docstring describes a race the pinned HA cannot produce. | Verify these four before changing anything. B09 fixed only the disabled-device pending leak, and T09 now covers the refused-add retry. |
| X61 | `profiles.ts` `LD2410_PROFILE.wikiUrl` and `LD2412_PROFILE.wikiUrl` | The help card's tuning links still point at the older zones-ha wiki pages. | **Done in 2.2.3:** the LD2410 profile links to `products/general/setup/apollo-mmwave-dashboard/` and the LD2412 profile to the R PRO-1 copy, `products/rpro1/setup/apollo-mmwave-dashboard/#r-pro-1-and-its-ld2412-radar`, `test/strategy-core.test.ts` pins both, and the two TODO comments are gone. |

## Attempted and reverted

- **No cluster was reverted.** The revert rule (discard the change and report it when the full suite cannot pass) never triggered. 99 of the 100 lane clusters were committed.
- **E03 needed no change.** It asked for em dashes and the "R-PRO-1" display spelling to be removed from zone-map card text. A search of `zone-map/` found neither at 73c6da5 or later, and `git log -S` shows neither was ever added there. The one em dash left in the zone-map bundle comes from a comment in a shared frontend module, not from `zone-map/`.
- **The vitest 5 attempt was blocked by its vite peer requirement.** On `audit/deps`, `npm install -D vitest@5.0.3 happy-dom@20.14.6` failed with ERESOLVE: vitest 5.0.3 needs vite ^6.4.0, ^7.0.0 or ^8.0.0 as a peer, and the project had vite 5.4.21. The package files were reset, and happy-dom 20 was taken on its own (73bfb45). Then vite ^6.4 and vitest 5.0.3 were installed together (483f561), which was accepted only after two builds proved the bundles md5-identical.
- **A follow-on problem after the deps merge.** That vitest 5 check ran on the code from before the lanes, so it could not see T13's new `?raw` import of `config_flow.py`. After a316b03, vite 6's `server.fs` rule refused the import and only 718 of 737 tests ran. It was fixed forward in b9b88b9, not reverted.
- **Integration amendments.** The integrator amended two of its own unpushed commit messages, with the content unchanged:
  - The be-b merge message still had git's `# Conflicts:` lines and a buried trailer.
  - The first bundle-commit message wrongly said a be-a TODO comment had reached the bundle.

  The Q10 agent likewise amended its own unpushed commit message to drop a wrong claim that every exit path was tested. Repair reported no reverts.
- **The feature's final verifier reverted one bad edit before the feature was committed.** A search-and-replace version bump had changed two unrelated lockfile entries (`check-error` and `ms`) to 2.2.0, and they were put back to 2.1.3.
- **The cross-lane stash swap was undone before any commit** (see Process). Neither lane committed the other's change.
- **Two launch mistakes changed nothing.**
  - The second verification launch passed a placeholder argument (`candidates: '__LOAD__'`) and failed with "candidates.map is not a function".
  - The third relied on argument precedence it did not have, left `candidates` undefined and failed the same way.

  Neither run started an agent, and the fourth launch did the verification.

## Recommended next steps

### High

1. **(Mostly done) Validate auto-calibration on real hardware.** Hardware testing on 2026-10-12 ran, on a real MSR-1: a full calibration with every written value read back, Undo back to the exact previous values, Redo, Preview, Stop, and an HA restart mid-run (nothing written, Radar Engineering Mode turned back off). On an MSR-2 whose thresholds were unknown it checked the refusal and Read settings from the radar, and on a real R PRO-1 an LD2412 Preview. The 15 s and 60 s defaults worked as designed. Still open: a writing calibration on an R PRO-1 LD2412, including the background-correction guard, with Undo back to its current values.
2. **(Done) Confirm the LD2410 factory-threshold table (X60).** A real MSR-1 read back exactly the table, and "from the manual" is gone (2.2.3).
3. **(Done) X10.** Fixed in 711f65b before the merge.
4. **Ship release notes for every user-visible change.** Most important is the `zone_id: 0` refusal and its workaround (edit `.storage/apollo_mmwave.zones` with HA stopped). Also cover B02's dropped events for no-op calls, `input_units` now surviving restarts, a malformed store file being replaced on setup, and the calibration feature. Done: CHANGELOG.md has an entry for each release from 2.2.0 to 2.2.3, including the `zone_id: 0` refusal.
5. **(Done) Merge.** PR #7 merged into `main` with a merge commit after CI passed; see its final comment for the post-merge check. Note that HACS installs from the default branch while the repository has no releases, so the merge makes 2.2.0 available to HACS users. Consider tagging a release once items 1 and 2 are done.
6. **Wiki.**
   - Done: [ApolloAutomation/docs#1150](https://github.com/ApolloAutomation/docs/pull/1150) merged into `dev` and was published through [ApolloAutomation/docs#1151](https://github.com/ApolloAutomation/docs/pull/1151). Each mmWave sensor has its own copy of both guides in its Radar Tuning or Zone Configuration section.
   - Done: screenshots and looping clips from a live install are in both guides.
   - Check the HA UI details the fixer could not confirm in a live install: the Take control dialog, no tab bar on a single-radar install, the Finish button, "+ N entities not shown", and the power icon.
   - Decide whether the Homey copy should show the MTR-1 tip.
   - Once the pages are published, switch the help-card links (X61) and rebuild the bundles. Done in 2.2.3.

### Medium

7. **Bring local testing in line with CI.** The local `.venv` is now on the pinned HA 2026.10.0 (X56). Add a CI job for the `hacs.json` floor (2026.8.1), which no job tests today. Rebuild the devcontainer and run `.venv/bin/hass --version` to finish C01's manual check, which is still pending (the static test only checks the image tag).
8. **Give the calibrate card F14's `unknown_command` retry.** `cards/calibrate-card.ts` and `calibration/api.ts` treat only `not_loaded` as retryable, so on a fresh boot the card falls into its generic error.
9. **Give the calibration store B11's live-store fix.** `async_remove_entry` removes the calibration store through a fresh instance, so after a failed unload, a finishing job can write `.storage/apollo_mmwave.calibration` back.
10. **Turn the two remaining schema crashes into validation errors.** `zone_id: .inf` and a huge integer `rotation_deg` still raise OverflowError instead of `vol.Invalid`.
11. **Decide the flagged behavior items with user impact.** X07 (configured pairs do not follow renames), X09 (presence reads off while the radar is offline), X08 (zones of a removed radar cannot be deleted), X03 (auto-create off deletes a hand-built dashboard), X28, X48, X01, X04, and X06 with X46 (lock semantics and touch scrolling).
12. **Fix two drawing bugs the fix agents reported but left out of scope.** F24: when a payload removes the selected zone mid-drag and other zones remain, the card selects the first remaining zone, so the drag commits to a different zone than the one the user started on. F21 and F23: in ellipse mode a click or tap still saves a 1 mm radius ellipse (the `Math.max(1, ...)` floor).
13. **Add brand images for HACS and HA (X54).** Done in 2.2.1: the icons ship in `brand/`, and `ignore: brands` is gone.
14. **Upgrade the remaining frontend tools.** Done in 2.2.3: TypeScript 7.0 type checks the project with no new errors, and terser 5.51 and Vite 8.3 build the bundles. Unlike Vite 6, Vite 8 runs terser on ES library output, so the bundles are now minified.
15. **Reword or retarget the `TODO(REVIEW_REPORT.md ...)` comments that ship inside the bundles** (X24, X32, X42 and X61). The X61 one tells users a wiki page returns 404. Done in 2.2.3: the X61 comments are gone, and terser now strips the other comments from the bundles, so none of them ships.

### Low

16. **Reviewer notes.**
    - Restore the defensive `config ?? {}` in `shouldRegenerate`.
    - Give the zone-map card the same once-per-type card-picker guard as the other cards.
    - Optionally stop the F20 cone flash before the first payload.
17. **Test gaps.**
    - Test each B09 unloading guard on its own.
    - Fix the presence half of the Q07 test, which passes for the wrong reason.
    - Cover the T09 removal nudge.
    - Add frontend coverage (vitest has none).
18. **Small tidy-ups.**
    - Make `store._record_location` public, as Q09 did for `resolve_device_id`.
    - Remove the old em dashes left in comments and docstrings (45 lines in 17 files under `custom_components`, `tests` and `frontend-src` at ca4d56e), including the five that reach the bundles from `profiles.ts` and `entities.ts` comments.
    - Handle the remaining low flags: X05, X51, X55 and the strategy items X30 to X38.
19. **Documentation follow-ups.** Note the Windows caveat for `npm run watch` (C07). Propose the wiki conventions the fixer suggested for STYLE_GUIDE.md: bold for keyboard keys, nav link entries for shared pages, and the absolute link form for included pages.

## Final build and test results

The baseline was run on origin/main at 49e8225 (Python 3.14.8, pytest-homeassistant-custom-component 0.13.355, HA 2026.8.1). The final verification ran at 971bbde, before the deps merge. The last column was re-run for this report at ca4d56e, on vite 6.4.4 and vitest 5.0.3, Node 22.16.0, with the local `.venv` (HA 2026.8.1).

| Command | Baseline (49e8225) | Final verification (971bbde) | Re-run (ca4d56e) |
|---|---|---|---|
| `ruff format . --check` | 26 files already formatted | 41 files already formatted | 41 files already formatted |
| `ruff check .` | All checks passed | All checks passed | All checks passed |
| `python -m pytest tests/ -q -p no:cacheprovider` | 107 passed in 3.97s | 488 passed in 20.49s | 488 passed in 20.03s (490 after 711f65b, on HA 2026.10.0) |
| `npx tsc --noEmit` (frontend-src) | clean | clean | clean |
| `npx vitest run` (frontend-src) | 20 files, 208 tests passed | 27 files, 737 tests passed | 27 files, 737 tests passed |
| `npm run build`, then `git status --short custom_components/apollo_mmwave/www` | empty (in sync) | empty (in sync) | built into a scratch folder with `npx vite build --outDir <scratch>` and `npx vite build --config vite.zone-map.config.ts --outDir <scratch>`: both files sha256-identical to the committed ones (142,336 and 114,821 bytes) |
| `npm audit` (frontend-src) | 10 vulnerabilities (3 critical, 4 high, 3 moderate) | not run (deps not merged yet) | found 0 vulnerabilities |

After the final verification, b9b88b9, e76b424 and ca4d56e kept vitest at 737 tests in 27 files and pytest at 488. Every baseline test still passes except seven that were deliberately renamed, replaced or removed along with the code they covered. pytest: `test_input_units_round_trip_through_the_store` became `test_service_stores_input_units` (B03, 3bde3f4). vitest: 'lists all seven panel keys' (Q12, 6934f7e) and 'constructs the three target pairs from a base' and 'hasLd2450 (base-name fallback) accepts the MTR-1 spelling' (F04, 07c6a9d) were deleted with the dead code they tested. 'returns one tick per gate, ending at the full width' went with gateTicks (Q14, 4208409). The register re-assert test was replaced by T15's polyfill-model cases (83afaaf). The zone-churn regeneration test was replaced by one on real R PRO-1 and MTR-1 zone entities (F05, 3a19762). CI failed the vitest job on 73c6da5 and on e76b424 (the date-dependent tests). On ca4d56e, all five CI jobs passed: Ruff, pytest (HA 2026.10.0), vitest + bundle sync, Hassfest and HACS.

CI on 1b66618, the last code and docs commit before this status update: all six checks passed (Ruff, pytest on HA 2026.10.0, vitest + bundle sync, Hassfest, HACS validation, CodeRabbit). The status-only commit that follows changes this file alone and was merged after its own CI passed.

Post-merge verification on main: recorded as the final comment on PR #7.
