import AllOrdersPage from "./AllOrdersPage"
import { DesktopOrderHistoryView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantOrderHistoryEntry() {
  const isDesktop = useRestaurantDesktopView()
  return isDesktop ? <DesktopOrderHistoryView /> : <AllOrdersPage />
}
