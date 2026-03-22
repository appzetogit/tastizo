/**
 * Session-scoped caches (same tab until reload). Used to skip repeat API work when navigating back.
 */

const routeMap = new Map()

export function sessionRouteGet(key) {
  return routeMap.get(key)
}

export function sessionRouteSet(key, value) {
  routeMap.set(key, value)
}

export const SESSION_KEYS = {
  categoriesPublic: "user:api:categories/public",
}

let homeDiscovery = null

export function getHomeDiscoveryCache() {
  return homeDiscovery
}

export function patchHomeDiscoveryCache(partial) {
  homeDiscovery = { ...(homeDiscovery || {}), ...partial }
}

export function clearHomeDiscoveryCache() {
  homeDiscovery = null
}

export function clearAllUserNavSessionCache() {
  routeMap.clear()
  homeDiscovery = null
}

export function serializeHomeFilters(filters) {
  const af = filters?.activeFilters
  const arr = af instanceof Set ? [...af].sort() : Array.isArray(af) ? [...af].sort() : []
  return JSON.stringify({
    sortBy: filters?.sortBy ?? null,
    selectedCuisine: filters?.selectedCuisine ?? null,
    activeFilters: arr,
  })
}
