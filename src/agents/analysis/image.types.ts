export type ImageItemCategory =
  | "book"
  | "music"
  | "game"
  | "sports_equipment"
  | "hobby"
  | "clothing_brand"
  | "vehicle"
  | "pet"
  | "food_drink_gear"
  | "decor_collectible"
  | "tech_setup"
  | "other";

export type ImageItem = {
  readonly name: string;
  readonly category: ImageItemCategory;
  readonly confidence: number;
  readonly location: string;
};

export type ImageAnalysisResult = {
  readonly imageUrl: string;
  readonly sourcePostUrl?: string;
  readonly items: readonly ImageItem[];
  readonly sceneDescription: string;
  readonly styleSignals: readonly string[];
};

export type ImageAnalysis = {
  readonly results: readonly ImageAnalysisResult[];
  readonly aggregatedItems: readonly ImageItem[];
  readonly analyzedCount: number;
  readonly skippedCount: number;
};
