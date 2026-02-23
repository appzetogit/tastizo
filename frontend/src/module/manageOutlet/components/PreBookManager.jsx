import { useState } from "react"
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import * as diningContentService from "../services/diningContentService"

const DISCOUNT_TYPES = ["percentage", "flat"]

export default function PreBookManager({ initialData, onUpdate }) {
  const [offers, setOffers] = useState(initialData?.preBookOffers ?? [])
  const [sectionVisible, setSectionVisible] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    title: "",
    description: "",
    discountType: "percentage",
    discountValue: "",
    validFrom: "",
    validTo: "",
    active: true,
    imageUrl: "",
  })

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      discountType: "percentage",
      discountValue: "",
      validFrom: "",
      validTo: "",
      active: true,
      imageUrl: "",
    })
    setEditingId(null)
  }

  const handleSave = async () => {
    const payload = {
      id: editingId || `pb-${Date.now()}`,
      title: form.title,
      description: form.description,
      discountType: form.discountType,
      discountValue: form.discountValue,
      validFrom: form.validFrom,
      validTo: form.validTo,
      active: form.active,
      imageUrl: form.imageUrl,
    }
    let next = offers
    if (editingId) {
      next = offers.map((o) => (o.id === editingId ? payload : o))
    } else {
      next = [...offers, payload]
    }
    setOffers(next)
    try {
      await diningContentService.savePreBookOffers(next)
      toast.success(editingId ? "Offer updated" : "Offer added")
      resetForm()
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to save")
    }
  }

  const handleDelete = async (id) => {
    const next = offers.filter((o) => o.id !== id)
    setOffers(next)
    try {
      await diningContentService.savePreBookOffers(next)
      toast.success("Offer removed")
      if (editingId === id) resetForm()
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to delete")
    }
  }

  const startEdit = (offer) => {
    setEditingId(offer.id)
    setForm({
      title: offer.title ?? "",
      description: offer.description ?? "",
      discountType: offer.discountType ?? "percentage",
      discountValue: offer.discountValue ?? "",
      validFrom: offer.validFrom ?? "",
      validTo: offer.validTo ?? "",
      active: offer.active !== false,
      imageUrl: offer.imageUrl ?? "",
    })
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={sectionVisible}
          onChange={(e) => setSectionVisible(e.target.checked)}
        />
        <span className="text-sm font-medium text-slate-700">Show Pre-book offers section</span>
      </label>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <select
            value={form.discountType}
            onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {DISCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Discount value (e.g. 10 or 50)"
            value={form.discountValue}
            onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
            className="flex-1 min-w-[120px] px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            type="date"
            placeholder="Valid from"
            value={form.validFrom}
            onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            type="date"
            placeholder="Valid to"
            value={form.validTo}
            onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          <span className="text-sm text-slate-700">Active</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-[#2B9C64] text-white text-sm font-medium rounded-lg"
          >
            {editingId ? "Update" : "Add"} offer
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-sm rounded-lg"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {offers.map((offer) => (
          <li key={offer.id} className="py-3 flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-slate-900">{offer.title || "Untitled"}</p>
              <p className="text-xs text-slate-500">
                {offer.discountType} {offer.discountValue}
                {offer.validFrom && ` · ${offer.validFrom} – ${offer.validTo || "—"}`}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => startEdit(offer)}
                className="p-2 text-slate-500 hover:text-slate-700"
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(offer.id)}
                className="p-2 text-red-500 hover:text-red-700"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
