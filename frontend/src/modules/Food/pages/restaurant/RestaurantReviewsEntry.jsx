import Feedback from "./Feedback"
import { DesktopReviewsView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantReviewsEntry() {
  const isDesktop = useRestaurantDesktopView()
  return isDesktop ? <DesktopReviewsView /> : <Feedback />
}
