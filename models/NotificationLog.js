const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    template: {
        type: mongoose.Schema.ObjectId,
        ref: 'NotificationTemplate'
    },
    recipientUser: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    recipientCustomer: {
        type: mongoose.Schema.ObjectId,
        ref: 'Customer'
    },
    channel: {
        type: String,
        enum: ['In-App', 'WhatsApp', 'SMS', 'Email', 'Push'],
        required: true
    },
    subject: {
        type: String
    },
    content: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Sent', 'Delivered', 'Failed'],
        default: 'Pending'
    },
    failureReason: {
        type: String
    },
    readAt: {
        type: Date
    },
    metadata: {
        type: Object // E.g., associated reservationId, orderId
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
