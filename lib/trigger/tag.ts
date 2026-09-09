export type TagMatch =
  | { matched: true; title: string }
  | { matched: false };

const FEATURE_TAG = /^\s*\[(?:feat|feature)\]/i;

export function matchFeatureTag(title: string): TagMatch {
  const match = FEATURE_TAG.exec(title);
  if (!match) return { matched: false };
  return {
    matched: true,
    title: title.slice(match[0].length).trim(),
  };
}
