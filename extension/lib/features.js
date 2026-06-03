// Single source of truth for what's gated to Pro.
//
// Every Pro-only capability has an entry in FEATURES. The popup, options,
// and service-worker import this and call `canUse(featureKey, tier)`.
//
// Adding a new gated thing? Add a const here, then use it in code instead of
// hard-coding the rule. That keeps the upsell modal copy and the gate in sync.

import { MODELS } from './config.js';

// ── Free-plan caps ─────────────────────────────────────────────────────────
export const FREE_DAILY_POOL_LIMIT  = 5;       // pooled-API calls per day
export const FREE_MONTHLY_POOL_LIMIT = 0;      // unused (we count per day for free)
export const PRO_MONTHLY_POOL_LIMIT = 50;      // pooled-API calls per month
export const FREE_MAX_VIDEO_SECONDS = 30 * 60; // 30 min

// ── Feature keys ───────────────────────────────────────────────────────────
export const FEATURES = {
  // Output modes
  TIMESTAMPS:        'timestamps',
  CUSTOM_PROMPTS:    'customPrompts',
  EXPORT:            'export',
  UNLIMITED_HISTORY: 'unlimitedHistory',
  LONG_VIDEOS:       'longVideos',
  // Anything beyond the base models in this set is Pro.
  PREMIUM_MODELS:    'premiumModels',
};

const PRO_ONLY = new Set([
  FEATURES.TIMESTAMPS,
  FEATURES.CUSTOM_PROMPTS,
  FEATURES.EXPORT,
  FEATURES.UNLIMITED_HISTORY,
  FEATURES.LONG_VIDEOS,
  FEATURES.PREMIUM_MODELS,
]);

// Which model keys are free? Cheap/fast tiers only.
const FREE_MODELS = new Set(['auto', 'gemini', 'gpt', 'claude']);
// The remaining MODELS keys (geminiPro, gptPro, claudePro) are Pro-only.

export function isFreeModel(modelKey) {
  return FREE_MODELS.has(modelKey);
}

export function isProModel(modelKey) {
  if (!modelKey) return false;
  return MODELS[modelKey] && !FREE_MODELS.has(modelKey);
}

// Truthy if `tier` is allowed to use `featureKey`. Pass tier as 'free'|'pro'.
export function canUse(featureKey, tier) {
  if (tier === 'pro') return true;
  return !PRO_ONLY.has(featureKey);
}

// Human-readable label for a feature key (used in upsell modal).
export function featureLabel(featureKey) {
  switch (featureKey) {
    case FEATURES.TIMESTAMPS:        return 'tabTimestamps';
    case FEATURES.CUSTOM_PROMPTS:    return 'featCustomPrompts';
    case FEATURES.EXPORT:            return 'featExport';
    case FEATURES.UNLIMITED_HISTORY: return 'featUnlimitedHistory';
    case FEATURES.LONG_VIDEOS:       return 'featLongVideos';
    case FEATURES.PREMIUM_MODELS:    return 'featPremiumModels';
    default: return featureKey;
  }
}
