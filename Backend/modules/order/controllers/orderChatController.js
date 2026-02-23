import {
  getChatForUser,
  getChatForDelivery,
  addMessage as addMessageService
} from '../services/orderChatService.js';

async function getIO() {
  try {
    const serverModule = await import('../../../server.js');
    return serverModule.getIO ? serverModule.getIO() : null;
  } catch (e) {
    return null;
  }
}

/**
 * GET /api/order/:orderId/chat
 * Get chat for order (user only)
 */
export async function getOrderChat(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { orderId } = req.params;
    if (!userId || !orderId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or auth' });
    }
    const result = await getChatForUser(orderId, userId);
    if (!result.order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.json({
      success: true,
      data: {
        order: result.order,
        chat: result.chat,
        chatAllowed: result.allowed
      }
    });
  } catch (error) {
    console.error('getOrderChat error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get chat' });
  }
}

/**
 * POST /api/order/:orderId/chat/messages
 * Send a message (user only)
 */
export async function sendOrderChatMessage(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { orderId } = req.params;
    const { message } = req.body || {};
    if (!userId || !orderId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or auth' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    const payload = await addMessageService(orderId, 'user', message.trim(), userId, getIO);
    if (!payload) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message. Order not found, chat closed, or not authorized.'
      });
    }
    return res.json({ success: true, data: { message: payload } });
  } catch (error) {
    console.error('sendOrderChatMessage error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
}

/**
 * GET /api/delivery/orders/:orderId/chat
 * Get chat for order (delivery partner)
 * Delivery auth middleware sets req.delivery, not req.user
 */
export async function getOrderChatDelivery(req, res) {
  try {
    const deliveryId = req.delivery?._id?.toString() || req.delivery?.id || req.user?.id || req.user?._id;
    const { orderId } = req.params;
    if (!deliveryId || !orderId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or auth' });
    }
    const result = await getChatForDelivery(orderId, deliveryId);
    if (!result.order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.json({
      success: true,
      data: {
        order: result.order,
        chat: result.chat,
        chatAllowed: result.allowed
      }
    });
  } catch (error) {
    console.error('getOrderChatDelivery error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get chat' });
  }
}

/**
 * POST /api/delivery/orders/:orderId/chat/messages
 * Send a message (delivery partner)
 * Delivery auth middleware sets req.delivery, not req.user
 */
export async function sendOrderChatMessageDelivery(req, res) {
  try {
    const deliveryId = req.delivery?._id?.toString() || req.delivery?.id || req.user?.id || req.user?._id;
    const { orderId } = req.params;
    const { message } = req.body || {};
    if (!deliveryId || !orderId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or auth' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    const payload = await addMessageService(orderId, 'delivery', message.trim(), deliveryId, getIO);
    if (!payload) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message. Order not found, chat closed, or not authorized.'
      });
    }
    return res.json({ success: true, data: { message: payload } });
  } catch (error) {
    console.error('sendOrderChatMessageDelivery error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
}
