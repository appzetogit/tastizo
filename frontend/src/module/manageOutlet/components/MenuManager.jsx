import { useState } from "react"
import { Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import * as diningContentService from "../services/diningContentService"

export default function MenuManager({ initialData, onUpdate }) {
  const data = initialData?.diningMenu ?? {
    showMenuTab: true,
    menuPdfUrl: "",
    categories: [],
    recommendedItemIds: [],
  }
  const [showMenuTab, setShowMenuTab] = useState(data.showMenuTab !== false)
  const [menuPdfUrl, setMenuPdfUrl] = useState(data.menuPdfUrl ?? "")
  const [categories, setCategories] = useState(Array.isArray(data.categories) ? data.categories : [])
  const [recommendedItemIds, setRecommendedItemIds] = useState(Array.isArray(data.recommendedItemIds) ? data.recommendedItemIds : [])
  const [newCategory, setNewCategory] = useState("")
  const [newItem, setNewItem] = useState({ categoryId: "", name: "" })

  const save = async (payload) => {
    try {
      await diningContentService.saveDiningMenuSettings(payload)
      toast.success("Menu settings saved")
      onUpdate?.()
    } catch (e) {
      toast.error("Failed to save")
    }
  }

  const handleToggleShowMenu = async () => {
    const next = !showMenuTab
    setShowMenuTab(next)
    await save({
      showMenuTab: next,
      menuPdfUrl,
      categories,
      recommendedItemIds,
    })
  }

  const handlePdfChange = (e) => {
    const url = e.target.value.trim()
    setMenuPdfUrl(url)
    save({ showMenuTab, menuPdfUrl: url, categories, recommendedItemIds })
  }

  const addCategory = async () => {
    if (!newCategory.trim()) return
    const id = `cat-${Date.now()}`
    const next = [...categories, { id, name: newCategory.trim(), items: [] }]
    setCategories(next)
    setNewCategory("")
    await save({ showMenuTab, menuPdfUrl, categories: next, recommendedItemIds })
    toast.success("Category added")
    onUpdate?.()
  }

  const addItem = async () => {
    if (!newItem.categoryId || !newItem.name.trim()) return
    const next = categories.map((c) => {
      if (c.id !== newItem.categoryId) return c
      const itemId = `item-${Date.now()}`
      return {
        ...c,
        items: [...(c.items || []), { id: itemId, name: newItem.name.trim() }],
      }
    })
    setCategories(next)
    setNewItem({ categoryId: "", name: "" })
    await save({ showMenuTab, menuPdfUrl, categories: next, recommendedItemIds })
    toast.success("Item added")
    onUpdate?.()
  }

  const toggleRecommended = (itemId) => {
    const next = recommendedItemIds.includes(itemId)
      ? recommendedItemIds.filter((id) => id !== itemId)
      : [...recommendedItemIds, itemId]
    setRecommendedItemIds(next)
    save({ showMenuTab, menuPdfUrl, categories, recommendedItemIds: next })
    toast.success("Updated")
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showMenuTab}
          onChange={handleToggleShowMenu}
        />
        <span className="text-sm font-medium text-slate-700">Show menu tab on dining page</span>
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Menu PDF URL</label>
        <input
          type="url"
          placeholder="https://..."
          value={menuPdfUrl}
          onChange={handlePdfChange}
          onBlur={() => save({ showMenuTab, menuPdfUrl, categories, recommendedItemIds })}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">Categories & items</p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={addCategory}
            className="px-4 py-2 bg-[#2B9C64] text-white text-sm font-medium rounded-lg"
          >
            Add category
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <select
            value={newItem.categoryId}
            onChange={(e) => setNewItem((f) => ({ ...f, categoryId: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Item name"
            value={newItem.name}
            onChange={(e) => setNewItem((f) => ({ ...f, name: e.target.value }))}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={addItem}
            className="px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg"
          >
            Add item
          </button>
        </div>
        <ul className="space-y-3">
          {categories.map((cat) => (
            <li key={cat.id} className="border border-slate-200 rounded-lg p-3">
              <p className="font-medium text-slate-900 mb-2">{cat.name}</p>
              <ul className="space-y-1">
                {(cat.items || []).map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleRecommended(item.id)}
                      className="p-1"
                      title={recommendedItemIds.includes(item.id) ? "Unmark recommended" : "Mark recommended"}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          recommendedItemIds.includes(item.id) ? "fill-amber-400 text-amber-500" : "text-slate-300"
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
