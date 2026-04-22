export type RedactedField =
  | "family"
  | "health"
  | "politics"
  | "religion"
  | "financial"
  | "address"
  | "phone"
  | "private_context";

export type Redaction = {
  readonly field: RedactedField;
  readonly originalExcerpt: string;
  readonly reason: string;
};

export type PersonalFilterResult<T> = {
  readonly filtered: T;
  readonly redactions: readonly Redaction[];
};

export type CreepinessReason =
  | "banned_category"
  | "private_info_reference"
  | "hyper_niche_surveillance"
  | "bribery_threshold"
  | "appearance_related";

export type CreepinessEvaluation = {
  readonly score: number;
  readonly passed: boolean;
  readonly flagged: readonly CreepinessReason[];
  readonly notes: string;
};
