/**
 * Shared rules for persisting location and showing navbar lines.
 */

const COORD_RE = /^-?\d+\.\d+,\s*-?\d+\.\d+$/

/** True = do not write to localStorage / DB / broadcast (truly empty or coords-only junk). */
export function isUnpersistableLocation(loc) {
  if (!loc) return true
  const f = (loc.formattedAddress || "").trim()
  const a = (loc.address || "").trim()
  const ar = (loc.area || "").trim()
  const c = (loc.city || "").trim()

  if (f === "Select location" && a === "Select location" && (c === "Select location" || !c) && !ar) return true
  if (c === "Current Location" && f === "Select location" && a === "Select location" && !ar) return true
  if (COORD_RE.test(f) && c === "Current Location" && !ar && (!a || COORD_RE.test(a))) return true
  return false
}

/** Enough structured address to skip auto refetch (e.g. after "Use current location"). */
export function hasDetailedAddress(loc) {
  if (!loc) return false
  const f = (loc.formattedAddress || "").trim()
  if (!f || f === "Select location") return false
  if (COORD_RE.test(f)) return false
  const n = f.split(",").map((p) => p.trim()).filter(Boolean).length
  return n >= 4
}

/** Geocode / GPS result is OK to commit to state (allows city "Current Location" when formatted line is detailed). */
export function isAcceptableGeocodeResult(loc) {
  if (!loc || isUnpersistableLocation(loc)) return false
  const f = (loc.formattedAddress || "").trim()
  if (!f || f === "Select location" || COORD_RE.test(f)) return false
  if (hasDetailedAddress(loc)) return true
  const c = (loc.city || "").trim()
  return Boolean(c && c !== "Current Location" && c !== "Select location")
}

/** True if a comma segment is only an Open Location Code (e.g. PV6X+9XP), not a street name. */
export function isLikelyPlusCodeOnlySegment(s) {
  const t = (s || "").trim()
  if (!t.includes("+")) return false
  const core = t.replace(/\s/g, "")
  return (
    /^[2-9CFGHJMPQRVWX]{2,}\+[2-9CFGHJMPQRVWX]{2,}$/i.test(core) &&
    core.length <= 24
  )
}

/** Drop leading plus-code segments from Google's formatted_address so UI shows real street/area first. */
export function stripLeadingPlusCodeFromFormatted(str) {
  if (!str || typeof str !== "string") return ""
  const parts = str.split(",").map((p) => p.trim()).filter(Boolean)
  while (parts.length > 1 && isLikelyPlusCodeOnlySegment(parts[0])) {
    parts.shift()
  }
  if (parts.length === 1 && isLikelyPlusCodeOnlySegment(parts[0])) return ""
  return parts.join(", ")
}

/**
 * Remove repeated comma-separated segments (case-insensitive), e.g. duplicated city/state from API + DB fields.
 */
export function dedupeFormattedAddressLine(str) {
  if (!str || typeof str !== "string") return ""
  const parts = str
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, " ")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out.join(", ")
}

/** Primary / secondary lines for DesktopNavbar & mobile Navbar (street-level when present in formattedAddress). */
export function pickNavbarLocationLines(loc) {
  if (!loc) return { main: "Select", sub: "" }
  const city = (loc.city || "").trim()
  const state = (loc.state || "").trim()
  const formatted = (loc.formattedAddress || "").trim().replace(/,\s*India\s*$/i, "")
  let addr = (loc.address || "").trim()
  const mt = (loc.mainTitle || "").trim()
  const areaRaw = (loc.area || "").trim()
  const streetNum = (loc.streetNumber || "").trim()
  const streetName = (loc.street || "").trim()
  const houseRoad = [streetNum, streetName].filter(Boolean).join(" ").trim()

  const isCoords = (s) => COORD_RE.test((s || "").trim())

  const cityLc = city.toLowerCase()
  const isCityLike = (s) => {
    const v = (s || "").trim().toLowerCase()
    if (!v) return true
    if (!cityLc) return false
    return v === cityLc || v === `${cityLc} city` || v === `${cityLc} district`
  }

  const parts = formatted.split(",").map((p) => p.trim()).filter(Boolean)
  const stateLc = (state || "").toLowerCase()

  const adminNoise = /(tahsil|tehsil|taluka|sub-?district|mandal|county)$/i
  const segmentScore = (p) => {
    if (!p || p.length < 2 || p.length >= 80) return -1
    const pl = p.toLowerCase()
    if (isCityLike(p)) return -1
    if (stateLc && pl === stateLc) return -1
    if (/^india$/i.test(pl)) return -1
    if (/^\d{5,6}$/.test(pl.replace(/\s/g, ""))) return -1
    let s = 0
    if (/\d/.test(p)) s += 5
    if (adminNoise.test(p.trim())) s -= 4
    if (/road|street|nagar|lane|colony|sector|plot/i.test(pl)) s += 2
    if (p.length > 18 && /\b\d{5,6}\b/.test(p)) s -= 4
    return s
  }
  const candidates = parts.filter((p) => segmentScore(p) >= 0)
  const firstLocal =
    candidates.length > 0
      ? candidates.reduce((a, b) => (segmentScore(b) > segmentScore(a) ? b : a))
      : ""

  let main = mt || ""
  if (!main || isCityLike(main) || isCoords(main)) {
    main = houseRoad && !isCoords(houseRoad) && !isCityLike(houseRoad) ? houseRoad : ""
  }
  if (!main || isCityLike(main) || isCoords(main)) {
    main = addr && !isCoords(addr) ? addr : ""
  }
  if (!main || isCityLike(main) || isCoords(main)) {
    main = firstLocal || ""
  }
  if (!main || isCityLike(main)) {
    main = areaRaw && !isCityLike(areaRaw) ? areaRaw : ""
  }
  if (!main || isCityLike(main)) {
    main = city || parts[0] || "Select"
  }

  const sub = city && state ? `${city}, ${state}` : city || state || ""
  return { main: main || "Select", sub }
}
