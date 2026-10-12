import { defineConfig } from "vitest/config";

export default defineConfig({
  // registry-detection.test.ts imports config_flow.py with ?raw to check the
  // frontend model table against the backend's MMWAVE_MODELS. Vite 6 refuses
  // to load files outside the project root unless they are allowed here. This
  // config is read only by vitest; the bundle builds use vite.config.ts.
  server: {
    fs: { allow: [".", "../custom_components/apollo_mmwave"] },
  },
  test: {
    // happy-dom (seen on 14.x, not re-checked since the move to 20.x) drops
    // Lit's child-part markers inside an <svg>, so the
    // svg`` parts the chart renderers nest in their <svg> never reach the DOM
    // and the bindings after them shift. Tests of renderDistanceChart and
    // renderGateEnergyChart therefore assert on the returned TemplateResult,
    // flattened to markup by test/template-markup.ts, not on rendered nodes.
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-canvas.ts"],
  },
});
