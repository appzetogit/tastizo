import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'delivery'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const orderChatSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deliveryPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery',
    default: null,
    index: true
  },
  messages: {
    type: [messageSchema],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  closedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

orderChatSchema.index({ orderId: 1 }, { unique: true });
orderChatSchema.index({ userId: 1, isActive: 1 });
orderChatSchema.index({ deliveryPartnerId: 1, isActive: 1 });

export default mongoose.model('OrderChat', orderChatSchema);
