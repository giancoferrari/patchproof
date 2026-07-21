import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../src/report/demo.js";
import { renderProofReport } from "../src/report/render.js";

describe("standalone report", () => {
  it("renders the complete proof investigation surface", () => {
    const html = renderProofReport(createDemoBundle());
    expect(html).toContain("Proof graph");
    expect(html).toContain("Harden cursor pagination: rejected");
    expect(html).toContain("Existing protection was skipped");
    expect(html).toContain("Evidence chain");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain("Skip to report");
    expect(html).not.toContain("linear-gradient");
  });

  it("escapes user-controlled text in markup and embedded JSON", () => {
    const bundle = createDemoBundle();
    bundle.contract.value.title = '<script>alert("contract")</script>';
    bundle.evidence[0]!.stdout = "</script><img src=x onerror=alert(1)>";
    const html = renderProofReport(bundle);
    expect(html).not.toContain('<script>alert("contract")</script>');
    expect(html).not.toContain("</script><img");
    expect(html).toContain("&lt;script&gt;alert(&quot;contract&quot;)&lt;/script&gt;");
    expect(html).toContain("\\u003c/script\\u003e\\u003cimg");
  });

  it("is deterministic for the same proof bundle", () => {
    const bundle = createDemoBundle();
    expect(renderProofReport(bundle)).toBe(renderProofReport(bundle));
  });
});
