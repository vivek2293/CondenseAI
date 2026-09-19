import { describe, expect, it } from "vitest";
import {
  AppError,
  ErrorCode,
  getUserMessage,
  mapFetchError,
  toSummarizeFailure,
} from "../src/shared/errors";

describe("getUserMessage", () => {
  it("returns TIMEOUT and CANCELLED copy", () => {
    expect(getUserMessage(ErrorCode.TIMEOUT)).toContain("too long");
    expect(getUserMessage(ErrorCode.CANCELLED)).toBe("Cancelled.");
  });
});

describe("toSummarizeFailure", () => {
  it("preserves AppError code and message", () => {
    const err = new AppError(ErrorCode.EMPTY_PAGE, "empty");
    expect(toSummarizeFailure(err)).toEqual({ code: ErrorCode.EMPTY_PAGE, message: "empty" });
  });

  it("maps unknown errors to UNKNOWN", () => {
    expect(toSummarizeFailure(new Error("boom"))).toEqual({
      code: ErrorCode.UNKNOWN,
      message: getUserMessage(ErrorCode.UNKNOWN),
    });
  });
});

describe("mapFetchError", () => {
  it("maps AbortError to TIMEOUT", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(mapFetchError(err, "llama3.1").code).toBe(ErrorCode.TIMEOUT);
  });

  it("maps network TypeError to PROVIDER_UNAVAILABLE", () => {
    expect(mapFetchError(new TypeError("Failed to fetch"), "llama3.1").code).toBe(
      ErrorCode.PROVIDER_UNAVAILABLE,
    );
  });

  it("rethrows AppError as-is", () => {
    const err = new AppError(ErrorCode.CANCELLED, "Cancelled.");
    expect(mapFetchError(err, "llama3.1")).toBe(err);
  });
});
