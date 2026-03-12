import { X } from "lucide-react"

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Ordered", label: "Ordered" },
  { value: "Restaurant Accepted", label: "Restaurant Accepted" },
  { value: "Rejected", label: "Rejected" },
  { value: "Delivery Boy Assigned", label: "Delivery Boy Assigned" },
  { value: "Delivery Boy Reached Pickup", label: "Delivery Boy Reached Pickup" },
  { value: "Order ID Accepted", label: "Order ID Accepted" },
  { value: "Reached Drop", label: "Reached Drop" },
  { value: "Ordered Delivered", label: "Ordered Delivered" },
]

export default function OrderDetectDeliveryFilterPanel({ isOpen, onClose, filters, setFilters, onApply, onReset }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Filter Orders</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Status
            </label>
            <select
              value={filters.status || ""}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
          >
            Clear all filters
          </button>
          <button
            onClick={onApply}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
