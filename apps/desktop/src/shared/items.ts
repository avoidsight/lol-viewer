const nonBuildItemIds = new Set([
  2052, 2054, // Poro-Snax variants
  3330, 3340, 3341, 3363, 3364 // ward and vision trinkets
]);

export function isBuildItem(itemId: number): boolean {
  return itemId > 0 && !nonBuildItemIds.has(itemId);
}
