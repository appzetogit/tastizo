import { CirclePercent } from "lucide-react"
import { DesktopOffersView } from "@food/components/restaurant/RestaurantDesktopViews"
import { useRestaurantDesktopView } from "@food/components/restaurant/RestaurantDesktopShell"

export default function RestaurantOffersPage() {
  const isDesktop = useRestaurantDesktopView()

  if (isDesktop) {
    return <DesktopOffersView />
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <CirclePercent className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold text-slate-900">Offers</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-600">
          The full offers workspace is now available on desktop. Open this page on a larger screen to manage campaigns in the new layout.
        </p>
      </div>
    </div>
  )
}
