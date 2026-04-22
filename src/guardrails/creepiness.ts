import type { GiftRecommendation } from "../agents/gifting/gift.types";
import type { CreepinessEvaluation, CreepinessReason } from "./guardrails.types";

const MAX_SAFE_SCORE = 2;
const BRIBERY_THRESHOLD_USD = 200;

const BANNED_CATEGORIES: readonly { keywords: readonly string[]; reason: CreepinessReason }[] = [
  { keywords: ["shirt", "pants", "jacket", "dress", "hoodie", "sweater", "jeans", "socks", "shoes", "sneakers", "apparel", "clothing"], reason: "banned_category" },
  { keywords: ["necklace", "ring", "bracelet", "earring", "jewelry", "watch "], reason: "banned_category" },
  { keywords: ["perfume", "cologne", "fragrance", "scent"], reason: "banned_category" },
  { keywords: ["skincare", "makeup", "lotion", "moisturizer", "shampoo", "conditioner", "cosmetic"], reason: "banned_category" },
  { keywords: ["weight loss", "diet plan", "supplement", "protein powder", "vitamins", "fitness tracker"], reason: "banned_category" },
  { keywords: ["hair", "beard", "shaving", "razor"], reason: "appearance_related" },
];

const PRIVATE_INFO_PATTERNS: readonly RegExp[] = [
  /\b(spouse|wife|husband|partner)\b/i,
  /\b(kid|kids|daughter|son|child|children)\b/i,
  /\b(health|medical|illness|diagnosis|prescription)\b/i,
  /\b(home address|phone number|personal email)\b/i,
];

const HYPER_NICHE_MARKERS: readonly RegExp[] = [
  /\bprivate\b/i,
  /\b(saw in|noticed in|picked up from) your? (dm|private|bedroom|home)\b/i,
  /\b(stalking|surveillance)\b/i,
];

export function evaluateCreepiness(gift: GiftRecommendation): CreepinessEvaluation {
  const flagged: CreepinessReason[] = [];
  const notes: string[] = [];

  const haystack = `${gift.name}\n${gift.description}\n${gift.conversationOpener}`.toLowerCase();

  for (const banned of BANNED_CATEGORIES) {
    for (const keyword of banned.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        if (!flagged.includes(banned.reason)) flagged.push(banned.reason);
        notes.push(`banned keyword: "${keyword}"`);
        break;
      }
    }
  }

  for (const pattern of PRIVATE_INFO_PATTERNS) {
    if (pattern.test(haystack)) {
      if (!flagged.includes("private_info_reference")) flagged.push("private_info_reference");
      notes.push(`private info pattern matched: ${pattern.source}`);
      break;
    }
  }

  for (const pattern of HYPER_NICHE_MARKERS) {
    if (pattern.test(haystack)) {
      if (!flagged.includes("hyper_niche_surveillance")) flagged.push("hyper_niche_surveillance");
      notes.push(`surveillance pattern matched: ${pattern.source}`);
      break;
    }
  }

  if (!Number.isFinite(gift.estimatedPriceUsd) || gift.estimatedPriceUsd < 0) {
    flagged.push("bribery_threshold");
    notes.push(`non-finite or negative price: ${gift.estimatedPriceUsd}`);
  } else if (gift.estimatedPriceUsd > BRIBERY_THRESHOLD_USD) {
    flagged.push("bribery_threshold");
    notes.push(`price ${gift.estimatedPriceUsd} exceeds bribery threshold ${BRIBERY_THRESHOLD_USD}`);
  }

  const modelScore = Number.isFinite(gift.creepinessScore) ? gift.creepinessScore : 5;
  const ruleBoost = flagged.length;
  const score = Math.max(1, Math.min(5, modelScore + ruleBoost));
  const passed = score <= MAX_SAFE_SCORE && flagged.length === 0;

  return {
    score,
    passed,
    flagged,
    notes: notes.join("; "),
  };
}
