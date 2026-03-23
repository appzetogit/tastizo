import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

const REQUEST_STORAGE_KEY = "restaurant_add_outlet_requests"

export default function AddOutletRequest() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    outletName: "",
    address: "",
    city: "",
    contactNumber: "",
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.outletName.trim() || !form.address.trim() || !form.city.trim() || !form.contactNumber.trim()) {
      toast.error("Please fill all fields")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        requestedAt: new Date().toISOString(),
      }
      const existing = JSON.parse(localStorage.getItem(REQUEST_STORAGE_KEY) || "[]")
      localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify([payload, ...existing]))

      const message = `New outlet request:%0AOutlet: ${encodeURIComponent(form.outletName)}%0AAddress: ${encodeURIComponent(form.address)}%0ACity: ${encodeURIComponent(form.city)}%0AContact: ${encodeURIComponent(form.contactNumber)}`
      window.open(`mailto:support@tastizo.in?subject=Add New Outlet Request&body=${message}`, "_blank")

      toast.success("Outlet request submitted")
      navigate("/restaurant/switch-outlet")
    } catch (error) {
      toast.error("Failed to submit outlet request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Add new outlet</h1>
        </div>
      </div>

      <div className="px-4 py-6">
        <p className="text-sm text-gray-600 mb-5">
          Submit outlet details and our team will help you onboard the new outlet.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Outlet name</label>
            <Input
              value={form.outletName}
              onChange={(e) => handleChange("outletName", e.target.value)}
              placeholder="Enter outlet name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <Input
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="Enter full address"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <Input
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              placeholder="Enter city"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact number</label>
            <Input
              value={form.contactNumber}
              onChange={(e) => handleChange("contactNumber", e.target.value)}
              placeholder="Enter contact number"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-black hover:bg-black/90 text-white"
          >
            {submitting ? "Submitting..." : "Submit request"}
          </Button>
        </form>
      </div>
    </div>
  )
}
