import { PROVIDER_CONFIG } from "../configs/provider";
import type { ProviderType } from "../configs/provider";
import { normalizeOllamaBaseUrl } from "./ollamaUrl";

export type { ProviderType };

export interface AppConfig {
  provider: ProviderType;
  ollamaBaseUrl: string;
  apiKey: string;
  model: string;
  maxInputChars: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  provider: PROVIDER_CONFIG.type,
  ollamaBaseUrl: PROVIDER_CONFIG.baseUrl,
  apiKey: PROVIDER_CONFIG.apiKey,
  model: PROVIDER_CONFIG.model,
  maxInputChars: PROVIDER_CONFIG.maxInputChars,
  maxOutputTokens: PROVIDER_CONFIG.maxOutputTokens,
  requestTimeoutMs: PROVIDER_CONFIG.requestTimeoutMs,
};

function sanitizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    ollamaBaseUrl: normalizeOllamaBaseUrl(config.ollamaBaseUrl),
    model: config.model?.trim() || DEFAULT_CONFIG.model,
    maxInputChars: config.maxInputChars > 0 ? config.maxInputChars : DEFAULT_CONFIG.maxInputChars,
    maxOutputTokens:
      config.maxOutputTokens > 0 ? config.maxOutputTokens : DEFAULT_CONFIG.maxOutputTokens,
    requestTimeoutMs:
      config.requestTimeoutMs > 0 ? config.requestTimeoutMs : DEFAULT_CONFIG.requestTimeoutMs,
  };
}

const STORAGE_KEY = "appConfig";

export async function getConfig(): Promise<AppConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<AppConfig> | undefined;
  return sanitizeConfig({ ...DEFAULT_CONFIG, ...stored });
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig();
  const updated = sanitizeConfig({ ...current, ...partial });
  await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
  return updated;
}
