import { useState, useEffect, useRef } from "react"
import { X, MessageCircle, Send, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDeliveryOrderChat, QUICK_MESSAGES } from "../hooks/useDeliveryOrderChat"

function formatTime(date) {
  const d = new Date(date)
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

export default function DeliveryOrderChatModal({ orderId, isOpen, onClose }) {
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const {
    loading,
    error,
    order,
    chatAllowed,
    messages,
    sendMessage
  } = useDeliveryOrderChat(orderId, { enabled: !!orderId && isOpen })

  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen])

  const handleSend = async (text) => {
    const toSend = (text ?? inputValue)?.trim()
    if (!toSend || !chatAllowed || sending) return
    setSending(true)
    const result = await sendMessage(toSend)
    setSending(false)
    if (result?.success) {
      setInputValue("")
      inputRef.current?.focus()
    }
  }

  const customer = order?.userId
  const displayName = customer?.name || customer?.fullName || (customer?.email ? customer.email.split("@")[0] : "Customer")

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end md:items-center justify-center">
      <div className="w-full h-full md:h-[90vh] md:max-w-2xl md:rounded-2xl bg-[#f6e9dc] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-white rounded-t-3xl md:rounded-t-2xl shadow-sm flex-shrink-0">
          <div className="px-4 py-2.5 md:py-3 flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 md:w-5 md:h-5 text-gray-800" />
            </button>
            <h1 className="text-base md:text-lg font-bold text-gray-900 flex-1">Chat with customer</h1>
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#ff8100]/20 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-[#ff8100]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500">Customer</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                Order #{order?.orderId || orderId}
              </span>
              <span
                className={`px-2 py-1 rounded-full font-medium ${
                  order?.status === "delivered"
                    ? "bg-green-100 text-green-700"
                    : order?.status === "out_for_delivery"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-orange-100 text-orange-700"
                }`}
              >
                {order?.status?.replace(/_/g, " ") || "—"}
              </span>
            </div>
          </div>
        </div>

        {loading && !order && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-[#ff8100] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Loading chat...</p>
            </div>
          </div>
        )}

        {error && !order && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center bg-white rounded-xl p-6 shadow-sm max-w-sm">
              <p className="text-gray-700 mb-4">{error}</p>
              <Button
                onClick={onClose}
                className="bg-[#ff8100] hover:bg-[#e67300] text-white"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {order && (
          <>
            {!chatAllowed && (
              <div className="px-4 py-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-800">
                  Chat closed. Order delivered successfully.
                </div>
              </div>
            )}

            {/* Quick action buttons (delivery partner only) */}
            {chatAllowed && (
              <div className="px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0">
                <p className="text-xs font-medium text-gray-500 mb-2">Quick messages</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_MESSAGES.map((msg) => (
                    <button
                      key={msg}
                      type="button"
                      onClick={() => handleSend(msg)}
                      disabled={sending}
                      className="px-3 py-1.5 rounded-full bg-[#ff8100]/10 text-[#ff8100] text-xs font-medium hover:bg-[#ff8100]/20 transition-colors disabled:opacity-50"
                    >
                      {msg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages - pb so content isn't hidden behind fixed input */}
            <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
              {messages.length === 0 && !loading && (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No messages yet.</p>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg._id || `${msg.timestamp}-${msg.message?.slice(0, 8)}`}
                  className={`flex ${msg.sender === "delivery" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 ${
                      msg.sender === "delivery"
                        ? "bg-[#ff8100] text-white rounded-br-md"
                        : "bg-white text-gray-900 shadow-sm rounded-bl-md"
                    }`}
                  >
                    <p className="text-sm md:text-base break-words">{msg.message}</p>
                    <p
                      className={`text-[10px] mt-1 ${
                        msg.sender === "delivery" ? "text-white/80" : "text-gray-500"
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input - fixed to bottom */}
            {chatAllowed && (
              <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
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
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || sending}
                    className="rounded-xl bg-[#ff8100] hover:bg-[#e67300] text-white px-4"
                  >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
