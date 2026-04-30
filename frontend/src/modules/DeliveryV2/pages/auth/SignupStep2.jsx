import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check, Camera, Image as ImageIcon } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import { openCamera, openGallery } from "@food/utils/imageUploadUtils"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const createEmptyUploadedDocs = () => ({
  profilePhoto: null,
  aadharPhoto: null,
  panPhoto: null,
  drivingLicensePhoto: null
})

const createEmptyPreviewUrls = () => ({
  profilePhoto: null,
  aadharPhoto: null,
  panPhoto: null,
  drivingLicensePhoto: null
})

const sanitizeUploadedDocValue = (value) => {
  if (!value) return null

  if (typeof value === "string") {
    return value.startsWith("blob:") ? null : value
  }

  if (typeof value === "object") {
    const url = typeof value.url === "string" ? value.url : ""
    if (!url || url.startsWith("blob:")) {
      return null
    }
    return { ...value, url }
  }

  return null
}

const sanitizeUploadedDocs = (docs) => ({
  profilePhoto: sanitizeUploadedDocValue(docs?.profilePhoto),
  aadharPhoto: sanitizeUploadedDocValue(docs?.aadharPhoto),
  panPhoto: sanitizeUploadedDocValue(docs?.panPhoto),
  drivingLicensePhoto: sanitizeUploadedDocValue(docs?.drivingLicensePhoto)
})

const getFriendlyRegistrationError = (error) => {
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ""

  if (/E11000 duplicate key error/i.test(rawMessage)) {
    if (/vehicleNumber_1/i.test(rawMessage) || /vehicleNumber/i.test(rawMessage)) {
      return "This vehicle number is already registered. Please use a different vehicle number."
    }

    if (/panNumber_1/i.test(rawMessage) || /panNumber/i.test(rawMessage)) {
      return "This PAN number is already registered."
    }

    if (/aadharNumber_1/i.test(rawMessage) || /aadharNumber/i.test(rawMessage)) {
      return "This Aadhar number is already registered."
    }

    if (/drivingLicense/i.test(rawMessage)) {
      return "This driving license number is already registered."
    }

    return "This account detail is already registered. Please check your information."
  }

  return rawMessage || "Failed to register. Please try again."
}


export default function SignupStep2() {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const fileInputRefs = useRef({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const previewUrlsRef = useRef(createEmptyPreviewUrls())
  const [documents, setDocuments] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [previewUrls, setPreviewUrls] = useState(() => createEmptyPreviewUrls())
  const [uploadedDocs, setUploadedDocs] = useState(() => createEmptyUploadedDocs())
  const [activePicker, setActivePicker] = useState(null) // { docType: string, title: string, ref: any }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState({})

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    sessionStorage.removeItem("deliverySignupDocs")
  }, [])

  useEffect(() => {
    previewUrlsRef.current = previewUrls
  }, [previewUrls])

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((previewUrl) => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl)
        }
      })
      Object.values(fileInputRefs.current).forEach((input) => {
        if (input) {
          input.value = ""
        }
      })
    }
  }, [])

  const hasSelectedDocument = (docType) => {
    const uploaded = uploadedDocs[docType]
    if (typeof uploaded === "string" && uploaded.trim()) return true
    if (uploaded?.url) return true
    return Boolean(documents[docType])
  }

  const getPreviewSrc = (docType) => {
    const uploaded = uploadedDocs[docType]
    if (typeof uploaded === "string") return uploaded
    if (uploaded?.url) return uploaded.url
    return previewUrls[docType] || null
  }

  const handleOpenUploadOptions = (docType) => {
    fileInputRefs.current[docType]?.click()
  }

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    if (previewUrls[docType]) {
      URL.revokeObjectURL(previewUrls[docType])
    }
    const nextPreviewUrl = URL.createObjectURL(file)

    setDocuments((prev) => ({ ...prev, [docType]: file }))
    setPreviewUrls((prev) => ({ ...prev, [docType]: nextPreviewUrl }))
    setUploadedDocs((prev) => ({ ...prev, [docType]: null }))
    toast.success(`${docType.replace(/([A-Z])/g, " $1").trim()} selected`)
  }

  const handleTakeCameraPhoto = (docType) => {
    openCamera({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`
    })
  }

  const handlePickFromGallery = (docType) => {
    openGallery({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`
    })
  }

  const handleRemove = (docType) => {
    if (previewUrls[docType]) {
      URL.revokeObjectURL(previewUrls[docType])
    }
    setDocuments(prev => ({
      ...prev,
      [docType]: null
    }))
    setPreviewUrls(prev => ({
      ...prev,
      [docType]: null
    }))
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!documents.profilePhoto || !documents.aadharPhoto || !documents.panPhoto || !documents.drivingLicensePhoto) {
      toast.error("Please upload all required documents")
      return
    }

    const raw = sessionStorage.getItem("deliverySignupDetails")
    if (!raw) {
      toast.error("Session expired. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    let details
    try {
      details = JSON.parse(raw)
    } catch {
      toast.error("Invalid session. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    const formData = new FormData()
    formData.append("name", details.name || "")
    formData.append("phone", String(details.phone || "").replace(/\D/g, "").slice(0, 15))
    if (details.email) formData.append("email", String(details.email).trim())
    if (details.ref) formData.append("ref", String(details.ref).trim())
    if (details.countryCode) formData.append("countryCode", details.countryCode)
    if (details.address) formData.append("address", details.address)
    if (details.city) formData.append("city", details.city)
    if (details.state) formData.append("state", details.state)
    if (details.vehicleType) formData.append("vehicleType", details.vehicleType)
    if (details.vehicleName) formData.append("vehicleName", details.vehicleName)
    if (details.vehicleNumber) formData.append("vehicleNumber", details.vehicleNumber)
    if (details.drivingLicenseNumber) {
      formData.append("drivingLicenseNumber", details.drivingLicenseNumber)
      formData.append("documents[drivingLicense][number]", details.drivingLicenseNumber)
    }
    if (details.panNumber) formData.append("panNumber", details.panNumber)
    if (details.aadharNumber) formData.append("aadharNumber", details.aadharNumber)
    formData.append("profilePhoto", documents.profilePhoto)
    formData.append("aadharPhoto", documents.aadharPhoto)
    formData.append("panPhoto", documents.panPhoto)
    formData.append("drivingLicensePhoto", documents.drivingLicensePhoto)

    // Try to get FCM token before registering
    let fcmToken = null;
    let platform = "web";
    try {
      if (typeof window !== "undefined") {
        if (window.flutter_inappwebview) {
          platform = "mobile";
          const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
          for (const handlerName of handlerNames) {
            try {
              const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" });
              if (t && typeof t === "string" && t.length > 20) {
                fcmToken = t.trim();
                break;
              }
            } catch (e) {}
          }
        } else {
          fcmToken = localStorage.getItem("fcm_web_registered_token_delivery") || null;
        }
      }
    } catch (e) {
      debugWarn("Failed to get FCM token during signup", e);
    }

    if (fcmToken) {
      formData.append("fcmToken", fcmToken);
      formData.append("platform", platform);
    }

    const isCompleteProfile = sessionStorage.getItem("deliveryNeedsRegistration") === "true"

    setIsSubmitting(true)

    try {
      // New number (OTP ke baad pehli baar): DB me abhi partner nahi hai,
      // is case me register hi call karna hai (no auth token needed).
      const response = isCompleteProfile
        ? await deliveryAPI.register(formData)
        : await deliveryAPI.completeProfile(formData)

      if (response?.data?.success) {
        sessionStorage.removeItem("deliverySignupDetails")
        sessionStorage.removeItem("deliverySignupDocs")
        if (isCompleteProfile) {
          sessionStorage.removeItem("deliveryNeedsRegistration")
          toast.success("Registration successful. Please login with OTP.")
          setTimeout(() => navigate("/food/delivery/login", { replace: true }), 1500)
        } else {
          toast.success("Profile submitted. Waiting for admin approval.")
          setTimeout(() => navigate("/food/delivery", { replace: true }), 1500)
        }
      }
    } catch (error) {
      debugError("Error submitting registration:", error)
      const message = getFriendlyRegistrationError(error)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const uploaded = hasSelectedDocument(docType)
    const isUploading = uploading[docType]
    const previewSrc = getPreviewSrc(docType)
    const hasPreview = Boolean(previewSrc)

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded ? (
          <div className="relative">
            {hasPreview ? (
              <img
                src={previewSrc}
                alt={label}
                className="w-full h-48 object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-48 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
                Preview unavailable
              </div>
            )}
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 transition-colors px-4">
            <div className="flex flex-col items-center justify-center pt-5 pb-3">
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-sm text-gray-500">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Upload document</p>
                  <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>

            {!isUploading && (
              <div className="w-full grid grid-cols-2 gap-2 pb-4">
                <button
                  type="button"
                  onClick={() => handleTakeCameraPhoto(docType)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold cursor-pointer hover:bg-black transition-all active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePickFromGallery(docType)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#00B761] text-white text-xs font-bold cursor-pointer hover:bg-[#00A055] transition-all active:scale-95"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Gallery</span>
                </button>
              </div>
            )}

            <input
              ref={(node) => {
                fileInputRefs.current[docType] = node
              }}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onClick={(e) => {
                e.target.value = ""
              }}
              onChange={(e) => {
                const selectedFile = e.target.files[0]
                if (selectedFile) {
                  handleFileSelect(docType, selectedFile)
                }
                e.target.value = ""
              }}
              disabled={isUploading}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={goBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !hasSelectedDocument("profilePhoto") || !hasSelectedDocument("aadharPhoto") || !hasSelectedDocument("panPhoto") || !hasSelectedDocument("drivingLicensePhoto")}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting || !hasSelectedDocument("profilePhoto") || !hasSelectedDocument("aadharPhoto") || !hasSelectedDocument("panPhoto") || !hasSelectedDocument("drivingLicensePhoto")
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Submitting..." : "Complete Signup"}
          </button>
        </form>
      </div>

    </div>
  )
}

