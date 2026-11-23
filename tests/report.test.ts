import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../src/report/demo.js";
import { renderProofReport } from "../src/report/render.js";

describe("standalone report", () => {
  it("renders the complete proof investigation surface", () => {
    const html = renderProofReport(createDemoBundle());
    expect(html).toContain("Proof graph");
    expect(html).toContain("<h1>Harden cursor pagination</h1>");
    expect(html).toContain('href="#file-1" data-file-link="1"');
    expect(html).toContain("Suggested fix");
    expect(html).toContain('id="file-1"');
    expect(html).toContain("Existing protection was skipped");
    expect(html).toContain("Evidence chain");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain("Skip to report");
    expect(html).toContain('class="wordmark"');
    expect(html).toContain('<body class="verdict-rejected">');
    // The report must stay fully offline: no remote scripts, stylesheets, images, or fonts.
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(html).not.toMatch(/@import|@font-face/);
    // House style: the interface never uses em dashes.
    expect(html).not.toMatch(/\u2014|&mdash;|&#8212;/);
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
