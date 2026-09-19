import { AppError, ErrorCode, getUserMessage } from "./errors";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Like delay(), but rejects with CANCELLED if the signal aborts while waiting. */
export function delayUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED)));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(new AppError(ErrorCode.CANCELLED, getUserMessage(ErrorCode.CANCELLED)));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
