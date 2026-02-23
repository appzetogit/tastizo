import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { deliveryAPI } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api/config.js';

const backendUrl = API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';

export const QUICK_MESSAGES = [
  'I am near your location',
  'Please come outside',
  'Order picked up',
  'Reached restaurant',
  'Delivered successfully'
];

/**
 * Hook for delivery partner order chat.
 */
export function useDeliveryOrderChat(orderId, options = {}) {
  const { enabled = true } = options;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [chatAllowed, setChatAllowed] = useState(false);
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);

  const fetchChat = useCallback(async () => {
    if (!orderId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await deliveryAPI.getOrderChat(orderId);
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
    if (!orderId || !enabled) return;
    const socket = io(backendUrl, { transports: ['websocket', 'polling'], path: '/socket.io/' });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-order-chat', orderId);
    });

    socket.on('chat_message', (payload) => {
      if (!payload || (payload.orderMongoId !== orderId && payload.orderId !== orderId)) return;
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
          { _id: payload._id, sender: payload.sender, message: payload.message, timestamp: payload.timestamp }
        ];
      });
    });

    return () => {
      socket.emit('leave-order-chat', orderId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId, enabled]);

  const sendMessage = useCallback(
    async (text) => {
      if (!text?.trim() || !orderId || !chatAllowed) return { success: false };
      try {
        await deliveryAPI.sendOrderChatMessage(orderId, text.trim());
        // Do not add locally - backend emits to room, we add once via socket (avoids duplicates)
        return { success: true };
      } catch (err) {
        return { success: false, error: err?.response?.data?.message || err?.message };
      }
    },
    [orderId, chatAllowed]
  );

  return { loading, error, order, chatAllowed, messages, sendMessage, refetch: fetchChat };
}
