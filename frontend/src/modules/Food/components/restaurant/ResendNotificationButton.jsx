import { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { restaurantAPI } from "@food/api";

const debugError = (...args) => {};

export default function ResendNotificationButton({ orderId, mongoId, onSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleResend = async (e) => {
    // Check if e exists before accessing stopPropagation
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation(); // Prevent card click
    }
    
    if (loading) return;

    try {
      setLoading(true);
      const id = mongoId || orderId;
      const response = await restaurantAPI.resendDeliveryNotification(id);

      if (response.data?.success) {
        const notifiedCount = Number(response.data.data?.notifiedCount || 0);
        const shortlistedCount = Number(response.data.data?.shortlistedCount || 0);
        const connectedSocketCount = Number(response.data.data?.connectedSocketCount || 0);
        toast.success(
          notifiedCount > 0
            ? `Notification sent to ${notifiedCount} delivery partners (live sockets: ${connectedSocketCount})`
            : `Notification sent to 0 delivery partners${shortlistedCount > 0 ? ` (shortlisted: ${shortlistedCount}, live sockets: ${connectedSocketCount})` : ''}`,
        );
        // Refresh orders if onSuccess callback is provided
        if (onSuccess) {
           onSuccess();
        }
      } else {
        toast.error(response.data?.message || "Failed to send notification");
      }
    } catch (error) {
      debugError("Error resending notification:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to send notification. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50 md:w-full md:justify-center md:gap-1.5 md:px-3 md:py-2.5 md:text-[12px]"
      title="Resend notification to delivery partners">
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin md:h-3.5 md:w-3.5" />
          <span>Sending...</span>
        </>
      ) : (
        <>
          <Volume2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
          <span>Resend</span>
        </>
      )}
    </button>
  );
}
