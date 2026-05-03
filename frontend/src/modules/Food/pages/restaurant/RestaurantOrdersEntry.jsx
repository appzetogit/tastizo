import OrdersMain from "./OrdersMain"
import { DesktopOrdersView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantOrdersEntry() {
  const isDesktop = useRestaurantDesktopView()
  return isDesktop ? <DesktopOrdersView /> : <OrdersMain />
}
