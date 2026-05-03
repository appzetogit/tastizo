import HubMenu from "./HubMenu"
import { DesktopMenuView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantMenuEntry() {
  const isDesktop = useRestaurantDesktopView()
  return isDesktop ? <DesktopMenuView /> : <HubMenu />
}
