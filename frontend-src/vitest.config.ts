import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom (14.x) drops Lit's child-part markers inside an <svg>, so the
    // svg`` parts the chart renderers nest in their <svg> never reach the DOM
    // and the bindings after them shift. Tests of renderDistanceChart and
    // renderGateEnergyChart therefore assert on the returned TemplateResult,
    // flattened to markup by test/template-markup.ts, not on rendered nodes.
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-canvas.ts"],
  },
});
