import { X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

export default function ReplaceCartDialog({
  open,
  onOpenChange,
  currentRestaurantName,
  nextRestaurantName,
  onConfirm,
  onCancel,
}) {
  const currentRestaurant = currentRestaurantName || "another restaurant"
  const nextRestaurant = nextRestaurantName || "this restaurant"

  const handleOpenChange = (nextOpen) => {
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      onCancel?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[28px] border-0 bg-white p-0 shadow-2xl sm:max-w-lg">
        <DialogHeader className="space-y-0 px-7 pb-3 pt-6 text-left">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-[2rem] font-black leading-none tracking-[-0.03em] text-neutral-900">
              Replace cart item?
            </DialogTitle>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-full p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
              aria-label="Close replace cart dialog"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-7 pb-6">
          <p className="text-[1.55rem] leading-[1.35] text-neutral-600">
            Your cart contains dishes from {currentRestaurant}. Do you want to discard the selection and add dishes from {nextRestaurant}?
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="h-14 rounded-2xl bg-[#fff1ea] text-xl font-extrabold text-[#ff6b00] hover:bg-[#ffe6d7] hover:text-[#ff6b00]"
            >
              No
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              className="h-14 rounded-2xl bg-[#ff6b00] text-xl font-extrabold text-white hover:bg-[#e96000]"
            >
              Replace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
