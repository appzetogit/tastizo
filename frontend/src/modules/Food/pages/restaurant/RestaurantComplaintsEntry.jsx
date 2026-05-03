import { Navigate } from "react-router-dom"
import { DesktopComplaintsView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantComplaintsEntry() {
  const isDesktop = useRestaurantDesktopView()

  if (isDesktop) {
    return <DesktopComplaintsView />
  }

  return <Navigate to="/restaurant/feedback?tab=complaints" replace />
}
