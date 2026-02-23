import { useState, useRef } from "react"
import { Plus, Trash2, GripVertical, Star, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@/lib/api"
import * as diningContentService from "../services/diningContentService"

export default function PhotoManager({ initialData, onUpdate }) {
  const [photos, setPhotos] = useState(initialData?.diningPhotos ?? [])
  const [coverIndex, setCoverIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const fileInputRef = useRef(null)

  const handleUpload = async (e) => {
    const file = e?.target?.files?.[0]
    if (!file?.type?.startsWith("image/")) {
      toast.error("Please select an image")
      return
    }
    setUploading(true)
    try {
      const res = await restaurantAPI.uploadDiningImage(file)
      const list = res?.data?.data?.menuImages ?? []
      setPhotos(Array.isArray(list) ? list : [])
      toast.success("Photo added")
      onUpdate?.()
    } catch (err) {
      toast.error(err?.response?.data?.message ?? "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemove = async (index) => {
    const next = photos.filter((_, i) => i !== index)
    setPhotos(next)
    if (coverIndex >= next.length && next.length > 0) setCoverIndex(next.length - 1)
    else if (coverIndex > index) setCoverIndex(coverIndex - 1)
    try {
      await diningContentService.saveDiningPhotos(next)
      toast.success("Photo removed")
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to remove")
    }
  }

  const setCover = async (index) => {
    setCoverIndex(index)
    const reordered = [...photos]
    const [cover] = reordered.splice(index, 1)
    reordered.unshift(cover)
    setPhotos(reordered)
    try {
      await diningContentService.saveDiningPhotos(reordered)
      toast.success("Cover updated")
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to update")
    }
  }

  const handleDragStart = (i) => setDraggedIndex(i)
  const handleDragOver = (e, i) => {
    e.preventDefault()
    if (draggedIndex == null) return
    if (draggedIndex === i) return
    const next = [...photos]
    const [removed] = next.splice(draggedIndex, 1)
    next.splice(i, 0, removed)
    setPhotos(next)
    setDraggedIndex(i)
  }
  const handleDragEnd = async () => {
    if (draggedIndex == null) return
    setDraggedIndex(null)
    try {
      await diningContentService.saveDiningPhotos(photos)
      toast.success("Order saved")
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to save order")
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, index) => (
          <div
            key={`${photo?.url ?? index}-${index}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`relative group aspect-square rounded-xl overflow-hidden bg-slate-100 border-2 ${
              index === 0 ? "ring-2 ring-[#2B9C64]" : "border-transparent"
            }`}
          >
            <img
              src={photo?.url ?? photo}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="cursor-grab text-white p-1" title="Drag to reorder">
                <GripVertical className="w-5 h-5" />
              </span>
              <button
                type="button"
                onClick={() => setCover(index)}
                className="p-2 rounded-full bg-white/90 text-slate-700"
                title="Set as cover"
              >
                <Star className={`w-4 h-4 ${index === 0 ? "fill-amber-400" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="p-2 rounded-full bg-red-500 text-white"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {index === 0 && (
              <span className="absolute top-1 left-1 text-[10px] font-bold bg-[#2B9C64] text-white px-1.5 py-0.5 rounded">
                Cover
              </span>
            )}
          </div>
        ))}
        <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#2B9C64] hover:bg-slate-50 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin text-[#2B9C64]" />
          ) : (
            <Plus className="w-8 h-8 text-slate-400" />
          )}
          <span className="text-xs text-slate-500">Add photo</span>
        </label>
      </div>
      <p className="text-xs text-slate-500">Drag to reorder. First image is the cover. Star = set as cover.</p>
    </div>
  )
}
