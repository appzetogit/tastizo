import { useState, useMemo, useRef, useEffect } from "react"
import { Search, Download, Bell, Edit, Trash2, Upload, Settings, Image as ImageIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminAPI } from "../../../lib/api/index.js"

export default function PushNotification() {
  const defaultSettings = {
    maxImageSizeMB: 2,
    defaultZone: "All",
    defaultTarget: "Customer",
  }
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [formData, setFormData] = useState({
    title: "",
    zone: "All",
    sendTo: "Customer",
    description: "",
    bannerImage: null,
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [notifications, setNotifications] = useState([])
  const [editingNotification, setEditingNotification] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [notificationSettings, setNotificationSettings] = useState(defaultSettings)
  const fileInputRef = useRef(null)
  const formSectionRef = useRef(null)
  const titleInputRef = useRef(null)
  const zoneOptions = useMemo(() => {
    const dynamicZones = zones
      .filter((zone) => zone?.isActive !== false)
      .map((zone) => zone.displayName || zone.name || zone.zoneName)
      .filter(Boolean)

    return ["All", ...new Set(dynamicZones)]
  }, [zones])

  const fetchZones = async () => {
    try {
      setZonesLoading(true)
      const res = await adminAPI.getZones({ limit: 1000, isActive: true })
      const list = res?.data?.data?.zones
      setZones(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error("Failed to fetch zones:", err)
      setZones([])
    } finally {
      setZonesLoading(false)
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await adminAPI.getPushNotifications()
      const list = res?.data?.data?.notifications
      if (Array.isArray(list)) setNotifications(list)
    } catch (err) {
      console.error("Failed to fetch push notifications:", err)
    }
  }

  useEffect(() => {
    fetchZones()
    fetchNotifications()
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin_push_notification_settings")
      if (!raw) return
      const parsed = JSON.parse(raw)
      setNotificationSettings({
        maxImageSizeMB: Number(parsed?.maxImageSizeMB) > 0 ? Number(parsed.maxImageSizeMB) : 2,
        defaultZone: parsed?.defaultZone || "All",
        defaultTarget: parsed?.defaultTarget || "Customer",
      })
    } catch (error) {
      console.error("Failed to load notification settings:", error)
    }
  }, [])

  useEffect(() => {
    if (!zoneOptions.length) return

    setNotificationSettings((prev) => {
      if (zoneOptions.includes(prev.defaultZone)) return prev
      return { ...prev, defaultZone: "All" }
    })

    setFormData((prev) => {
      if (zoneOptions.includes(prev.zone)) return prev
      return { ...prev, zone: "All" }
    })
  }, [zoneOptions])

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) {
      return notifications
    }
    
    const query = searchQuery.toLowerCase().trim()
    return notifications.filter(notification =>
      notification.title.toLowerCase().includes(query) ||
      notification.description.toLowerCase().includes(query)
    )
  }, [notifications, searchQuery])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title?.trim() || !formData.description?.trim()) {
      alert("Please fill in title and description.")
      return
    }
    if (editingNotification) {
      const editingId = editingNotification._id || editingNotification.id
      setNotifications((prev) =>
        prev.map((n) => {
          const id = n._id || n.id
          if (id !== editingId) return n
          return {
            ...n,
            title: formData.title.trim(),
            description: formData.description.trim(),
            zone: formData.zone,
            target: formData.sendTo,
            ...(formData.bannerImage ? { image: formData.bannerImage } : {}),
          }
        }),
      )
      alert("Notification updated successfully.")
      setEditingNotification(null)
      handleReset()
      return
    }
    try {
      const res = await adminAPI.sendPushNotification({
        title: formData.title.trim(),
        description: formData.description.trim(),
        sendTo: formData.sendTo,
        zone: formData.zone,
        ...(formData.bannerImage ? { image: formData.bannerImage } : {}),
      })
      if (res?.data?.success) {
        const { sent, failed, total } = res.data.data || {}
        const msg = total === 0
          ? "No devices with FCM tokens found. Users need to enable notifications."
          : `Notification sent: ${sent} delivered${failed ? `, ${failed} failed` : ""} (${total} total)` 
        alert(msg)
        handleReset()
        await fetchNotifications()
      } else {
        alert(res?.data?.message || "Failed to send notification.")
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send notification."
      alert(msg)
    }
  }

  const handleReset = () => {
    setFormData({
      title: "",
      zone: notificationSettings.defaultZone || "All",
      sendTo: notificationSettings.defaultTarget || "Customer",
      description: "",
      bannerImage: null,
    })
  }

  const handleBannerUpload = (e) => {
    const file = e.target.files?.[0]
    const maxImageSizeMB = Number(notificationSettings.maxImageSizeMB) || 2
    if (file && file.type.startsWith("image/") && file.size <= maxImageSizeMB * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = () => setFormData(prev => ({ ...prev, bannerImage: reader.result }))
      reader.readAsDataURL(file)
    } else if (file) {
      alert(`Please upload an image (jpg, png, jpeg, gif, webp) under ${maxImageSizeMB} MB.`)
    }
  }

  const handleEditNotification = (notification) => {
    setEditingNotification(notification)
    setFormData({
      title: notification.title || "",
      zone: notification.zone || "All",
      sendTo: notification.target || "Customer",
      description: notification.description || "",
      bannerImage: notification.image || null,
    })
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setTimeout(() => {
      titleInputRef.current?.focus()
    }, 150)
  }

  const handleExportNotifications = () => {
    if (filteredNotifications.length === 0) {
      alert("No notifications available to export.")
      return
    }
    const headers = ["SI", "Title", "Description", "Zone", "Target", "Status"]
    const rows = filteredNotifications.map((n, idx) => [
      idx + 1,
      n.title,
      n.description,
      n.zone,
      n.target,
      n.status ? "Active" : "Inactive",
    ])
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `notifications-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    alert("Notifications exported successfully.")
  }

  const handleSaveSettings = () => {
    const normalized = {
      maxImageSizeMB: Math.max(1, Number(notificationSettings.maxImageSizeMB) || 2),
      defaultZone: notificationSettings.defaultZone || "All",
      defaultTarget: notificationSettings.defaultTarget || "Customer",
    }
    setNotificationSettings(normalized)
    localStorage.setItem("admin_push_notification_settings", JSON.stringify(normalized))
    setFormData((prev) => ({
      ...prev,
      zone: normalized.defaultZone,
      sendTo: normalized.defaultTarget,
    }))
    setIsSettingsOpen(false)
    alert("Notification settings saved.")
  }

  const handleToggleStatus = (id) => {
    setNotifications(notifications.map(notification =>
      (notification._id || notification.id) === id ? { ...notification, status: !notification.status } : notification
    ))
  }

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this notification?")) {
      setNotifications(notifications.filter(notification => (notification._id || notification.id) !== id))
    }
  }

  const handleResendNotification = async (notification) => {
    try {
      const res = await adminAPI.sendPushNotification({
        title: notification.title || "",
        description: notification.description || "",
        sendTo: notification.target || "Customer",
        zone: notification.zone || "All",
        ...(notification.image ? { image: notification.image } : {}),
      })

      if (res?.data?.success) {
        const { sent, failed, total } = res.data.data || {}
        const msg =
          total === 0
            ? "No devices with FCM tokens found. Users need to enable notifications."
            : `Notification sent: ${sent} delivered${failed ? `, ${failed} failed` : ""} (${total} total)`
        alert(msg)
        await fetchNotifications()
      } else {
        alert(res?.data?.message || "Failed to resend notification.")
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to resend notification."
      alert(msg)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Create New Notification Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div ref={formSectionRef} />
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              {editingNotification ? "Edit Notification" : "Notification"}
            </h1>
            {editingNotification && (
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                Editing
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Title
                </label>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Ex: Notification Title"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Zone
                </label>
                <select
                  value={formData.zone}
                  onChange={(e) => handleInputChange("zone", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={zonesLoading}
                >
                  {zoneOptions.map((zoneName) => (
                    <option key={zoneName} value={zoneName}>
                      {zoneName}
                    </option>
                  ))}
                </select>
                {zonesLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Loading admin zones...</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {zoneOptions.length - 1} active zones available from Zone Setup.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Send To
                </label>
                <select
                  value={formData.sendTo}
                  onChange={(e) => handleInputChange("sendTo", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="Customer">Customer</option>
                  <option value="Delivery Man">Delivery Man</option>
                  <option value="Restaurant">Restaurant</option>
                </select>
              </div>
            </div>

            {/* Notification Banner Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Notification banner
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
                className="hidden"
                onChange={handleBannerUpload}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
              >
                {formData.bannerImage ? (
                  <img src={formData.bannerImage} alt="Banner preview" className="max-h-24 mx-auto mb-2 rounded object-cover" />
                ) : (
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                )}
                <p className="text-sm font-medium text-blue-600 mb-1">Upload Image</p>
                <p className="text-xs text-slate-500">
                  Image format - jpg png jpeg gif webp Image Size -maximum size {notificationSettings.maxImageSizeMB} MB Image Ratio - 3:1
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Ex: Notification Descriptions"
                rows={4}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md"
                >
                  {editingNotification ? "Update Notification" : "Send Notification"}
                </button>
                {editingNotification && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNotification(null)
                      handleReset()
                    }}
                    className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
                  title="Notification settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Notification List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Notification List</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredNotifications.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by title"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <button
                onClick={handleExportNotifications}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Target</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredNotifications.map((notification, idx) => (
                  <tr
                    key={notification._id || notification.id || idx}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{idx + 1}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{notification.title}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{notification.description}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {notification.image ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
                          <img
                            src={notification.image}
                            alt={notification.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = "none"
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.zone}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.target}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(notification._id || notification.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          notification.status ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            notification.status ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleResendNotification(notification)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Send Again"
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditNotification(notification)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(notification._id || notification.id)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredNotifications.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-500">
                      No notifications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notification Settings</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Default Zone</label>
              <select
                value={notificationSettings.defaultZone}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({ ...prev, defaultZone: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={zonesLoading}
              >
                {zoneOptions.map((zoneName) => (
                  <option key={zoneName} value={zoneName}>
                    {zoneName}
                  </option>
                ))}
              </select>
              {zonesLoading ? (
                <p className="mt-2 text-xs text-slate-500">Loading admin zones...</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Default zone uses the same live zones created by admin.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Default Send To</label>
              <select
                value={notificationSettings.defaultTarget}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({ ...prev, defaultTarget: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="Customer">Customer</option>
                <option value="Delivery Man">Delivery Man</option>
                <option value="Restaurant">Restaurant</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Max Banner Size (MB)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={notificationSettings.maxImageSizeMB}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({ ...prev, maxImageSizeMB: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all"
              >
                Save settings
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
