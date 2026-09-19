import { describe, expect, it } from "vitest";
import { delayUnlessAborted } from "../src/shared/delay";
import { ErrorCode } from "../src/shared/errors";

describe("delayUnlessAborted", () => {
  it("resolves when the signal stays open", async () => {
    const controller = new AbortController();
    await expect(delayUnlessAborted(5, controller.signal)).resolves.toBeUndefined();
  });

  it("rejects with CANCELLED if already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(delayUnlessAborted(50, controller.signal)).rejects.toMatchObject({
      code: ErrorCode.CANCELLED,
    });
  });

  it("rejects with CANCELLED when aborted during the wait", async () => {
    const controller = new AbortController();
    const pending = delayUnlessAborted(5_000, controller.signal);
    queueMicrotask(() => controller.abort());
    await expect(pending).rejects.toMatchObject({ code: ErrorCode.CANCELLED });
  });
});
