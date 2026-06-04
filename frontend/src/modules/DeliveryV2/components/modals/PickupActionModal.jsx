import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, MapPin, Phone, 
  ChevronDown, ChevronUp, Package, 
  Navigation, CheckCircle2, Camera, Loader2, Image as ImageIcon
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { uploadAPI } from '@food/api';
import { toast } from 'sonner';
import { openCamera } from "@food/utils/imageUploadUtils";

/**
 * PickupActionModal - Unified White/Green Theme with Slider Actions.
 * Includes Bill Upload feature prior to pickup.
 */
export const PickupActionModal = ({ 
  order, 
  status, 
  isWithinRange, 
  distanceToTarget,
  eta,
  onReachedPickup, 
  onVerifyPickupOtp,
  onPickedUp,
  onMinimize
}) => {
  const [showItems, setShowItems] = useState(false);
  const [isUploadingBill, setIsUploadingBill] = useState(false);
  const [billImageUploaded, setBillImageUploaded] = useState(false);
  const [billImageUrl, setBillImageUrl] = useState(null);
  const [pickupOtp, setPickupOtp] = useState('');
  const [isVerifyingPickupOtp, setIsVerifyingPickupOtp] = useState(false);
  const cameraInputRef = useRef(null);

  if (!order) return null;

  const handleBillImageSelect = async (file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    setIsUploadingBill(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: 'appzeto/delivery/bills' });
      if (res?.data?.success && res?.data?.data) {
        setBillImageUrl(res.data.data.url || res.data.data.secure_url);
        setBillImageUploaded(true);
        // toast.success('Bill image uploaded!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      toast.error('Failed to upload bill image');
      setBillImageUploaded(false);
      setBillImageUrl(null);
    } finally {
      setIsUploadingBill(false);
    }
  };

  const handleTakeCameraPhoto = () => {
    openCamera({
      onSelectFile: (file) => handleBillImageSelect(file),
      fileNamePrefix: `bill-${order.orderId || order._id}`
    })
  }

  const handlePickFromGallery = () => {
    cameraInputRef.current?.click()
  }

  const isAtPickup = status === 'REACHED_PICKUP';
  const isPickupOtpVerified = !!order?.deliveryVerification?.pickupOtp?.verified;
  const needsPickupOtp = !!order?.deliveryVerification?.pickupOtp?.required;
  const restaurantName = order.restaurantName || order.restaurant_name || order.restaurantId?.restaurantName || order.restaurantId?.name || 'Restaurant';
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || order.restaurantLocation?.address || order.restaurantId?.location?.address || order.restaurantId?.addressLine1 || 'Address not available';
  const restaurantPhone = order.restaurantPhone || order.restaurant_phone || order.restaurantId?.phone || order.restaurantId?.primaryContactNumber || order.restaurantId?.ownerPhone || '';
  const items = order.items || [];
  const restaurantLogo = order.restaurantImage || order.restaurant?.logo || order.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';

  const handleVerifyPickupOtp = async () => {
    if (!pickupOtp || pickupOtp.length < 4 || !onVerifyPickupOtp) return;
    setIsVerifyingPickupOtp(true);
    try {
      await onVerifyPickupOtp(pickupOtp);
      setPickupOtp('');
      toast.success('Pickup OTP verified');
    } finally {
      setIsVerifyingPickupOtp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-110 p-0 sm:p-4 flex items-end justify-center">
      {/* Background Dim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/40 -z-10"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-md sm:max-w-lg bg-white rounded-t-3xl sm:rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-4 sm:p-6 pb-6 sm:pb-12 max-h-[84vh] overflow-y-auto"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-2 sm:pb-4 pt-1">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-400 stroke-3" />
          </button>
        </div>

        {/* Restaurant Header */}
        <div className="flex items-start justify-between mb-5 sm:mb-8 pb-3 sm:pb-4 border-b border-gray-50">
          <div className="flex gap-3 sm:gap-4">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-black/5 overflow-hidden border border-gray-100">
              <img src={restaurantLogo} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-gray-950 text-lg sm:text-xl font-bold">{restaurantName}</h3>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 mt-1.5">
                {isAtPickup ? (
                  <span className="text-green-600">Reached Location âˆš</span>
                ) : (
                  <span className="text-orange-500">
                    {(distanceToTarget / 1000).toFixed(1)} km • {eta || '--'} min to Store
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {restaurantPhone && (
              <button
                onClick={(e) => {
                  if (e && e.stopPropagation) e.stopPropagation();
                  const cleanPhone = String(restaurantPhone).replace(/[^\d+]/g, '');
                  try {
                    const link = document.createElement('a');
                    link.href = `tel:${cleanPhone}`;
                    link.setAttribute('target', '_self');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  } catch (err) {
                    window.location.href = `tel:${cleanPhone}`;
                  }
                }}
                className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100"
              >
                <Phone className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantAddress)}`, '_blank')}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white shadow-lg"
            >
              <Navigation className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Sliders */}
          <div className="space-y-4 sm:space-y-6">
          {!isAtPickup ? (
            <div>
              <p className={`text-center text-[10px] font-bold uppercase tracking-widest mb-3 transition-colors ${
                isWithinRange ? 'text-green-600' : 'text-orange-500 animate-pulse'
              }`}>
                {isWithinRange ? 'Ready - Swipe to confirm arrival' : 'Get closer to restaurant'}
              </p>
              <ActionSlider 
                key="action-reach"
                label="Slide to Reach" 
                successLabel="Reached!"
                disabled={!isWithinRange}
                onConfirm={onReachedPickup}
                color="bg-green-600"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {needsPickupOtp && (
                <div className={`rounded-2xl border p-4 ${isPickupOtpVerified ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 mb-2">
                    Restaurant Pickup OTP
                  </p>
                  {isPickupOtpVerified ? (
                    <div className="flex items-center gap-2 text-sm font-bold text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Pickup OTP verified. Bill upload unlocked.</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700 mb-3">
                        Ask the restaurant for the 4-digit pickup OTP before uploading the receipt or picking up the order.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={4}
                          value={pickupOtp}
                          onChange={(e) => setPickupOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="Enter OTP"
                          className="w-full flex-1 rounded-xl border border-orange-200 bg-white px-4 py-3 text-center text-base sm:text-lg font-bold tracking-[0.18em] sm:tracking-[0.35em] text-gray-900 outline-none focus:border-orange-400"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyPickupOtp}
                          disabled={pickupOtp.length !== 4 || isVerifyingPickupOtp}
                          className="w-full sm:w-auto sm:min-w-[92px] shrink-0 rounded-xl bg-gray-900 px-4 py-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] sm:tracking-widest text-white disabled:opacity-50"
                        >
                          {isVerifyingPickupOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-center items-center gap-3 w-full">
                 {!billImageUploaded && !isUploadingBill && (
                   <>
                      <button
                        onClick={handleTakeCameraPhoto}
                        disabled={needsPickupOtp && !isPickupOtpVerified}
                        className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 rounded-2xl bg-gray-900 text-white font-bold text-[11px] sm:text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                      >
                        <Camera className="w-5 h-5" />
                        <span>Camera</span>
                      </button>
                      <button
                        onClick={handlePickFromGallery}
                        disabled={needsPickupOtp && !isPickupOtpVerified}
                        className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 rounded-2xl bg-orange-50 text-orange-600 border border-orange-100 font-bold text-[11px] sm:text-xs uppercase tracking-widest active:scale-95 transition-all"
                      >
                        <ImageIcon className="w-5 h-5" />
                        <span>Gallery</span>
                      </button>
                   </>
                 )}

                 {isUploadingBill && (
                    <div className="w-full flex items-center justify-center gap-2 py-3 sm:py-4 rounded-2xl bg-gray-50 text-gray-400 font-bold text-[11px] sm:text-xs uppercase tracking-widest">
                       <Loader2 className="w-4 h-4 animate-spin" />
                       <span>Uploading...</span>
                    </div>
                 )}

                 {billImageUploaded && (
                    <div className="w-full flex items-center justify-center gap-2 py-3 sm:py-4 rounded-2xl bg-green-100 text-green-700 font-bold text-[11px] sm:text-xs uppercase tracking-widest">
                       <CheckCircle2 className="w-4 h-4" />
                       <span>Bill Uploaded</span>
                    </div>
                 )}

                 <input
                   ref={cameraInputRef}
                   type="file"
                   accept="image/*"
                   onChange={(e) => handleBillImageSelect(e.target.files[0])}
                   className="hidden"
                 />
              </div>

              <div>
                <p className={`px-2 text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] sm:tracking-widest leading-relaxed mb-3 break-words ${billImageUploaded ? 'text-green-600' : 'text-gray-400'}`}>
                  {needsPickupOtp && !isPickupOtpVerified
                    ? "Verify pickup otp to unlock bill upload"
                    : billImageUploaded
                      ? "Check the restaurant logo - Swipe to pick up"
                      : "Capture bill to unlock swipe"}
                </p>
                <ActionSlider 
                  key="action-pickup"
                  label="Slide to Pick Up" 
                  successLabel="Picked Up!"
                  disabled={!billImageUploaded || (needsPickupOtp && !isPickupOtpVerified)}
                  onConfirm={() => onPickedUp(billImageUrl)}
                  color="bg-orange-500"
                />
              </div>
            </div>
          )}

          {/* Delivery Instructions (User Note) */}
          {order?.note && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3.5 sm:p-4 flex gap-3 items-start">
              <ChefHat className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1.5">User Instructions</p>
                <p className="text-sm font-bold text-gray-800 leading-snug">"{order.note}"</p>
              </div>
            </div>
          )}

          {/* Collapsible Order Summary */}
          <button 
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 text-gray-900 font-bold text-xs uppercase tracking-widest">
              <Package className="w-5 h-5 text-gray-400" />
              <span>Order Details ({items.length || 0})</span>
            </div>
            {showItems ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {showItems && (
            <div className="overflow-hidden space-y-2 px-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700 text-sm font-bold">{item.name || 'Item Name'}</span>
                  <span className="text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-lg text-xs">x{item.quantity || 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PickupActionModal;
