import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractPageText } from "../src/content/extractPageText";

const QA_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    The old lighthouse on the edge of the cliff had been silent for twelve years. No keeper, no light, only salt wind
    and gulls circling like unfinished thoughts. Every evening, Arun still climbed the broken path anyway. Not because
    he expected anything, but because his father had once told him, "Even a dead light remembers how to shine."

    One night, during a storm that bent the sea into restless glass, the lighthouse flickered. A weak pulse at first,
    then steady—impossible. Arun found the control room unlocked, dry, and warm as if someone had just left. On the desk
    lay a logbook open to a single line: *"If you are reading this, it means the light chose you next."*
</body>
</html>`;

describe("extractPageText QA lighthouse page", () => {
  it("extracts plain HTML body text", () => {
    const doc = new JSDOM(QA_HTML, { url: "https://example.com/lighthouse" }).window.document;
    const result = extractPageText(doc);
    expect(result.text).toContain("lighthouse");
    expect(result.text.length).toBeGreaterThan(100);
  });
});
