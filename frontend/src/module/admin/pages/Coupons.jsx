import { useState, useEffect, useMemo } from "react"
import { Search } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { Link } from "react-router-dom"
import { toast } from "sonner"

export default function Coupons() {
  const [searchQuery, setSearchQuery] = useState("")
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingOffer, setEditingOffer] = useState(null)
  const [editForm, setEditForm] = useState({
    couponCode: "",
    discountType: "percentage",
    discountValue: "",
    minOrderValue: 0,
    status: "active",
    startDate: "",
    endDate: "",
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingKey, setDeletingKey] = useState("")

  const fetchOffers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await adminAPI.getAllOffers({})

      if (response?.data?.success) {
        setOffers(response.data.data.offers || [])
      } else {
        setError("Failed to fetch offers")
      }
    } catch (err) {
      console.error("Error fetching offers:", err)
      setError(err?.response?.data?.message || "Failed to fetch offers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOffers()
  }, [])

  const openEditModal = (offer) => {
    const isUniversal = Boolean(offer?.appliesToAllDishes)
    const discountValue =
      offer.discountType === "percentage"
        ? Number(offer.discountPercentage || 0)
        : isUniversal
          ? Number((offer.originalPrice || 0) - (offer.discountedPrice || 0))
          : Number(offer.discountedPrice || 0)

    const toDateInput = (value) => {
      if (!value) return ""
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return ""
      return d.toISOString().split("T")[0]
    }

    setEditingOffer(offer)
    setEditForm({
      couponCode: offer.couponCode || "",
      discountType: offer.discountType || "percentage",
      discountValue: Number.isFinite(discountValue) ? String(discountValue) : "",
      minOrderValue: Number(offer.minOrderValue || 0),
      status: offer.status || "active",
      startDate: toDateInput(offer.startDate),
      endDate: toDateInput(offer.endDate),
    })
  }

  const closeEditModal = () => {
    setEditingOffer(null)
    setSavingEdit(false)
  }

  const handleUpdateOffer = async (e) => {
    e.preventDefault()
    if (!editingOffer) return

    const payload = {
      itemId: editingOffer.dishId,
      itemIndex: editingOffer.itemIndex,
      couponCode: String(editForm.couponCode || "").trim().toUpperCase(),
      discountType: editForm.discountType,
      discountValue: Number(editForm.discountValue),
      minOrderValue: Number(editForm.minOrderValue || 0),
      status: editForm.status,
      startDate: editForm.startDate || null,
      endDate: editForm.endDate || null,
    }

    if (!payload.couponCode) {
      toast.error("Coupon code is required")
      return
    }
    if (!Number.isFinite(payload.discountValue) || payload.discountValue < 0) {
      toast.error("Discount value must be a valid non-negative number")
      return
    }
    if (
      payload.discountType === "percentage" &&
      (payload.discountValue < 0 || payload.discountValue > 100)
    ) {
      toast.error("Percentage discount must be between 0 and 100")
      return
    }

    try {
      setSavingEdit(true)
      await adminAPI.updateOffer(editingOffer.offerId, payload)
      toast.success("Coupon updated successfully")
      closeEditModal()
      await fetchOffers()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update coupon")
      setSavingEdit(false)
    }
  }

  const handleDeleteOffer = async (offer) => {
    const label = offer?.couponCode || "this coupon"
    const shouldDelete = window.confirm(`Delete ${label}?`)
    if (!shouldDelete) return

    const key = `${offer.offerId}-${offer.itemIndex}`
    try {
      setDeletingKey(key)
      await adminAPI.deleteOffer(offer.offerId, {
        itemId: offer.dishId,
        itemIndex: offer.itemIndex,
      })
      toast.success("Coupon deleted successfully")
      await fetchOffers()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete coupon")
    } finally {
      setDeletingKey("")
    }
  }

  const filteredOffers = useMemo(() => {
    if (!searchQuery.trim()) return offers

    const query = searchQuery.toLowerCase().trim()
    return offers.filter(
      (offer) =>
        offer.restaurantName?.toLowerCase().includes(query) ||
        offer.dishName?.toLowerCase().includes(query) ||
        offer.couponCode?.toLowerCase().includes(query),
    )
  }, [offers, searchQuery])

  const restaurantOffers = useMemo(
    () => filteredOffers.filter((offer) => offer.scopeType !== "universal"),
    [filteredOffers],
  )

  const universalOffers = useMemo(
    () => filteredOffers.filter((offer) => offer.scopeType === "universal"),
    [filteredOffers],
  )

  const renderOffersTable = (list, emptyMessage) => (
    <div className="overflow-x-auto">
      {list.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">SI</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Dish</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Coupon Code</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Discount</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Price</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Valid Until</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {list.map((offer) => (
              <tr
                key={`${offer.offerId}-${offer.dishId}-${offer.itemIndex}`}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-slate-700">{offer.sl}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-slate-900">{offer.restaurantName}</span>
                    <span
                      className={`inline-flex w-fit px-2 py-0.5 rounded text-[11px] font-semibold ${
                        offer.scopeType === "universal"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {offer.scopeType === "universal" ? "Universal" : "Restaurant Only"}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-700">{offer.dishName}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {offer.couponCode}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-slate-700">
                    {offer.discountType === "flat-price"
                      ? `?${offer.originalPrice - offer.discountedPrice} OFF`
                      : `${offer.discountPercentage}% OFF`}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 line-through">?{offer.originalPrice}</span>
                    <span className="text-sm font-semibold text-green-600">?{offer.discountedPrice}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      offer.status === "active"
                        ? "bg-green-100 text-green-700"
                        : offer.status === "paused"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {offer.status || "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-slate-700">
                    {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : "No expiry"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(offer)}
                      className="px-3 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteOffer(offer)}
                      disabled={deletingKey === `${offer.offerId}-${offer.itemIndex}`}
                      className="px-3 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      {deletingKey === `${offer.offerId}-${offer.itemIndex}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Offers & Coupons</h1>
            <Link
              to="/admin/coupons/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              ADD COUPON
            </Link>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by restaurant name, dish name, or coupon code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-slate-500 mt-4">Loading offers...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-red-600 mb-1">Error</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">Restaurant Coupons</h2>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                  {restaurantOffers.length}
                </span>
              </div>
              {renderOffersTable(
                restaurantOffers,
                searchQuery
                  ? "No restaurant coupons match your search"
                  : "No restaurant-specific coupons found",
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">Universal Coupons</h2>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                  {universalOffers.length}
                </span>
              </div>
              {renderOffersTable(
                universalOffers,
                searchQuery
                  ? "No universal coupons match your search"
                  : "No universal coupons found",
              )}
            </div>
          </div>
        )}
      </div>

      {editingOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Update Coupon</h3>
            <form onSubmit={handleUpdateOffer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={editForm.couponCode}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount Type</label>
                  <select
                    value={editForm.discountType}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, discountType: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat-price">Flat Price</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount Value</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.discountValue}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Order Value</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.minOrderValue}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, minOrderValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={savingEdit}
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
