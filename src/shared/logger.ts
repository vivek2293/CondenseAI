type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

type LogContext_ = LogContext | undefined;

function timestamp(): string {
  return new Date().toISOString();
}

function formatError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(("code" in error) ? { code: (error as { code: unknown }).code } : {}),
    };
  }
  return { value: String(error) };
}

/** Rough token estimate: 1 token ≈ 4 characters (English text). */
export function estimateTokens(chars: number): number {
  return Math.round(chars / 4);
}

export function createLogger(scope: string) {
  function prefix(): string {
    return `[CondenseAI:${scope} ${timestamp()}]`;
  }

  function log(level: LogLevel, message: string, context?: LogContext_): void {
    const payload = context ? [message, context] : [message];
    console[level](prefix(), ...payload);
  }

  return {
    debug(message: string, context?: LogContext_) {
      log("debug", message, context);
    },
    info(message: string, context?: LogContext_) {
      log("info", message, context);
    },
    warn(message: string, context?: LogContext_) {
      log("warn", message, context);
    },
    error(message: string, error?: unknown, context?: LogContext_) {
      log("error", message, {
        ...context,
        ...(error !== undefined ? { error: formatError(error) } : {}),
      });
    },
    /** Start a timer; call the returned function to log elapsed time at info level. */
    time(label: string): () => void {
      const start = performance.now();
      return () => {
        const durationMs = Math.round(performance.now() - start);
        log("info", `${label} completed`, { durationMs });
      };
    },
    /** Log token estimate alongside a LLM call context object. */
    tokens(chars: number): LogContext {
      return { chars, estimatedTokens: estimateTokens(chars) };
    },
  };
}
