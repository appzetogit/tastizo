const CATEGORY_ALIAS_MAP = {
  maggie: ["maggie", "maggi", "masala maggie", "cheese maggie", "veg maggie"],
  maggi: ["maggie", "maggi", "masala maggi", "cheese maggi", "veg maggi"],
  pizza: ["pizza", "margherita", "farmhouse", "veg pizza", "cheese pizza"],
  cake: ["cake", "chocolate cake", "black forest", "pineapple cake"],
  dosa: ["dosa", "masala dosa", "plain dosa", "cheese dosa"],
  burger: ["burger", "veg burger", "cheese burger", "aloo burger"],
  pasta: ["pasta", "white sauce", "red sauce", "alfredo", "arrabbiata"],
  biryani: ["biryani", "biriyani", "veg biryani", "chicken biryani"],
  momo: ["momo", "momos", "steamed momo", "fried momo"],
  momos: ["momo", "momos", "steamed momos", "fried momos"],
  sandwich: ["sandwich", "grilled sandwich", "club sandwich"],
  noodles: ["noodle", "noodles", "hakka", "chowmein"],
  roll: ["roll", "rolls", "kathi roll", "frankie"],
  paneer: ["paneer", "paneer tikka", "paneer butter masala"],
}

export const normalizeCategoryText = (value) => {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const compactText = (value) => normalizeCategoryText(value).replace(/\s+/g, "")

const singularize = (value) => {
  const normalized = normalizeCategoryText(value)
  if (normalized.endsWith("ies") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}y`
  }
  if (normalized.endsWith("es") && normalized.length > 3) {
    return normalized.slice(0, -2)
  }
  if (normalized.endsWith("s") && normalized.length > 3) {
    return normalized.slice(0, -1)
  }
  return normalized
}

const getTextVariants = (value) => {
  const normalized = normalizeCategoryText(value)
  const singular = singularize(normalized)
  return [...new Set([normalized, singular, compactText(normalized)].filter(Boolean))]
}

const getCategoryId = (category) => category?.slug || category?.id || ""

export const getCategoryKeywords = (category) => {
  const name = category?.name || ""
  const id = getCategoryId(category)
  const baseValues = [name, id, id.replace(/-/g, " ")]

  const baseKeys = baseValues.flatMap(getTextVariants)
  const aliasKeys = baseKeys.flatMap((key) => CATEGORY_ALIAS_MAP[key] || [])
  const wordKeys = normalizeCategoryText(name)
    .split(" ")
    .filter((word) => word.length > 2)

  return [...new Set([...baseValues, ...baseKeys, ...aliasKeys, ...wordKeys].flatMap(getTextVariants))]
}

export const buildCategoryKeywordMap = (categories = []) => {
  return categories.reduce((map, category) => {
    const categoryId = getCategoryId(category)
    if (categoryId) {
      map[categoryId] = getCategoryKeywords(category)
    }
    return map
  }, {})
}

export const categoryMatchesText = (text, keywords = []) => {
  const textVariants = getTextVariants(text)
  if (textVariants.length === 0 || keywords.length === 0) return false

  return keywords.some((keyword) => {
    const keywordVariants = getTextVariants(keyword)
    return keywordVariants.some((variant) => {
      if (!variant || variant.length < 2) return false
      return textVariants.some((textValue) => {
        if (textValue === variant) return true
        if (textValue.includes(variant)) return true
        return variant.length > 3 && variant.includes(textValue)
      })
    })
  })
}

const levenshteinDistance = (a, b) => {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      )
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[b.length]
}

const scoreCategory = (category, query) => {
  const normalizedQuery = normalizeCategoryText(query)
  if (!normalizedQuery) return 0

  const keywords = getCategoryKeywords(category)
  const scores = keywords.map((keyword) => {
    if (keyword === normalizedQuery) return 100
    if (keyword.startsWith(normalizedQuery)) return 90
    if (keyword.includes(normalizedQuery)) return 75
    if (normalizedQuery.includes(keyword) && keyword.length > 2) return 65

    const distance = levenshteinDistance(compactText(keyword), compactText(normalizedQuery))
    const maxLength = Math.max(compactText(keyword).length, compactText(normalizedQuery).length)
    const similarity = maxLength ? 1 - distance / maxLength : 0
    return similarity >= 0.62 ? Math.round(similarity * 60) : 0
  })

  return Math.max(...scores, 0)
}

export const getCategorySuggestions = (categories = [], query, limit = 4) => {
  const normalizedQuery = normalizeCategoryText(query)
  if (!normalizedQuery) return []

  const seen = new Set()
  return categories
    .filter((category) => getCategoryId(category) !== "all")
    .map((category) => ({
      category,
      score: scoreCategory(category, normalizedQuery),
    }))
    .filter(({ category, score }) => {
      const categoryId = getCategoryId(category)
      if (score <= 0 || seen.has(categoryId)) return false
      seen.add(categoryId)
      return true
    })
    .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name))
    .slice(0, limit)
    .map(({ category }) => category)
}
