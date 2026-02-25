# UI-Related Bugs Report — Tastizo Frontend

This document lists **100 UI-related bugs** identified in the Tastizo frontend codebase (React + Vite, Tailwind, shadcn/Radix). Each entry includes location and a short description. Prioritize by severity (P0/P1/P2) and area (accessibility, layout, state, performance).

---

## 1. React list keys (index / unstable keys)

| # | File | Line(s) | Issue |
|---|------|--------|--------|
| 1 | `module/usermain/pages/HomePage.jsx` | 600 | `key={index}` on list items; use stable id if available. |
| 2 | `module/admin/pages/reports/FoodReport.jsx` | 269 | `key={i}` on static divs; prefer semantic key. |
| 3 | `module/user/pages/orders/OrderTracking.jsx` | 1148 | `key={index}` in list; can cause wrong reconciliation if list reorders. |
| 4 | `module/restaurant/pages/AllOrdersPage.jsx` | 849 | `key={index}` on list items. |
| 5 | `module/user/pages/auth/OTP.jsx` | 287 | `key={index}` on OTP inputs; acceptable for fixed-length list but document. |
| 6 | `module/user/pages/Home.jsx` | 147, 1207, 1400, 1462, 2571, 2631, 2711 | Multiple `key={index}` or `key={i}`; use `category.id` or stable id where possible. |
| 7 | `module/delivery/pages/PocketPage.jsx` | 796 | `key={index}` on slides/items. |
| 8 | `module/restaurant/pages/CreateOffers.jsx` | 259, 265 | `key={index}` and nested `key={i}`; ensure no duplicate keys. |
| 9 | `module/admin/pages/settings/Gallery.jsx` | 246, 279, 320 | `key={index}` on gallery items; use item id/url if available. |
| 10 | `module/restaurant/pages/OutletInfo.jsx` | 651 | `key={index}` on list. |
| 11 | `components/ui/date-range-calendar.tsx` | 165 | `key={index}` on calendar cells. |
| 12 | `module/admin/pages/ContactMessages.jsx` | 92–96, 485 | Stars use `key={i}`; list row uses `key={index}`. |
| 13 | `module/user/pages/Dining.jsx` | 412 | `key={index}` on list. |
| 14 | `module/restaurant/pages/FoodDetailsPage.jsx` | 441, 462, 479, 496, 546 | Variations/tags/nutrition/allergies/reviews use `key={index}` or `key={i}`. |
| 15 | `module/restaurant/pages/auth/OTP.jsx` | 294 | `key={index}` on OTP inputs. |
| 16 | `module/delivery/pages/auth/Welcome.jsx` | 196, 243, 298, 358 | Multiple `key={i}` on lists. |
| 17 | `module/restaurant/pages/DiningManagement.jsx` | 365 | `key={i}` on gallery; use url/id. |
| 18 | `module/delivery/pages/UpdatesPage.jsx` | 495, 568, 646 | `key={index}` on video/story UI. |
| 19 | `module/admin/pages/auth/AdminForgotPassword.jsx` | 291 | `key={index}` on OTP inputs. |
| 20 | `module/admin/pages/Customers.jsx` | 554, 585 | Addresses/orders use `key={index}`; use id if available. |
| 21 | `module/user/components/Footer.jsx` | 154, 171, 188 | Company/Support/User links use `key={index}`; use `link.href` or id. |
| 22 | `module/restaurant/pages/HubFinance.jsx` | 835, 898, 925 | `key={index}` and `key={order.orderId \|\| index}`; prefer stable id. |
| 23 | `module/user/pages/profile/About.jsx` | 150 | `key={index}` on list. |
| 24 | `module/delivery/pages/auth/OTP.jsx` | 500 | `key={index}` on OTP inputs. |
| 25 | `module/delivery/pages/SelectDropLocation.jsx` | 90 | `key={index}` on list. |
| 26 | `module/restaurant/components/NewOrderNotification.jsx` | 71 | `key={index}` on items. |
| 27 | `module/restaurant/pages/CreatePercentageDiscount.jsx` | 910 | `key={index}` on list. |
| 28 | `module/restaurant/pages/EditFoodPage.jsx` | 591, 634, 677 | Multiple `key={index}`. |
| 29 | `module/user/pages/cart/Cart.jsx` | 1426, 1988, 2034 | Skeleton and list use `key={i}`. |
| 30 | `module/user/pages/GiftCards.jsx` | 357 | `key={i}` on static [1,2,3] list. |
| 31 | `module/restaurant/pages/HubMenu.jsx` | 2162 | `key={index}` on menu item. |
| 32 | `module/restaurant/pages/UpdateReplyPage.jsx` | 105 | `key={i}`. |
| 33 | `module/delivery/pages/Payout.jsx` | 150 | `key={withdrawal.id \|\| index}`; ensure id is unique. |
| 34 | `module/restaurant/pages/auth/SignupEmail.jsx` | 397 | `key={index}`. |
| 35 | `module/delivery/pages/TermsAndConditions.jsx` | 68 | `key={index}`. |
| 36 | `module/delivery/pages/Earnings.jsx` | 658, 678, 697, 757, 823 | Multiple `key={i}` / `key={index}`. |
| 37 | `module/delivery/pages/PocketDetails.jsx` | 304 | `key={orderId \|\| index}`. |
| 38 | `module/delivery/pages/TipsStatement.jsx` | 133 | `key={index}`. |
| 39 | `module/user/pages/restaurants/RestaurantDetails.jsx` | 2081, 2893, 2915 | `key={index}` in lists. |
| 40 | `module/usermain/pages/OrderDetailsPage.jsx` | 247 | `key={index}`. |
| 41 | `module/delivery/pages/DeductionStatement.jsx` | 133 | `key={index}`. |
| 42 | `module/delivery/pages/PickupDirectionsPage.jsx` | 411, 717 | `key={\`route-${index}\`}` and `key={i}`. |
| 43 | `module/admin/components/AdminSidebar.jsx` | 337, 374, 390, 641 | Menu items use `key={index}`; use route/id. |
| 44 | `module/restaurant/pages/OrdersMain.jsx` | 1413, 1564 | `key={index}` on list items. |
| 45 | `module/user/pages/Wallet.jsx` | 279 | `key={i}`. |
| 46 | `module/user/pages/dining/TableBookingConfirmation.jsx` | 242 | `key={i}`. |
| 47 | `module/user/pages/ProductDetail.jsx` | 242, 481 | `key={i}` and `key={index}`. |
| 48 | `module/restaurant/pages/OrderDetails.jsx` | 679, 739 | `key={index}`. |
| 49 | `module/admin/components/orders/ViewOrderDetectDeliveryDialog.jsx` | 164 | `key={index}`. |
| 50 | `module/restaurant/pages/Inventory.jsx` | 566 | `key={index}`. |
| 51 | `components/ui/carousel.tsx` | 178 | `key={index}` on carousel slides. |
| 52 | `module/restaurant/pages/ExploreMore.jsx` | 1246 | `key={index}`. |
| 53 | `module/delivery/pages/TripHistory.jsx` | 273, 295 | `key={index}`. |
| 54 | `module/delivery/pages/TimeOnOrders.jsx` | 219, 239 | `key={index}`. |
| 55 | `module/restaurant/pages/RestaurantConfigPage.jsx` | 259, 296, 333, 499 | Cuisines/characteristics/tags/slots use `key={index}`. |
| 56 | `module/admin/pages/settings/AboutUs.jsx` | 232 | `key={index}` on cards. |
| 57 | `module/restaurant/pages/auth/Welcome.jsx` | 269 | `key={index}`. |
| 58 | `module/delivery/pages/YourReferrals.jsx` | 130, 197 | `key={index}`. |
| 59 | `module/user/pages/dining/DiningRestaurantDetails.jsx` | 414 | `key={i}` on image; second img has no key (inside conditional). |
| 60 | `module/delivery/pages/PrivacyPolicy.jsx` | 76 | `key={index}`. |
| 61 | `module/restaurant/pages/ItemDetailsPage.jsx` | 886 | `key={index}`. |
| 62 | `module/restaurant/pages/RushHour.jsx` | 83 | `key={index}`. |
| 63 | `module/restaurant/pages/PhoneNumbersPage.jsx` | 417 | `key={index}`. |
| 64 | `module/usermain/pages/FoodDetailPage.jsx` | 198 | `key={index}`. |
| 65 | `module/delivery/pages/DeliveryHome.jsx` | 8329, 8607 | `key={index}` on large list and list items. |
| 66 | `module/admin/components/orders/ViewOrderDialog.jsx` | 257 | `key={index}`. |
| 67 | `module/admin/pages/system/JoinUsPageSetup.jsx` | 157 | `key={index}`. |
| 68 | `module/restaurant/pages/auth/ForgotPassword.jsx` | 285 | `key={index}` on OTP. |
| 69 | `module/admin/pages/auth/AdminSignup.jsx` | 403 | `key={index}`. |
| 70 | `module/restaurant/components/BottomNavOrders.jsx` | 223 | `key={i}`. |
| 71 | `module/restaurant/pages/ToHub.jsx` | 1225, 1558 | `key={section.title}` in two maps; duplicate titles would duplicate keys. |
| 72 | `module/restaurant/pages/Onboarding.jsx` | 706 | `key={i}` on step indicators. |
| 73 | `components/ui/week-calendar.tsx` | 129 | `key={index}`. |
| 74 | `module/delivery/pages/PocketStatement.jsx` | 232 | `key={orderId \|\| index}`. |
| 75 | `module/restaurant/pages/OrderDetails.jsx` | 679, 739 | `key={index}`. |
| 76 | `module/admin/pages/employees/EmployeeRole.jsx` | 445 | `role.modules.map(..., key={idx})`; index as key. |

---

## 2. Accessibility

| # | File | Line(s) | Issue |
|---|------|--------|--------|
| 77 | `module/user/pages/dining/DiningRestaurantDetails.jsx` | 414, 417 | Images use `alt=""`; should describe content (e.g. restaurant photo). |
| 78 | `module/manageOutlet/components/PhotoManager.jsx` | 103 | `alt=""` on photo; add descriptive alt. |
| 79 | `module/user/pages/dining/TableBookingSuccess.jsx` | 84 | `alt=""` on image. |
| 80 | `module/user/pages/dining/MyBookings.jsx` | 61 | `alt=""` on booking image. |
| 81 | `module/restaurant/pages/DiningManagement.jsx` | 366 | `alt=""` on gallery image. |
| 82 | `module/delivery/pages/PickupDirectionsPage.jsx` | - | Ensure interactive elements have focus and aria where needed. |
| 83 | App-wide | - | Very few `aria-*` or `role=` usages; modals/dialogs and custom controls need ARIA. |
| 84 | App-wide | - | Only one `tabIndex` usage (AdminHome); keyboard nav and focus order likely incomplete. |

---

## 3. Buttons and forms

| # | File | Line(s) | Issue |
|---|------|--------|--------|
| 85 | `module/usermain/pages/CheckoutPage.jsx` | 100 | "Change Address" button has no `type` and no `onClick`; non-functional. |
| 86 | `module/usermain/pages/CheckoutPage.jsx` | 220, 227, 234, 239, 243 | Buttons without `type="button"`; inside form may submit. |
| 87 | `module/usermain/pages/HomePage.jsx` | 500, 516, 725, 888, 899, 911 | Buttons without `type="button"`. |
| 88 | `module/admin/pages/system/OfflinePaymentSetup.jsx` | 172, 199, 205 | Buttons without explicit `type`. |
| 89 | `module/delivery/pages/DeliveryHome.jsx` | 8308, 9686, 9816 | Buttons without `type`. |
| 90 | `module/admin/pages/delivery-partners/EarningAddon.jsx` | 314 | Button without `type`. |
| 91 | `module/restaurant/pages/Feedback.jsx` | 787, 793, 844, 869, 1001, 1106 | Multiple buttons without `type="button"`. |
| 92 | `module/admin/components/orders/OrdersTopbar.jsx` | 42, 48, 71, 85 | Buttons without `type`. |
| 93 | `module/restaurant/pages/HelpCentre.jsx` | 80, 83 | Icon buttons without `type` and no `aria-label`. |
| 94 | `module/restaurant/pages/DeliverySettings.jsx` | 182 | Button without `type`. |
| 95 | `module/user/pages/Top10.jsx` | 64 | Button without `type`. |
| 96 | `module/restaurant/pages/OrdersMain.jsx` | 1679, 2722 | Buttons without `type="button"`. |

---

## 4. Layout, stacking, overflow

| # | File | Line(s) | Issue |
|---|------|--------|--------|
| 97 | `module/user/components/LocationSelectorOverlay.jsx` | 2188, 2392 | `z-[10000]` and `z-[9999]`; very high z-index can conflict with other overlays. |
| 98 | `module/admin/pages/restaurant/AddZone.jsx` | 397 | Comment says "Lower z-index so new zone appears on top" but `zIndex: 0`; confusing and may not achieve intent. |
| 99 | `module/delivery/pages/DeliveryHome.jsx` | Multiple | Many fixed z-index values (10–200); risk of modals/overlays stacking incorrectly. |
| 100 | Multiple (e.g. Home, Cart, RestaurantDetails) | - | Heavy use of `overflow-hidden` / `overflow-x-auto`; can clip content or cause scroll issues on small viewports. |

---

## Summary

- **Keys:** 1–76 — Prefer stable IDs over index where list can reorder or items are dynamic.
- **Accessibility:** 77–84 — Add descriptive `alt`, ARIA, and keyboard/focus support.
- **Buttons/forms:** 85–96 — Add `type="button"` and fix non-functional buttons (e.g. "Change Address").
- **Layout/stacking:** 97–100 — Rationalize z-index and review overflow usage.

**Suggested order of work:** Fix non-functional buttons (85) and form submit risk (86–96), then list keys in high-traffic lists (e.g. Cart, Home, DeliveryHome), then accessibility (alt, ARIA), then z-index/overflow.
