export type OutreachNote = {
  readonly subject?: string;
  readonly body: string;
  readonly toneMatched: string;
  readonly cta: string;
  readonly referencedGiftRank: 1 | 2 | 3;
  readonly referencedInsight: string;
  readonly characterCount: number;
};
