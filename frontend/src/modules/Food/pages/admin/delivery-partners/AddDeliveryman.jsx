import { useState, useEffect } from "react"
import { Upload, Calendar, Settings } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"
import { EMAIL_REGEX } from "@/shared/utils/emailValidation"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

export default function AddDeliveryman() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    deliverymanType: "",
    zone: "",
    vehicle: "",
    vehicleNumber: "",
    identityType: "Passport",
    identityNumber: "",
    age: "",
    birthdate: "",
    phone: "+91",
  })
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [zones, setZones] = useState([])
  const [files, setFiles] = useState({
    profilePhoto: null,
    identityImage: null,
    drivingLicense: null
  })

  useEffect(() => {
    fetchZones()
  }, [])

  const fetchZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 })
      if (response.data?.success && response.data.data?.zones) {
        setZones(response.data.data.zones)
      }
    } catch (error) {
      console.error("Error fetching zones:", error)
    }
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const handleFileChange = (field, e) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({ ...prev, [field]: e.target.files[0] }))
    }
  }

  const validateForm = () => {
    const errors = {}
    if (!formData.firstName.trim()) errors.firstName = "First name is required"
    if (!formData.lastName.trim()) errors.lastName = "Last name is required"
    if (!formData.email.trim()) {
      errors.email = "Email is required"
    } else if (!EMAIL_REGEX.test(formData.email)) {
      errors.email = "Invalid email format"
    }
    if (!formData.deliverymanType) errors.deliverymanType = "Deliveryman type is required"
    if (!formData.zone) errors.zone = "Zone is required"
    if (!formData.vehicle) errors.vehicle = "Vehicle is required"
    if (!formData.vehicleNumber.trim()) errors.vehicleNumber = "Vehicle number is required"
    if (!formData.identityNumber.trim()) errors.identityNumber = "Identity number is required"
    if (!formData.age || parseInt(formData.age) < 18) errors.age = "Age must be at least 18"
    if (!formData.birthdate) errors.birthdate = "Birthdate is required"
    if (!formData.phone || formData.phone.length < 10) errors.phone = "Valid phone number is required"
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    
    setIsSubmitting(true)
    try {
      const dataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        dataToSend.append(key, formData[key]);
      });
      // Ensure name is passed instead of firstName/lastName for the backend
      dataToSend.append("name", `${formData.firstName} ${formData.lastName}`);

      if (files.profilePhoto) {
        dataToSend.append("profilePhoto", files.profilePhoto);
      }
      if (files.drivingLicense) {
        dataToSend.append("drivingLicensePhoto", files.drivingLicense);
      }
      if (files.identityImage) {
        if (formData.identityType === "Passport") {
          dataToSend.append("panPhoto", files.identityImage); // Fallback mapping based on what backend routes typically expect
        } else if (formData.identityType === "National ID") {
          dataToSend.append("aadharPhoto", files.identityImage);
        } else {
          dataToSend.append("drivingLicensePhoto", files.identityImage);
        }
      }

      const response = await adminAPI.addDeliveryPartner(dataToSend);
      if (response?.data?.success || response?.success) {
        toast.success("Deliveryman added successfully!");
        setShowSuccessDialog(true)
        handleReset()
      } else {
        toast.error(response?.data?.message || response?.message || "Failed to add deliveryman.");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to add deliveryman.");
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      deliverymanType: "",
      zone: "",
      vehicle: "",
      vehicleNumber: "",
      identityType: "Passport",
      identityNumber: "",
      age: "",
      birthdate: "",
      phone: "+91",
    })
    setFiles({
      profilePhoto: null,
      identityImage: null,
      drivingLicense: null
    })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
          {/* Settings Icon */}
          <button className="absolute top-6 right-6 p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
            <Settings className="w-5 h-5 text-slate-600" />
          </button>

          <h1 className="text-2xl font-bold text-slate-900 mb-6">Add New Deliveryman</h1>

          <form onSubmit={handleSubmit}>
            {/* 1. General info */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">1. General info</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    placeholder="Ex: Jhone"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.firstName ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.firstName && <p className="text-xs text-red-500 mt-1">{formErrors.firstName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    placeholder="Ex: Joe"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.lastName ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.lastName && <p className="text-xs text-red-500 mt-1">{formErrors.lastName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="Ex: ex@example.com"
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      formErrors.email ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Deliveryman Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.deliverymanType}
                    onChange={(e) => handleInputChange("deliverymanType", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Delivery man type</option>
                    <option value="full-time">Full Time</option>
                    <option value="part-time">Part Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Zone <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.zone}
                    onChange={(e) => handleInputChange("zone", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Select Zone</option>
                    {zones.map((z) => (
                      <option key={z._id || z.id} value={z._id || z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Image <span className="text-red-500">*</span>
                  </label>
                  <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer overflow-hidden">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleFileChange("profilePhoto", e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    {files.profilePhoto ? (
                      <div>
                        <p className="text-sm font-medium text-blue-600 mb-1 truncate">{files.profilePhoto.name}</p>
                        <p className="text-xs text-slate-500">File selected</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-blue-600 mb-1">Click to upload Or drag and drop</p>
                        <p className="text-xs text-slate-500">JPG, JPEG, PNG, Gif Image size: Max 2 MB (1:1)</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Identification Information */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">2. Identification Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.vehicle}
                    onChange={(e) => handleInputChange("vehicle", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Select Vehicle</option>
                    <option value="car">Car</option>
                    <option value="motorcycle">Motorcycle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Vehicle Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.vehicleNumber}
                    onChange={(e) => handleInputChange("vehicleNumber", e.target.value)}
                    placeholder="Ex: AB-12-CD-3456"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.identityType}
                    onChange={(e) => handleInputChange("identityType", e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="Passport">Passport</option>
                    <option value="Driving License">Driving License</option>
                    <option value="National ID">National ID</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.identityNumber}
                    onChange={(e) => handleInputChange("identityNumber", e.target.value)}
                    placeholder="Ex: DH-23434-LS"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Identity Image
                  </label>
                  <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer overflow-hidden">
                    <input 
                      type="file" 
                      accept=".pdf,.doc,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange("identityImage", e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    {files.identityImage ? (
                      <div>
                        <p className="text-sm font-medium text-blue-600 mb-1 truncate">{files.identityImage.name}</p>
                        <p className="text-xs text-slate-500">File selected</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-blue-600 mb-1">Select a file or Drag & Drop here</p>
                        <p className="text-xs text-slate-500">Pdf, doc, jpg. File size: max 2 MB</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Additional Data */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">3. Additional Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter your age <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) => handleInputChange("age", e.target.value)}
                    placeholder="Enter Age"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter your birthdate <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={formData.birthdate}
                      onChange={(e) => handleInputChange("birthdate", e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Driving license
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 border-2 border-dashed border-slate-300 rounded-lg p-3 text-center hover:border-blue-500 transition-colors cursor-pointer overflow-hidden bg-white">
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileChange("drivingLicense", e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                      />
                      {files.drivingLicense ? (
                        <p className="text-sm font-medium text-blue-600 truncate">{files.drivingLicense.name}</p>
                      ) : (
                        <p className="text-sm text-slate-500">Choose file</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Account info */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">4. Account info</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-2.5 border border-slate-300 rounded-l-lg bg-slate-50 text-sm">
                      +91
                    </div>
                    <input
                      type="tel"
                      value={formData.phone.replace("+91", "")}
                      onChange={(e) => handleInputChange("phone", "+91" + e.target.value)}
                      placeholder="Enter phone number"
                      className="flex-1 px-4 py-2.5 border border-slate-300 border-l-0 rounded-r-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-green-600">Success!</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">
              Deliveryman added successfully!
            </p>
          </div>
          <DialogFooter className="px-6 pb-6">
            <button
              onClick={() => setShowSuccessDialog(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
