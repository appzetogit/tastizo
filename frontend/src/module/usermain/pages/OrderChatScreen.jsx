import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import {
  ArrowLeft,
  MessageCircle,
  Send,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOrderChat } from "../hooks/useOrderChat"

function formatTime(date) {
  const d = new Date(date)
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

export default function OrderChatScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId } = useParams()
  const isUserModuleOrders = location.pathname.startsWith("/orders/")
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const {
    loading,
    error,
    order,
    chatAllowed,
    messages,
    sendMessage
  } = useOrderChat(orderId, { enabled: !!orderId })

  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || !chatAllowed || sending) return
    setSending(true)
    const result = await sendMessage(text)
    setSending(false)
    if (result?.success) {
      setInputValue("")
      inputRef.current?.focus()
    }
  }

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#ff8100] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    )
  }

  if (error && !order) {
    const is404OrRouteNotFound =
      error.toLowerCase().includes("route not found") ||
      error.toLowerCase().includes("not found")
    const friendlyMessage = is404OrRouteNotFound
      ? "Chat couldn’t be loaded. Please make sure you’re logged in and this order exists. If you just added this feature, restart the backend server."
      : error
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-xl p-6 shadow-sm max-w-sm">
          <p className="text-gray-700 mb-4">{friendlyMessage}</p>
          <Button
            onClick={() => navigate(-1)}
            className="bg-[#ff8100] hover:bg-[#e67300] text-white"
          >
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] flex flex-col">
      {/* Header - back + title only */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl shadow-sm flex-shrink-0">
        <div className="px-4 py-2.5 md:py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-gray-800" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-gray-900">Chat</h1>
        </div>
      </div>

      {/* Chat closed message */}
      {!chatAllowed && order && (
        <div className="px-4 py-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-800">
            Chat closed. Order delivered successfully.
          </div>
        </div>
      )}

      {/* Messages - pb so content isn't hidden behind fixed input */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No messages yet. Say hello to your delivery partner.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg._id || `${msg.timestamp}-${msg.message?.slice(0, 8)}`}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 ${
                msg.sender === "user"
                  ? "bg-[#ff8100] text-white rounded-br-md"
                  : "bg-white text-gray-900 shadow-sm rounded-bl-md"
              }`}
            >
              <p className="text-sm md:text-base break-words">{msg.message}</p>
              <p
                className={`text-[10px] mt-1 ${
                  msg.sender === "user" ? "text-white/80" : "text-gray-500"
                }`}
              >
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - fixed to bottom of screen (above bottom nav when on usermain) */}
      {chatAllowed && (
        <div className={`fixed left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 safe-area-pb z-30 ${!isUserModuleOrders ? 'bottom-16' : 'bottom-0'}`}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff8100]/50 focus:border-[#ff8100]"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              className="rounded-xl bg-[#ff8100] hover:bg-[#e67300] text-white px-4"
            >
              <Send className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom nav - mobile (only when opened from usermain, not from /orders/...) */}
      {!isUserModuleOrders && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          <div className="flex items-center justify-around py-2 px-4">
            <button
              onClick={() => navigate("/usermain")}
              className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100]"
            >
              <Home className="w-6 h-6" />
              <span className="text-xs font-medium">Home</span>
            </button>
            <button
              onClick={() => navigate("/usermain/wishlist")}
              className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100]"
            >
              <Heart className="w-6 h-6" />
              <span className="text-xs font-medium">Wishlist</span>
            </button>
            <button className="flex flex-col items-center gap-1 p-2 -mt-8">
              <div className="bg-white rounded-full p-3 shadow-lg border-2 border-gray-200">
                <ChefHat className="w-6 h-6 text-gray-600" />
              </div>
            </button>
            <button
              onClick={() => navigate("/usermain/orders")}
              className="flex flex-col items-center gap-1 p-2 text-[#ff8100]"
            >
              <ShoppingBag className="w-6 h-6" />
              <span className="text-xs font-medium text-[#ff8100]">Orders</span>
            </button>
            <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
              <Menu className="w-6 h-6" />
              <span className="text-xs font-medium">Menu</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
