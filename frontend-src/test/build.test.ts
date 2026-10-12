import { describe, it, expect } from "vitest";
import { CARD_VERSION } from "../src/index";
import pkg from "../package.json";
import lock from "../package-lock.json";
import manifest from "../../custom_components/apollo_mmwave/manifest.json";

describe("bundle entry", () => {
  it("exports a semver version string", () => {
    expect(CARD_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("keeps every hand-synced version copy equal to CARD_VERSION", () => {
    expect({
      packageJson: pkg.version,
      lockfile: lock.version,
      lockfileRoot: lock.packages[""].version,
      manifest: manifest.version,
    }).toEqual({
      packageJson: CARD_VERSION,
      lockfile: CARD_VERSION,
      lockfileRoot: CARD_VERSION,
      manifest: CARD_VERSION,
    });
  });
});
