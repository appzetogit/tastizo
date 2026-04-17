import mongoose from "mongoose";

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeAddonList(addons = []) {
  if (!Array.isArray(addons)) return [];

  return addons
    .map((addon) => ({
      addonId: toSafeString(addon?.addonId || addon?.id || addon?._id),
      optionId: toSafeString(
        addon?.optionId || addon?.valueId || addon?.selectedOptionId,
      ),
      name: addon?.name || "",
      optionName: addon?.optionName || addon?.value || "",
      price: toSafeNumber(addon?.price, 0),
      quantity: Math.max(1, Math.round(toSafeNumber(addon?.quantity, 1))),
    }))
    .filter((addon) => addon.addonId || addon.name)
    .sort((left, right) =>
      stableStringify(left).localeCompare(stableStringify(right)),
    );
}

export function buildCartLineKey(item = {}) {
  const baseId = toSafeString(item?.itemId || item?.id);
  const variationId = toSafeString(item?.selectedVariation?.variationId);
  const addonKey = stableStringify(
    normalizeAddonList(item?.selectedAddons || item?.addons || item?.addOns || []),
  );
  const customizationKey = stableStringify(
    item?.customizations || item?.customization || null,
  );
  const instructions = toSafeString(
    item?.specialInstructions || item?.instructions || item?.note,
  ).toLowerCase();

  return [baseId, variationId, addonKey, customizationKey, instructions].join(
    "::",
  );
}

export function normalizeCartItem(item = {}, fallback = {}) {
  const itemId = toSafeString(item?.itemId || item?.id);
  if (!itemId) {
    throw new Error("Cart item is missing itemId.");
  }

  const restaurantId = toSafeString(
    item?.restaurantId ||
      item?.restaurant?._id ||
      item?.restaurant?.id ||
      item?.restaurant?.restaurantId ||
      fallback.restaurantId,
  );
  const restaurantName =
    item?.restaurantName || item?.restaurant || fallback.restaurantName || "";

  if (!restaurantId && !restaurantName) {
    throw new Error(`Cart item ${itemId} is missing restaurant ownership.`);
  }

  const selectedVariation =
    item?.selectedVariation && toSafeString(item.selectedVariation.variationId)
      ? {
          variationId: toSafeString(item.selectedVariation.variationId),
          variationName: item.selectedVariation.variationName || "",
          price: toSafeNumber(
            item.selectedVariation.price,
            toSafeNumber(item?.price, 0),
          ),
        }
      : null;

  const normalizedItem = {
    itemId,
    name: item?.name || "",
    price: toSafeNumber(item?.price, selectedVariation?.price || 0),
    quantity: Math.max(1, Math.round(toSafeNumber(item?.quantity, 1))),
    image: item?.image || item?.imageUrl || "",
    description: item?.description || "",
    isVeg: item?.isVeg !== false,
    subCategory: item?.subCategory || "",
    restaurantId: restaurantId || "",
    restaurantName,
    selectedVariation,
    selectedAddons: normalizeAddonList(
      item?.selectedAddons || item?.addons || item?.addOns || [],
    ),
    customizations: item?.customizations || item?.customization || null,
    specialInstructions:
      item?.specialInstructions || item?.instructions || item?.note || "",
    pricingSnapshot: item?.pricingSnapshot || null,
  };

  return {
    ...normalizedItem,
    lineKey: buildCartLineKey(normalizedItem),
  };
}

export function dedupeCartItems(items = [], fallback = {}) {
  const mergedItems = new Map();

  for (const item of items || []) {
    const normalizedItem = normalizeCartItem(item, fallback);
    const existingItem = mergedItems.get(normalizedItem.lineKey);

    if (existingItem) {
      existingItem.quantity += normalizedItem.quantity;
      continue;
    }

    mergedItems.set(normalizedItem.lineKey, normalizedItem);
  }

  return Array.from(mergedItems.values());
}

function resolveRestaurantIdentity(items = [], payload = {}) {
  const restaurantId =
    toSafeString(payload?.restaurantId) ||
    toSafeString(items[0]?.restaurantId) ||
    "";
  const restaurantName =
    payload?.restaurantName || items[0]?.restaurantName || items[0]?.restaurant || "";

  return {
    restaurantId: restaurantId || null,
    restaurantName: restaurantName || null,
  };
}

export function normalizeCartPayload(payload = {}) {
  const items = dedupeCartItems(payload?.items || [], {
    restaurantId: payload?.restaurantId,
    restaurantName: payload?.restaurantName,
  });
  const identity = resolveRestaurantIdentity(items, payload);

  if (items.length > 0) {
    const invalidRestaurantItem = items.find((item) => {
      if (identity.restaurantId && item.restaurantId) {
        return String(item.restaurantId) !== String(identity.restaurantId);
      }

      if (identity.restaurantName && item.restaurantName) {
        return (
          String(item.restaurantName).trim().toLowerCase() !==
          String(identity.restaurantName).trim().toLowerCase()
        );
      }

      return false;
    });

    if (invalidRestaurantItem) {
      throw new Error(
        "Cart contains items from multiple restaurants and cannot be persisted.",
      );
    }
  }

  return {
    items,
    restaurantId: identity.restaurantId,
    restaurantName: identity.restaurantName,
    zoneId: toSafeString(payload?.zoneId) || null,
  };
}

export function mergeCartItems(existingItems = [], incomingItems = []) {
  const mergedItems = new Map();

  for (const item of existingItems || []) {
    const normalizedItem = normalizeCartItem(item, {
      restaurantId: item?.restaurantId,
      restaurantName: item?.restaurantName || item?.restaurant,
    });
    mergedItems.set(normalizedItem.lineKey, { ...normalizedItem });
  }

  let mergedCount = 0;
  for (const item of incomingItems || []) {
    const normalizedItem = normalizeCartItem(item, {
      restaurantId: item?.restaurantId,
      restaurantName: item?.restaurantName || item?.restaurant,
    });
    const existingItem = mergedItems.get(normalizedItem.lineKey);

    if (existingItem) {
      existingItem.quantity += normalizedItem.quantity;
    } else {
      mergedItems.set(normalizedItem.lineKey, { ...normalizedItem });
    }

    mergedCount += 1;
  }

  return {
    items: Array.from(mergedItems.values()),
    mergedCount,
  };
}

export function sanitizeMergedGuestSessions(guestSessions = [], nextGuestSessionId) {
  const normalized = new Set(
    (guestSessions || [])
      .map((guestSessionId) => toSafeString(guestSessionId))
      .filter(Boolean),
  );

  if (nextGuestSessionId) {
    normalized.add(toSafeString(nextGuestSessionId));
  }

  return Array.from(normalized).slice(-20);
}

export function buildCartResponse(cartDoc, user) {
  const userId = String(user?.id || user?._id || "");
  const ownerPhone = user?.phone || cartDoc?.ownerPhone || null;

  return {
    id: cartDoc?._id ? String(cartDoc._id) : null,
    owner: {
      type: "authenticated",
      userId,
      phone: ownerPhone,
    },
    restaurantId: cartDoc?.restaurantId || null,
    restaurantName: cartDoc?.restaurantName || null,
    zoneId: cartDoc?.zoneId || null,
    items: (cartDoc?.items || []).map((item) => ({
      id: item.itemId,
      itemId: item.itemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image || "",
      restaurant: item.restaurantName || cartDoc?.restaurantName || "",
      restaurantId: item.restaurantId || cartDoc?.restaurantId || "",
      description: item.description || "",
      isVeg: item.isVeg !== false,
      subCategory: item.subCategory || "",
      selectedVariation:
        item.selectedVariation?.variationId || item.selectedVariation?.variationName
          ? {
              variationId: item.selectedVariation.variationId || "",
              variationName: item.selectedVariation.variationName || "",
              price: toSafeNumber(item.selectedVariation.price, item.price),
            }
          : null,
      selectedAddons: item.selectedAddons || [],
      customizations: item.customizations || null,
      specialInstructions: item.specialInstructions || "",
      pricingSnapshot: item.pricingSnapshot || null,
    })),
    mergedGuestSessions: cartDoc?.mergedGuestSessions || [],
    updatedAt: cartDoc?.updatedAt || null,
    createdAt: cartDoc?.createdAt || null,
  };
}

export function ensureUserObjectId(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid authenticated user id.");
  }
  return new mongoose.Types.ObjectId(userId);
}
