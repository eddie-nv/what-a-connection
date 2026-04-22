export type RetryOptions = {
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export type TimedResult<T> = {
  readonly result: T;
  readonly durationMs: number;
};

export type EnvConfig = {
  readonly apifyApiKey: string;
  readonly anthropicApiKey: string;
  readonly port: number;
  readonly databasePath: string;
  readonly cacheMaxAgeDays: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
};
