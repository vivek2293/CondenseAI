const LOCALHOST_ALIASES = ["localhost", "127.0.0.1", "[::1]"] as const;

export function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return "http://127.0.0.1:11434";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http://127.0.0.1:11434";
    }
    return url.origin;
  } catch {
    return "http://127.0.0.1:11434";
  }
}

export function getOllamaBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  const candidates = new Set<string>([normalized]);

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "localhost") {
      candidates.add(`${url.protocol}//127.0.0.1${url.port ? `:${url.port}` : ""}`);
    } else if (hostname === "127.0.0.1") {
      candidates.add(`${url.protocol}//localhost${url.port ? `:${url.port}` : ""}`);
    }
  } catch {
    candidates.add("http://127.0.0.1:11434");
    candidates.add("http://localhost:11434");
  }

  return [...candidates];
}

export function buildOllamaApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeOllamaBaseUrl(baseUrl)}${normalizedPath}`;
}

export function isLocalOllamaHost(baseUrl: string): boolean {
  try {
    const hostname = new URL(normalizeOllamaBaseUrl(baseUrl)).hostname.toLowerCase();
    return LOCALHOST_ALIASES.includes(hostname as (typeof LOCALHOST_ALIASES)[number]);
  } catch {
    return false;
  }
}
