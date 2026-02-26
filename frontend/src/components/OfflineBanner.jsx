import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
      <div className="mx-6 max-w-sm rounded-2xl bg-white px-6 py-8 text-center shadow-2xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          You&apos;re offline
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Please check your internet connection. We&apos;ll automatically
          reconnect when you&apos;re back online.
        </p>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-400">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span>No internet connection</span>
        </div>
      </div>
    </div>
  );
}

