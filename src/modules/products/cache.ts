import { unstable_cache as nextCache, revalidateTag } from "next/cache";

// Shared shop-scoped cache helper — every entity that wants a cached
// list follows the same tag shape (`${entity}:${shopId}`) without
// each action re-deriving it by hand. Two halves:
//
//   cachedShopQuery(entity, shopId, keyParts, fn) — wraps a read
//   invalidateShopCache(entity, shopId)            — call after any
//     write to that entity so the next read is fresh
//
// Using this instead of calling unstable_cache/revalidateTag directly
// means a new entity can't forget the invalidation call silently —
// the tag is derived the same way on both sides.
export function shopCacheTag(entity: string, shopId: string) {
  return `${entity}:${shopId}`;
}

export function cachedShopQuery<T>(
  entity: string,
  shopId: string,
  keyParts: (string | number | boolean)[],
  fn: () => Promise<T>,
  revalidateSeconds = 60
): Promise<T> {
  return nextCache(fn, [entity, shopId, ...keyParts.map(String)], {
    tags: [shopCacheTag(entity, shopId)],
    revalidate: revalidateSeconds,
  })();
}

export function invalidateShopCache(entity: string, shopId: string) {
  revalidateTag(shopCacheTag(entity, shopId));
}
