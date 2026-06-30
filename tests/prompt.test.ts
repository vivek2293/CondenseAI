import { describe, expect, it } from "vitest";
import { buildChatMessages, SYSTEM_PROMPT } from "../src/shared/prompt";

describe("buildChatMessages", () => {
  it("returns system and user messages with page context", () => {
    const messages = buildChatMessages({
      title: "Test Page",
      url: "https://example.com",
      text: "Article body text here.",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("<page_title>Test Page</page_title>");
    expect(messages[1].content).toContain("<page_content>Article body text here.</page_content>");
  });
});
