import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  INITIAL_LOCAL_STATE,
  KEEP_ON_LD2410,
  KEEP_ON_LD2412,
  NOTHING_TO_RESTORE,
  canStart,
  canStop,
  cancelledLine,
  durationText,
  failureLine,
  footerLine,
  formatTime,
  idleSentence,
  isFactoryThresholds,
  livePeaksLine,
  missingLine,
  nextLocalState,
  offersUndo,
  phaseHeadline,
  phaseLabel,
  progress,
  restoreSource,
  restoreSummaryLines,
  restoredLine,
  resultHeading,
  resultRows,
  showsResultView,
  summaryLine,
  undoLabel,
  unusedFootnote,
  warningLines,
} from "../src/calibration/model";
import type {
  CalibrationPayload,
  CalibrationResult,
  ChannelResult,
  GateResult,
  JobState,
  SnapshotSummary,
} from "../src/calibration/api";
import { LD2410_FACTORY_THRESHOLDS } from "../src/profiles";
import { entityMapFromBaseName } from "../src/entities";
import type { HomeAssistant } from "../src/types";

// Fixtures are stamped 2026-10-11 and formatTime adds the date to any time that
// is not today, so freeze today on the fixtures' day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function job(overrides: Partial<JobState> = {}): JobState {
  return {
    job_id: "job1",
    kind: "calibrate",
    status: "sampling",
    sub_phase: null,
    started_at: "2026-10-11T14:30:00+00:00",
    elapsed_s: 18,
    remaining_s: 42,
    duration_s: 60,
    settle_s: 15,
    samples: 18,
    peaks: { move: { "0": 14, "1": 9, "2": 22 }, still: { "0": 97, "1": 95 } },
    writes_done: 0,
    writes_total: 0,
    apply: true,
    cancel_requested: false,
    engineering_mode_turned_on: true,
    ...overrides,
  };
}

function channel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    entity_id: "number.x",
    peak: 14,
    p95: 12,
    old: 50,
    new: 24,
    samples: 60,
    written: true,
    confirmed: true,
    actual: 24,
    flags: [],
    skipped: null,
    ...overrides,
  };
}

function gate(n: number, move: Partial<ChannelResult> = {}, still: Partial<ChannelResult> = {}): GateResult {
  return {
    gate: n,
    move: channel({ entity_id: `number.r_g${n}_move_threshold`, ...move }),
    still: channel({ entity_id: `number.r_g${n}_still_threshold`, ...still }),
  };
}

function result(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
  return {
    job_id: "job1",
    device_id: "dev1",
    kind: "calibrate",
    status: "done",
    outcome: "applied",
    snapshot_id: "snap1",
    started_at: "2026-10-11T14:30:00+00:00",
    finished_at: "2026-10-11T14:32:00+00:00",
    duration_s: 60,
    settle_s: 15,
    margin: 10,
    margin_pct: 25,
    kind_filter: "both",
    samples: 60,
    presence_fraction: 0.03,
    moving_fraction: 0,
    engineering_mode_turned_on: true,
    profile: "ld2410",
    max_move_gate: 6,
    max_still_gate: 6,
    min_gate: null,
    max_gate: null,
    gates: [gate(0), gate(1)],
    changed: 16,
    unchanged: 2,
    writes_done: 16,
    writes_total: 16,
    unverified: [],
    gates_off: [],
    warnings: [],
    error: null,
    ...overrides,
  };
}

/** A restore result in the backend's real shape (`result_payload` for kind
 *  restore): no gate table, the calibrate-only keys null, plus `restored`,
 *  `missing` and `restored_from`. */
function restoreResult(overrides: Partial<CalibrationResult> = {}): CalibrationResult {
  return result({
    kind: "restore",
    outcome: "restored",
    snapshot_id: "redo",
    duration_s: null,
    settle_s: null,
    margin: null,
    margin_pct: null,
    kind_filter: null,
    samples: 0,
    presence_fraction: null,
    moving_fraction: null,
    engineering_mode_turned_on: false,
    gates: [],
    changed: 16,
    unchanged: 2,
    writes_done: 16,
    writes_total: 16,
    restored: 16,
    missing: [],
    restored_from: { id: "orig", taken_at: "2026-10-11T14:31:00+00:00" },
    ...overrides,
  });
}

const NOW = new Date(2026, 9, 11, 15, 0, 0);
/** A local-time ISO stamp for today at hh:mm, so formatting is zone-proof. */
function todayAt(h: number, m: number): string {
  return new Date(2026, 9, 11, h, m, 0).toISOString();
}
function expectedTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}
function expectedDayTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

describe("phaseLabel", () => {
  it("names the engineering step", () => {
    expect(phaseLabel(job({ status: "preparing", sub_phase: "engineering" }), "ld2410")).toEqual([
      "Turning on Radar Engineering Mode...",
    ]);
  });

  it("tells the user to leave during the countdown", () => {
    const lines = phaseLabel(
      job({ status: "preparing", sub_phase: "settle", remaining_s: 12 }),
      "ld2410"
    );
    expect(lines).toEqual(["Leave the room now.", "Listening starts in 12 s.", KEEP_ON_LD2410]);
  });

  it("waits for energy after the countdown", () => {
    const lines = phaseLabel(job({ status: "preparing", sub_phase: "warmup" }), "ld2410");
    expect(lines[0]).toBe("Waiting for gate energy from the radar...");
    expect(lines).toContain(KEEP_ON_LD2410);
  });

  it("counts down the listen with the sample count and live peaks", () => {
    const lines = phaseLabel(job(), "ld2410");
    expect(lines[0]).toBe("Listening to the empty room... 42 s left");
    expect(lines[1]).toBe("Keep the room empty. 18 samples so far.");
    expect(lines).toContain("Highest so far, move: G0 14 · G1 9 · G2 22");
    expect(lines).toContain("Highest so far, still: G0 97 · G1 95");
    expect(lines[lines.length - 1]).toBe(KEEP_ON_LD2410);
  });

  it("uses the LD2412 keep-on line that also forbids background correction", () => {
    const lines = phaseLabel(job(), "ld2412");
    expect(lines).toContain(KEEP_ON_LD2412);
    expect(lines).not.toContain(KEEP_ON_LD2410);
    expect(KEEP_ON_LD2412).toBe(
      "Leave Radar Engineering Mode on and do not press Start Dynamic Background Correction until this finishes."
    );
  });

  it("names the LD2412 refresh and the writes", () => {
    expect(phaseLabel(job({ status: "applying", sub_phase: "refresh" }), "ld2412")).toEqual([
      "Reading the radar's current thresholds...",
    ]);
    const writing = phaseLabel(
      job({ status: "applying", writes_done: 7, writes_total: 18 }),
      "ld2410"
    );
    expect(writing[0]).toBe("Writing 18 thresholds to the radar... 7 of 18");
    expect(writing[1]).toBe("Values already written stay until you undo.");
  });

  it("names verification", () => {
    expect(phaseLabel(job({ status: "verifying" }), "ld2410")).toEqual([
      "Checking that the radar accepted the new values...",
    ]);
  });

  it("describes a restore job", () => {
    expect(
      phaseLabel(job({ kind: "restore", status: "applying", sub_phase: "refresh" }), "ld2412")[0]
    ).toBe("Reading the radar's current thresholds...");
    expect(
      phaseLabel(
        job({ kind: "restore", status: "applying", writes_done: 7, writes_total: 18 }),
        "ld2410"
      )[0]
    ).toBe("Restoring saved thresholds... 7 of 18");
  });

  it("uses one sample in the singular", () => {
    expect(phaseLabel(job({ samples: 1 }), "ld2410")[1]).toBe("Keep the room empty. 1 sample so far.");
  });
});

describe("phaseHeadline", () => {
  it("splits the counter off the phase sentence", () => {
    expect(phaseHeadline(job())).toEqual({ phase: "Listening to the empty room...", detail: "42 s left" });
    expect(phaseHeadline(job({ status: "applying", writes_done: 7, writes_total: 18 }))).toEqual({
      phase: "Writing 18 thresholds to the radar...",
      detail: "7 of 18",
    });
    expect(
      phaseHeadline(job({ kind: "restore", status: "applying", writes_done: 7, writes_total: 18 }))
    ).toEqual({ phase: "Restoring saved thresholds...", detail: "7 of 18" });
    expect(phaseHeadline(job({ status: "preparing", sub_phase: "settle", remaining_s: 12 }))).toEqual({
      phase: "Leave the room now.",
      detail: "",
    });
  });

  it("keeps the phase sentence steady while the counters tick", () => {
    expect(phaseHeadline(job({ remaining_s: 41, samples: 19 })).phase).toBe(
      phaseHeadline(job({ remaining_s: 40, samples: 20 })).phase
    );
  });

  it("is the start of phaseLabel's headline for every state", () => {
    const jobs = [
      job({ status: "preparing", sub_phase: "engineering" }),
      job({ status: "preparing", sub_phase: "settle" }),
      job({ status: "preparing", sub_phase: "warmup" }),
      job({ status: "preparing", sub_phase: null }),
      job(),
      job({ status: "applying", sub_phase: "refresh" }),
      job({ status: "applying", writes_done: 3, writes_total: 9 }),
      job({ status: "verifying" }),
      job({ kind: "restore", status: "preparing" }),
      job({ kind: "restore", status: "applying", sub_phase: "refresh" }),
      job({ kind: "restore", status: "applying", writes_done: 3, writes_total: 9 }),
      job({ kind: "restore", status: "verifying" }),
    ];
    for (const j of jobs) {
      const { phase, detail } = phaseHeadline(j);
      expect(phaseLabel(j, "ld2410")[0]).toBe(detail ? `${phase} ${detail}` : phase);
    }
  });
});

describe("livePeaksLine", () => {
  it("sorts gates numerically and skips an empty channel", () => {
    const lines = livePeaksLine(job({ peaks: { move: { "10": 5, "2": 9 }, still: {} } }));
    expect(lines).toEqual(["Highest so far, move: G2 9 · G10 5"]);
  });
});

describe("progress", () => {
  it("is indeterminate while engineering mode, warmup and refresh run", () => {
    expect(progress(job({ status: "preparing", sub_phase: "engineering" })).fraction).toBeNull();
    expect(progress(job({ status: "preparing", sub_phase: "warmup" })).fraction).toBeNull();
    expect(progress(job({ status: "applying", sub_phase: "refresh" })).fraction).toBeNull();
    expect(progress(job({ status: "verifying" })).fraction).toBeNull();
  });

  it("is elapsed over settle during the countdown", () => {
    const p = progress(job({ status: "preparing", sub_phase: "settle", elapsed_s: 3, remaining_s: 12 }));
    expect(p.fraction).toBeCloseTo(3 / 15);
  });

  it("is elapsed over duration while sampling", () => {
    expect(progress(job()).fraction).toBeCloseTo(18 / 60);
  });

  it("is writes done over total while applying", () => {
    expect(progress(job({ status: "applying", writes_done: 7, writes_total: 18 })).fraction).toBeCloseTo(
      7 / 18
    );
  });
});

describe("canStop / canStart", () => {
  it("allows Stop before verification and for calibrate jobs only", () => {
    expect(canStop(job({ status: "preparing" }))).toBe(true);
    expect(canStop(job({ status: "sampling" }))).toBe(true);
    expect(canStop(job({ status: "applying" }))).toBe(true);
    expect(canStop(job({ status: "verifying" }))).toBe(false);
    expect(canStop(job({ kind: "restore", status: "applying" }))).toBe(false);
    expect(canStop(job({ cancel_requested: true }))).toBe(false);
    expect(canStop(null)).toBe(false);
  });

  it("allows Start only online, with entities, no job and no background correction", () => {
    const entities = {
      profile: "ld2410" as const,
      gate_count: 9,
      engineering_mode: "switch.x",
      engineering_mode_on: false,
      background_status: null,
      background_status_on: false,
      max_move_gate: 6,
      max_still_gate: 6,
      min_gate: null,
      max_gate: null,
    };
    const payload: CalibrationPayload = {
      job: null,
      snapshots: [],
      last_result: null,
      interrupted: null,
      entities,
    };
    expect(canStart(payload, true)).toBe(true);
    expect(canStart(payload, false)).toBe(false);
    expect(canStart({ ...payload, entities: null }, true)).toBe(false);
    expect(canStart({ ...payload, job: job() }, true)).toBe(false);
    expect(canStart({ ...payload, entities: { ...entities, background_status_on: true } }, true)).toBe(
      false
    );
    expect(canStart(undefined, true)).toBe(false);
  });

  it("lets the live background status override the payload's stale copy", () => {
    const entities = {
      profile: "ld2412" as const,
      gate_count: 14,
      engineering_mode: "switch.x",
      engineering_mode_on: false,
      background_status: "binary_sensor.bg",
      background_status_on: true,
      max_move_gate: null,
      max_still_gate: null,
      min_gate: 1,
      max_gate: 11,
    };
    const payload: CalibrationPayload = {
      job: null,
      snapshots: [],
      last_result: null,
      interrupted: null,
      entities,
    };
    expect(canStart(payload, true)).toBe(false);
    expect(canStart(payload, true, false)).toBe(true);
    expect(canStart({ ...payload, entities: { ...entities, background_status_on: false } }, true, true)).toBe(
      false
    );
  });
});

describe("resultRows", () => {
  it("formats a changed threshold as old → new", () => {
    const rows = resultRows(result({ gates: [gate(0)] }));
    expect(rows[0].label).toBe("G0");
    expect(rows[0].move.text).toBe("50 → 24");
    expect(rows[0].move.peak).toBe("14");
    expect(rows[0].unused).toBe(false);
  });

  it("formats unchanged, not selected, off and no data", () => {
    const rows = resultRows(
      result({
        gates: [
          gate(
            0,
            { old: 50, new: 50, written: false, confirmed: null, actual: null },
            { old: 50, new: null, peak: null, p95: null, samples: 0, written: false, confirmed: null, actual: null, flags: ["skipped"], skipped: "not selected" }
          ),
          gate(
            1,
            { old: 0, new: 100, peak: 97, flags: ["off"] },
            { old: 100, new: 100, peak: 97, flags: ["off"], written: false, confirmed: null }
          ),
          gate(2, { peak: null, p95: null, new: null, samples: 2, written: false, confirmed: null, actual: null, flags: ["no_data"] }),
        ],
      })
    );
    expect(rows[0].move.text).toBe("50 (unchanged)");
    expect(rows[0].still.text).toBe("50 (not selected)");
    expect(rows[1].move.text).toBe("0 → 100 (off)");
    expect(rows[1].still.text).toBe("100 (off)");
    expect(rows[2].move.text).toBe("no data");
  });

  it("formats an unreadable write and skipped channels", () => {
    const rows = resultRows(
      result({
        gates: [
          gate(
            3,
            { confirmed: false, actual: null },
            { peak: null, new: null, written: false, confirmed: null, actual: null, flags: ["skipped"], skipped: "no energy sensor" }
          ),
          gate(4, { peak: null, new: null, written: false, confirmed: null, actual: null, flags: ["skipped"], skipped: "no threshold entity" }),
        ],
      })
    );
    expect(rows[0].move.text).toBe("not confirmed (radar offline)");
    expect(rows[0].still.text).toBe("skipped: no energy sensor");
    expect(rows[1].move.text).toBe("skipped: no threshold entity");
  });

  it("appends (spike seen) to the peak cell and dims unused rows", () => {
    const rows = resultRows(
      result({
        gates: [
          gate(5, { peak: 70, flags: ["spike"] }),
          gate(7, { flags: ["unused"] }, { flags: ["unused"] }),
          gate(8, { flags: ["unused"] }, {}),
        ],
      })
    );
    expect(rows[0].move.peak).toBe("70 (spike seen)");
    expect(rows[1].unused).toBe(true);
    expect(rows[1].move.flags).toContain("unused");
    // One channel still in range: the row stays bright, the cell is dimmed.
    expect(rows[2].unused).toBe(false);
    expect(rows[2].move.flags).toContain("unused");
  });

  it("marks preview cells as would set", () => {
    const rows = resultRows(result({ outcome: "preview", gates: [gate(0, { written: false, confirmed: null, actual: null })] }));
    expect(rows[0].move.text).toBe("50 → 24 (would set)");
  });

  it("returns no rows for a result without a gate table", () => {
    expect(resultRows(result({ gates: undefined }))).toEqual([]);
  });
});

describe("unusedFootnote", () => {
  it("lists LD2410 gates per channel beyond the max gate", () => {
    const lines = unusedFootnote(
      result({
        max_move_gate: 6,
        max_still_gate: 4,
        gates: [
          gate(5, {}, { flags: ["unused"] }),
          gate(7, { flags: ["unused"] }, { flags: ["unused"] }),
          gate(8, { flags: ["unused"] }, { flags: ["unused"] }),
        ],
      })
    );
    expect(lines).toEqual([
      "G7, G8: not used (beyond Max Move Gate 6)",
      "G5, G7, G8: not used (beyond Max Still Gate 4)",
    ]);
  });

  it("lists LD2412 gates below the min and beyond the max gate", () => {
    const lines = unusedFootnote(
      result({
        profile: "ld2412",
        max_move_gate: null,
        max_still_gate: null,
        min_gate: 1,
        max_gate: 11,
        gates: [
          gate(0, { flags: ["unused"] }, { flags: ["unused"] }),
          gate(5),
          gate(12, { flags: ["unused"] }, { flags: ["unused"] }),
          gate(13, { flags: ["unused"] }, { flags: ["unused"] }),
        ],
      })
    );
    expect(lines).toEqual([
      "G0: not used (below Min Gate 1)",
      "G12, G13: not used (beyond Max Gate 11)",
    ]);
  });

  it("is empty when every gate is in range", () => {
    expect(unusedFootnote(result())).toEqual([]);
  });
});

describe("warningLines", () => {
  it("renders the presence percentage", () => {
    const lines = warningLines(result({ warnings: ["presence"], presence_fraction: 0.4 }));
    expect(lines).toEqual([
      "The radar reported someone present for 40% of the listen. If someone was in the room, even sitting still, press Undo and run it again.",
    ]);
  });

  it("renders the unavailable line", () => {
    expect(warningLines(result({ warnings: ["radar_unavailable"] }))[0]).toBe(
      "The radar was unavailable for part of the listen; gates with too few readings were left as they were."
    );
  });

  it("renders the unverified list with the offline form for a null actual", () => {
    const lines = warningLines(
      result({
        warnings: ["unverified"],
        gates: [gate(3), gate(5)],
        unverified: [
          { entity_id: "number.r_g3_move_threshold", asked: 27, actual: 35 },
          { entity_id: "number.r_g5_still_threshold", asked: 12, actual: null },
        ],
      })
    );
    expect(lines).toEqual([
      "2 values could not be confirmed: G3 move still reports 35 (asked for 27), G5 still could not be read (radar offline). Check the Move / Still Thresholds cards.",
    ]);
  });

  it("renders one gate_off sentence per entry, only when present", () => {
    const lines = warningLines(
      result({
        warnings: ["gate_off"],
        gates_off: [
          { gate: 3, channel: "move", peak: 92 },
          { gate: 4, channel: "still", peak: 95 },
        ],
      })
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "G3 move is now off (its background peaked at 92). If a fan or curtain moves there all day this is fine; if not, press Undo and run again with the room really empty."
    );
    expect(lines[1]).toMatch(/^G4 still is now off \(its background peaked at 95\)/);
    expect(warningLines(result({ warnings: ["gate_off"], gates_off: [] }))).toEqual([]);
    expect(warningLines(result())).toEqual([]);
  });
});

describe("undoLabel", () => {
  it("names the newest snapshot's time when it was taken today", () => {
    const iso = todayAt(14, 31);
    const snapshots: SnapshotSummary[] = [
      { id: "b", taken_at: iso, reason: "calibrate", count: 18 },
      { id: "a", taken_at: todayAt(9, 0), reason: "calibrate", count: 18 },
    ];
    expect(undoLabel(snapshots, NOW)).toBe(`Undo (restore ${expectedTime(iso)} values)`);
  });

  it("adds the day for a snapshot taken yesterday", () => {
    const iso = new Date(2026, 9, 10, 14, 31, 0).toISOString();
    const label = undoLabel([{ id: "a", taken_at: iso, reason: "calibrate", count: 18 }], NOW);
    expect(label).toBe(`Undo (restore ${expectedDayTime(iso)} values)`);
  });

  it("says there is nothing to restore without snapshots", () => {
    expect(undoLabel([], NOW)).toBe("Nothing to restore yet");
    expect(NOTHING_TO_RESTORE).toBe("Nothing to restore yet");
  });
});

describe("formatTime", () => {
  it("drops the day for today and keeps it otherwise", () => {
    const today = todayAt(14, 32);
    expect(formatTime(today, NOW)).toBe(expectedTime(today));
    const yesterday = new Date(2026, 9, 10, 14, 32, 0).toISOString();
    expect(formatTime(yesterday, NOW)).toBe(expectedDayTime(yesterday));
  });
});

describe("durationText", () => {
  it("reads seconds below a minute and whole minutes above", () => {
    expect(durationText(15)).toBe("15 seconds");
    expect(durationText(30)).toBe("30 seconds");
    expect(durationText(60)).toBe("1 minute");
    expect(durationText(120)).toBe("2 minutes");
    expect(durationText(300)).toBe("5 minutes");
    expect(durationText(90)).toBe("90 seconds");
  });
});

describe("idleSentence", () => {
  it("names both durations", () => {
    expect(idleSentence(15, 60)).toBe(
      "Teach the radar what your empty room looks like. It counts down 15 seconds so you can leave, listens for 1 minute, then sets every gate's move and still threshold just above the background it heard. Your current thresholds are saved first, so you can undo."
    );
  });

  it("drops the countdown clause with settle_s 0", () => {
    expect(idleSentence(0, 120)).toBe(
      "Teach the radar what your empty room looks like. It listens for 2 minutes, then sets every gate's move and still threshold just above the background it heard. Your current thresholds are saved first, so you can undo."
    );
  });
});

describe("summaryLine / footerLine / resultHeading / failureLine", () => {
  it("summarises an applied result", () => {
    const iso = todayAt(14, 32);
    expect(summaryLine(result({ finished_at: iso }), NOW)).toBe(
      `Calibrated at ${expectedTime(iso)} from 60 samples. 16 of 18 thresholds changed.`
    );
  });

  it("writes the footer with the day", () => {
    const iso = todayAt(14, 32);
    expect(footerLine(result({ finished_at: iso }))).toBe(
      `Last calibrated ${expectedDayTime(iso)}, 16 of 18 thresholds changed.`
    );
    expect(footerLine(result({ finished_at: iso, kind: "restore", outcome: "restored" }))).toBe(
      `Last restored ${expectedDayTime(iso)}.`
    );
  });

  it("words the footer for previews, stops and failures without claiming a change", () => {
    const iso = todayAt(14, 32);
    const when = expectedDayTime(iso);
    expect(footerLine(result({ finished_at: iso, outcome: "preview" }))).toBe(`Last previewed ${when}.`);
    expect(footerLine(result({ finished_at: iso, status: "cancelled", outcome: "cancelled" }))).toBe(
      `Last calibration ${when} was stopped.`
    );
    expect(footerLine(result({ finished_at: iso, status: "failed", outcome: "failed" }))).toBe(
      `Last calibration ${when} failed.`
    );
    expect(footerLine(restoreResult({ finished_at: iso, status: "failed", outcome: "failed" }))).toBe(
      `Last restore ${when} failed.`
    );
    expect(footerLine(restoreResult({ finished_at: iso, status: "cancelled", outcome: "cancelled" }))).toBe(
      `Last restore ${when} was stopped.`
    );
  });

  it("summarises a preview as what it would change", () => {
    const iso = todayAt(14, 32);
    expect(summaryLine(result({ finished_at: iso, outcome: "preview", changed: 12, unchanged: 6 }), NOW)).toBe(
      `Previewed at ${expectedTime(iso)} from 60 samples. 12 of 18 thresholds would change.`
    );
  });

  it("summarises a stop with the Cancelled view's sentence", () => {
    const stopped = result({ status: "cancelled", outcome: "cancelled", writes_done: 0, writes_total: 0, changed: 0, unchanged: 0 });
    expect(cancelledLine(stopped)).toBe("Stopped. Nothing was changed.");
    expect(summaryLine(stopped, NOW)).toBe("Stopped. Nothing was changed.");
    const partway = result({ status: "cancelled", outcome: "cancelled", writes_done: 7, writes_total: 18 });
    expect(summaryLine(partway, NOW)).toBe(
      "Stopped after 7 of 18 values were written. Undo restores the saved values."
    );
  });

  it("summarises a failure with the failed sentence", () => {
    const failed = result({
      status: "failed",
      outcome: "failed",
      writes_done: 0,
      error: { code: "not_allowed", message: "Your Home Assistant user is not allowed to control this radar's entities." },
    });
    expect(summaryLine(failed, NOW)).toBe(failureLine(failed));
  });

  it("counts unconfirmed values in the partial heading", () => {
    expect(resultHeading(result())).toBe("Thresholds updated");
    expect(
      resultHeading(
        result({
          outcome: "partial",
          unverified: [
            { entity_id: "a", asked: 1, actual: 2 },
            { entity_id: "b", asked: 1, actual: null },
          ],
        })
      )
    ).toBe("Thresholds updated, 2 could not be confirmed");
  });

  it("appends Nothing was changed only for zero writes and offers Undo by count", () => {
    const failed = result({
      status: "failed",
      outcome: "failed",
      writes_done: 0,
      error: { code: "no_energy_data", message: "No gate energy readings arrived within 20 s." },
    });
    expect(failureLine(failed)).toBe(
      "Calibration failed: No gate energy readings arrived within 20 s. Nothing was changed."
    );
    expect(offersUndo(failed)).toBe(false);
    const partial = result({
      status: "failed",
      outcome: "failed",
      writes_done: 4,
      writes_total: 18,
      error: { code: "device_offline", message: "The radar went offline after 4 of 18 values were written." },
    });
    expect(failureLine(partial)).toBe(
      "Calibration failed: The radar went offline after 4 of 18 values were written."
    );
    expect(offersUndo(partial)).toBe(true);
    const lost = result({
      status: "failed",
      outcome: "failed",
      writes_done: 0,
      error: { code: "engineering_mode_lost", message: "Mode turned off. Nothing was changed. Try again." },
    });
    expect(failureLine(lost)).toBe("Calibration failed: Mode turned off. Nothing was changed. Try again.");
  });
});

describe("failureLine with the backend's job messages", () => {
  // The exact `ERROR_MESSAGES` / `_NOTHING_WRITTEN_MESSAGES` texts from
  // calibration.py, with sample placeholders filled in.
  const MESSAGES = {
    engineering_mode_not_confirmed:
      "Home Assistant could not turn Radar Engineering Mode on within 10 s. Is the radar online?",
    no_energy_data:
      "No gate energy readings arrived within 20 s of turning Radar Engineering Mode on. Check that the radar is online and that Radar Engineering Mode works from its device page.",
    engineering_mode_lost:
      "Radar Engineering Mode turned off during the listen. Nothing was changed. Leave it on until calibration finishes, then try again.",
    background_correction_started:
      "Dynamic Background Correction was started during the listen. Nothing was changed. Wait for its status to turn off, then calibrate again.",
    thresholds_not_numeric:
      "Some threshold entities still have no value after the radar was asked for them (number.a_g0_move_threshold). Nothing was changed. Check the radar's device page.",
    snapshot_failed:
      "Could not save the current thresholds, so nothing was changed. Check the Home Assistant log and free disk space.",
    device_offline_none: "The radar went offline before any value was written. Nothing was changed.",
    device_offline: "The radar went offline after 4 of 18 values were written. Use Undo once it is back.",
    write_failed_none: "Writing failed on the first value (number.a_g0_move_threshold raised an error). Nothing was changed.",
    write_failed:
      "Writing stopped after 5 of 18 values (number.a_g2_still_threshold raised an error). Use Undo to put the saved values back.",
    not_allowed: "Your Home Assistant user is not allowed to control this radar's entities.",
    cancelled_by_shutdown: "Home Assistant stopped or the integration reloaded during the calibration.",
    unexpected: "Something went wrong: boom. See the Home Assistant log.",
  };

  function failed(code: string, message: string, writes = 0, kind: "calibrate" | "restore" = "calibrate") {
    return result({
      kind,
      status: "failed",
      outcome: "failed",
      writes_done: writes,
      writes_total: writes ? 18 : 0,
      error: { code, message },
    });
  }

  function occurrences(text: string): number {
    return (text.match(/nothing was changed/gi) ?? []).length;
  }

  it("says nothing was changed exactly once for every zero-write failure", () => {
    for (const [code, message] of Object.entries(MESSAGES)) {
      if (code === "device_offline" || code === "write_failed") continue;
      const line = failureLine(failed(code.replace(/_none$/, ""), message));
      expect(line.startsWith(`Calibration failed: ${message}`)).toBe(true);
      expect(occurrences(line)).toBe(1);
    }
  });

  it("shows messages that already say so as they are, in any case", () => {
    expect(failureLine(failed("snapshot_failed", MESSAGES.snapshot_failed))).toBe(
      `Calibration failed: ${MESSAGES.snapshot_failed}`
    );
    expect(failureLine(failed("engineering_mode_lost", MESSAGES.engineering_mode_lost))).toBe(
      `Calibration failed: ${MESSAGES.engineering_mode_lost}`
    );
    expect(failureLine(failed("device_offline", MESSAGES.device_offline_none))).toBe(
      `Calibration failed: ${MESSAGES.device_offline_none}`
    );
  });

  it("appends the sentence for zero-write codes whose message does not say it", () => {
    expect(failureLine(failed("no_energy_data", MESSAGES.no_energy_data))).toBe(
      `Calibration failed: ${MESSAGES.no_energy_data} Nothing was changed.`
    );
    expect(failureLine(failed("cancelled_by_shutdown", MESSAGES.cancelled_by_shutdown))).toBe(
      `Calibration failed: ${MESSAGES.cancelled_by_shutdown} Nothing was changed.`
    );
  });

  it("never claims nothing changed once values were written, whatever the code", () => {
    for (const code of ["device_offline", "write_failed"] as const) {
      const line = failureLine(failed(code, MESSAGES[code], 4));
      expect(line).toBe(`Calibration failed: ${MESSAGES[code]}`);
      expect(offersUndo(failed(code, MESSAGES[code], 4))).toBe(true);
    }
    // Addendum 6: an Unauthorized after two writes is not_allowed with writes.
    const notAllowed = failed("not_allowed", MESSAGES.not_allowed, 2);
    expect(failureLine(notAllowed)).toBe(`Calibration failed: ${MESSAGES.not_allowed}`);
    expect(offersUndo(notAllowed)).toBe(true);
  });

  it("prefixes a failed restore with Restore failed", () => {
    expect(failureLine(failed("device_offline", MESSAGES.device_offline, 4, "restore"))).toBe(
      `Restore failed: ${MESSAGES.device_offline}`
    );
    expect(failureLine(failed("cancelled_by_shutdown", MESSAGES.cancelled_by_shutdown, 0, "restore"))).toBe(
      `Restore failed: ${MESSAGES.cancelled_by_shutdown} Nothing was changed.`
    );
  });
});

describe("restoredLine / restoreSource", () => {
  const redo: SnapshotSummary = { id: "redo", taken_at: todayAt(14, 40), reason: "restore", count: 18 };
  const orig: SnapshotSummary = { id: "orig", taken_at: todayAt(14, 31), reason: "calibrate", count: 18 };
  const older: SnapshotSummary = { id: "older", taken_at: todayAt(9, 5), reason: "calibrate", count: 18 };

  it("names the snapshot the backend says it restored", () => {
    // Restored through the service with an older snapshot_id: the list's
    // neighbour of the redo snapshot is not the one that was written back.
    const r = restoreResult({ restored_from: { id: "older", taken_at: older.taken_at } });
    expect(restoreSource(r, [redo, orig, older])).toEqual({ id: "older", taken_at: older.taken_at });
    expect(restoredLine(r, [redo, orig, older], NOW)).toBe(
      `Restored the thresholds from ${expectedTime(older.taken_at)}.`
    );
  });

  it("falls back to the snapshot older than the redo snapshot without restored_from", () => {
    const r = restoreResult({ restored_from: undefined });
    expect(restoreSource(r, [redo, orig])).toEqual({ id: "orig", taken_at: orig.taken_at });
    expect(restoredLine(r, [redo, orig], NOW)).toBe(
      `Restored the thresholds from ${expectedTime(orig.taken_at)}.`
    );
    expect(restoreSource(restoreResult({ restored_from: { id: null, taken_at: null } }), [redo, orig])).toEqual({
      id: "orig",
      taken_at: orig.taken_at,
    });
  });

  it("uses the newest snapshot when the restore failed before its redo snapshot", () => {
    const r = restoreResult({ outcome: "failed", status: "failed", snapshot_id: null, restored_from: null });
    expect(restoreSource(r, [orig, older])).toEqual({ id: "orig", taken_at: orig.taken_at });
  });

  it("drops the time rather than guess one", () => {
    const r = restoreResult({ restored_from: undefined });
    expect(restoreSource(r, [redo])).toBeNull();
    expect(restoredLine(r, [redo], NOW)).toBe("Restored the saved thresholds.");
  });
});

describe("restore summaries", () => {
  it("summarises a restore and names the entities it could not find", () => {
    const iso = todayAt(14, 40);
    const r = restoreResult({ finished_at: iso, missing: ["number.gone_g3_move_threshold"] });
    expect(missingLine(r)).toBe("Not found any more: number.gone_g3_move_threshold.");
    expect(restoreSummaryLines(r)).toEqual([
      `Restored 16 values at ${expectedTime(iso)}, 2 unchanged.`,
      "Not found any more: number.gone_g3_move_threshold.",
    ]);
    expect(missingLine(restoreResult())).toBeNull();
    expect(restoreSummaryLines(restoreResult())).toHaveLength(1);
  });

  it("returns no rows for the backend's empty restore table", () => {
    expect(resultRows(restoreResult())).toEqual([]);
    expect(unusedFootnote(restoreResult())).toEqual([]);
  });
});

describe("isFactoryThresholds", () => {
  const base = "apollo_msr_2_m4c4dd";
  const m = entityMapFromBaseName(base);

  function factoryHass(): HomeAssistant {
    const states: HomeAssistant["states"] = {};
    LD2410_FACTORY_THRESHOLDS.move.forEach((v, i) => {
      states[m.move_threshold[i]] = { entity_id: m.move_threshold[i], state: `${v}.0`, attributes: {} };
    });
    LD2410_FACTORY_THRESHOLDS.still.forEach((v, i) => {
      states[m.still_threshold[i]] = { entity_id: m.still_threshold[i], state: String(v), attributes: {} };
    });
    return { states, entities: {}, devices: {} };
  }

  it("is true only when all 18 thresholds match the factory table", () => {
    expect(isFactoryThresholds(factoryHass(), m, "ld2410")).toBe(true);
    const hass = factoryHass();
    hass.states[m.still_threshold[4]] = { entity_id: m.still_threshold[4], state: "31", attributes: {} };
    expect(isFactoryThresholds(hass, m, "ld2410")).toBe(false);
  });

  it("is false with a snapshot, on an LD2412, or with a missing number", () => {
    const snapshot: SnapshotSummary = { id: "a", taken_at: todayAt(1, 0), reason: "calibrate", count: 18 };
    expect(isFactoryThresholds(factoryHass(), m, "ld2410", [snapshot])).toBe(false);
    expect(isFactoryThresholds(factoryHass(), m, "ld2412")).toBe(false);
    const hass = factoryHass();
    delete hass.states[m.move_threshold[8]];
    expect(isFactoryThresholds(hass, m, "ld2410")).toBe(false);
  });
});

describe("showsResultView", () => {
  const payloadWith = (j: JobState | null, last: CalibrationResult | null): CalibrationPayload => ({
    job: j,
    snapshots: [],
    last_result: last,
    interrupted: null,
    entities: null,
  });

  it("is false on a fresh mount with a stored result", () => {
    const payload = payloadWith(null, result());
    const local = nextLocalState(INITIAL_LOCAL_STATE, payload);
    expect(showsResultView(local, payload)).toBe(false);
  });

  it("is true after watching sampling turn into done for the same job", () => {
    let local = nextLocalState(INITIAL_LOCAL_STATE, payloadWith(job(), null));
    expect(showsResultView(local, payloadWith(job(), null))).toBe(false);
    const done = payloadWith(job({ status: "done" }), result());
    local = nextLocalState(local, done);
    expect(showsResultView(local, done)).toBe(true);
    // The backend's finally drops the job and keeps the stored result.
    const settled = payloadWith(null, result());
    local = nextLocalState(local, settled);
    expect(showsResultView(local, settled)).toBe(true);
  });

  it("is true when the job vanished and the stored result names it", () => {
    let local = nextLocalState(INITIAL_LOCAL_STATE, payloadWith(job(), null));
    const settled = payloadWith(null, result());
    local = nextLocalState(local, settled);
    expect(showsResultView(local, settled)).toBe(true);
  });

  it("is false once a newer result replaces the one that was watched", () => {
    let local = nextLocalState(INITIAL_LOCAL_STATE, payloadWith(job(), null));
    local = nextLocalState(local, payloadWith(null, result()));
    const newer = payloadWith(null, result({ job_id: "job2" }));
    local = nextLocalState(local, newer);
    expect(showsResultView(local, newer)).toBe(false);
  });
});
