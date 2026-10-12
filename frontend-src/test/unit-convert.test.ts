import { describe, it, expect } from "vitest";
import {
  convert,
  defaultDistanceUnit,
  isValidUom,
  toMeters,
  VALID_UOMS,
} from "../src/charts/unit-convert";

describe("unit-convert", () => {
  it("lists the six supported units", () => {
    expect(VALID_UOMS).toEqual(["mm", "cm", "m", "in", "ft", "yd"]);
  });

  it("validates units", () => {
    expect(isValidUom("cm")).toBe(true);
    expect(isValidUom("furlong")).toBe(false);
    expect(isValidUom(undefined)).toBe(false);
  });

  it("converts to meters", () => {
    expect(toMeters(100, "cm")).toBeCloseTo(1, 6);
    expect(toMeters(12, "in")).toBeCloseTo(0.3048, 6);
  });

  it("returns the same value when from === to", () => {
    expect(convert(42, "m", "m")).toBe(42);
  });

  it("converts between units", () => {
    expect(convert(1, "m", "cm")).toBeCloseTo(100, 6);
    expect(convert(1, "m", "in")).toBeCloseTo(39.3701, 3);
    expect(convert(12, "in", "ft")).toBeCloseTo(1, 6);
    expect(convert(2.54, "cm", "in")).toBeCloseTo(1, 6);
  });

  it("pins every unit factor as both source and target", () => {
    // mm and yd, which the cases above never touch, plus ft as a source.
    expect(toMeters(1000, "mm")).toBeCloseTo(1, 6);
    expect(toMeters(1, "yd")).toBeCloseTo(0.9144, 6);
    expect(toMeters(1, "ft")).toBeCloseTo(0.3048, 6);
    expect(convert(1000, "mm", "m")).toBeCloseTo(1, 6);
    expect(convert(1, "m", "mm")).toBeCloseTo(1000, 6);
    expect(convert(10, "mm", "cm")).toBeCloseTo(1, 6);
    expect(convert(1, "yd", "m")).toBeCloseTo(0.9144, 6);
    expect(convert(0.9144, "m", "yd")).toBeCloseTo(1, 6);
    expect(convert(1, "yd", "in")).toBeCloseTo(36, 6);
    expect(convert(1, "yd", "ft")).toBeCloseTo(3, 6);
    expect(convert(3, "ft", "in")).toBeCloseTo(36, 6);
    expect(convert(3, "ft", "yd")).toBeCloseTo(1, 6);
    expect(convert(1, "ft", "mm")).toBeCloseTo(304.8, 6);
  });

  it("defaults the chart unit from HA's unit system", () => {
    expect(
      defaultDistanceUnit({ config: { unit_system: { length: "mi" } } })
    ).toBe("in");
    expect(
      defaultDistanceUnit({ config: { unit_system: { length: "km" } } })
    ).toBe("m");
    // Metric when the unit system is unknown (test hass objects, old HA).
    expect(defaultDistanceUnit(undefined)).toBe("m");
    expect(defaultDistanceUnit({})).toBe("m");
  });
});
