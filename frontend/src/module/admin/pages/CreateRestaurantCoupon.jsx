import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function CreateRestaurantCoupon() {
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    applyToAllDishes: true,
    discountType: "percentage",
    discountValue: "",
    minOrderValue: "",
    couponCode: "",
    startDate: "",
    endDate: "",
    status: "active",
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      applyToAllDishes: true,
      originalPrice: 0,
      discountValue: Number(form.discountValue),
      minOrderValue: form.minOrderValue === "" ? 0 : Number(form.minOrderValue),
      couponCode: String(form.couponCode || "").trim().toUpperCase(),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    };

    if (!payload.couponCode) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!Number.isFinite(payload.discountValue) || payload.discountValue < 0) {
      toast.error("Discount value must be a valid number");
      return;
    }

    if (payload.discountType === "percentage" && payload.discountValue > 100) {
      toast.error("Percentage discount must be between 0 and 100");
      return;
    }

    if (!Number.isFinite(payload.minOrderValue) || payload.minOrderValue < 0) {
      toast.error("Minimum order value must be 0 or more");
      return;
    }

    setSaving(true);
    try {
      await adminAPI.createOffer(payload);
      toast.success("Restaurant coupon created");
      navigate("/admin/coupons");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to create coupon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Create Restaurant Coupon</h1>
          <p className="text-sm text-slate-500 mb-6">Add a universal coupon for all dishes.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code *</label>
                <input
                  type="text"
                  value={form.couponCode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="e.g. SAVE20"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount Type *</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat-price">Flat Price</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {form.discountType === "percentage"
                    ? "Discount % *"
                    : "Flat Discount Amount *"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder={
                    form.discountType === "percentage"
                      ? "e.g. 20"
                      : "e.g. 50"
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Min Order Value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minOrderValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, minOrderValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="e.g. 199"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/admin/coupons")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Coupon"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
