export type ClaudeModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export type ClaudeTextRequest = {
  readonly model: ClaudeModel;
  readonly system: string;
  readonly userPrompt: string;
  readonly maxTokens: number;
  readonly temperature?: number;
};

export type ClaudeVisionImage = {
  readonly url: string;
  readonly mediaType?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

export type ClaudeVisionRequest = {
  readonly model: ClaudeModel;
  readonly system: string;
  readonly userPrompt: string;
  readonly images: readonly ClaudeVisionImage[];
  readonly maxTokens: number;
};

export type ClaudeResponse = {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
};
