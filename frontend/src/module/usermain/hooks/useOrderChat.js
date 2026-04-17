import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { userAPI } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api/config.js';

const backendUrl = API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';

/**
 * Hook for order chat: fetch chat, socket for real-time, send message.
 * @param {string} orderId - Order ID (Mongo _id or orderId string)
 * @param {object} options - { enabled: boolean }
 */
export function useOrderChat(orderId, options = {}) {
  const { enabled = true } = options;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [chatAllowed, setChatAllowed] = useState(false);
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);
  const activeOrderRoomIds = useMemo(
    () => Array.from(new Set([orderId, order?._id, order?.orderId].filter(Boolean).map(String))),
    [orderId, order?._id, order?.orderId]
  );

  const fetchChat = useCallback(async () => {
    if (!orderId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await userAPI.getOrderChat(orderId);
      const data = res?.data?.data;
      if (!data) {
        setChatAllowed(false);
        setMessages([]);
        setOrder(null);
        return;
      }
      setOrder(data.order);
      setChatAllowed(!!data.chatAllowed);
      setMessages(Array.isArray(data.chat?.messages) ? data.chat.messages : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load chat');
      setMessages([]);
      setChatAllowed(false);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, enabled]);

  useEffect(() => {
    fetchChat();
  }, [fetchChat]);

  useEffect(() => {
    if (!orderId || !enabled || !chatAllowed) return;

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        fetchChat();
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [orderId, enabled, chatAllowed, fetchChat]);

  // Socket: join order-chat room and listen for new messages
  useEffect(() => {
    if (!orderId || !enabled) return;
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      path: '/socket.io/',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    socketRef.current = socket;

    const joinChatRooms = () => {
      activeOrderRoomIds.forEach((roomId) => socket.emit('join-order-chat', roomId));
    };

    socket.on('connect', joinChatRooms);
    socket.io.on('reconnect', joinChatRooms);
    socket.on('connect_error', (err) => {
      console.warn('Order chat socket connection failed:', err?.message || err);
    });

    socket.on('chat_message', (payload) => {
      const payloadOrderIds = [payload?.orderMongoId, payload?.orderId].filter(Boolean).map(String);
      const isCurrentOrder = activeOrderRoomIds.some((roomId) => payloadOrderIds.includes(roomId));

      if (!payload || !isCurrentOrder) return;

      setMessages((prev) => {
        const idMatch = payload._id && prev.some((m) => String(m._id) === String(payload._id));
        const contentMatch = prev.some(
          (m) =>
            m.sender === payload.sender &&
            m.message === payload.message &&
            Math.abs(new Date(m.timestamp).getTime() - new Date(payload.timestamp).getTime()) < 2000
        );
        if (idMatch || contentMatch) return prev;
        return [
          ...prev,
          {
            _id: payload._id,
            sender: payload.sender,
            message: payload.message,
            timestamp: payload.timestamp
          }
        ];
      });
    });

    return () => {
      activeOrderRoomIds.forEach((roomId) => socket.emit('leave-order-chat', roomId));
      socket.io.off('reconnect', joinChatRooms);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId, enabled, activeOrderRoomIds]);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text?.trim();
      if (!trimmed || !orderId || !chatAllowed) return { success: false };

      // Optimistic UI update: show message instantly
      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimisticMessage = {
        _id: tempId,
        sender: "user",
        message: trimmed,
        timestamp: new Date().toISOString(),
        _optimistic: true,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        await userAPI.sendOrderChatMessage(orderId, trimmed);
        // Real message usually arrives via socket; refresh covers production proxies that block it.
        window.setTimeout(fetchChat, 800);
        return { success: true };
      } catch (err) {
        // Roll back optimistic message on failure
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        return {
          success: false,
          error: err?.response?.data?.message || err?.message,
        };
      }
    },
    [orderId, chatAllowed, fetchChat]
  );

  return {
    loading,
    error,
    order,
    chatAllowed,
    messages,
    sendMessage,
    refetch: fetchChat
  };
}
