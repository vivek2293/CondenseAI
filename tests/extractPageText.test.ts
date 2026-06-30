import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractPageText } from "../src/content/extractPageText";
import { ErrorCode } from "../src/shared/errors";

function makeDoc(html: string, url = "https://example.com/article"): Document {
  const dom = new JSDOM(html, { url });
  return dom.window.document;
}

describe("extractPageText", () => {
  it("extracts article content via readability", () => {
    const doc = makeDoc(`
      <html>
        <head><title>Great Article</title></head>
        <body>
          <nav>Home About Contact</nav>
          <article>
            <h1>Great Article</h1>
            <p>${"This is meaningful article content. ".repeat(20)}</p>
          </article>
          <footer>Copyright 2024</footer>
        </body>
      </html>
    `);

    const result = extractPageText(doc);

    expect(result.title).toBe("Great Article");
    expect(result.url).toBe("https://example.com/article");
    expect(result.text.length).toBeGreaterThan(100);
    expect(result.method).toBe("readability");
  });

  it("extracts content from pages without clear article markup", () => {
    const bodyContent = "Dynamic content loaded here without article markup. ".repeat(10);
    const doc = makeDoc(`
      <html>
        <head><title>SPA Page</title></head>
        <body>
          <div id="app">${bodyContent}</div>
        </body>
      </html>
    `);

    const result = extractPageText(doc);

    expect(result.text.length).toBeGreaterThan(100);
    expect(result.text).toContain("Dynamic content");
    expect(["readability", "body"]).toContain(result.method);
  });

  it("throws EMPTY_PAGE for pages with no content", () => {
    const doc = makeDoc(`
      <html>
        <head><title>Empty</title></head>
        <body><div></div></body>
      </html>
    `);

    try {
      extractPageText(doc);
      expect.fail("Expected EMPTY_PAGE error");
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.EMPTY_PAGE });
    }
  });
});
