const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    menuItem: {
        type: mongoose.Schema.ObjectId,
        ref: 'MenuItem',
        required: false
    },
    isOnRequest: {
        type: Boolean,
        default: false
    },
    foodName: {
        type: String
    },
    itemType: {
        type: String,
        enum: ['Food', 'Liquor'],
        default: 'Food'
    },
    taxType: {
        type: String,
        enum: ['GST', 'VAT'],
        default: 'GST'
    },
    taxRate: {
        type: Number
    },
    addedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    reason: {
        type: String
    },
    variant: {
        name: String,
        price: Number
    },
    customizations: [{
        group: String,
        option: String,
        price: Number
    }],
    quantity: {
        type: Number,
        required: true,
        min: [0, 'Quantity cannot be negative']
    },
    unitPrice: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    notes: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending', 'Preparing', 'Ready', 'Served', 'Cancelled'],
        default: 'Pending'
    },
    servedAt: Date,
    cancelledAt: Date,
    cancelledReason: String,
    isSpoiled: {
        type: Boolean,
        default: false
    },
    spoilageRemarks: String,
    spoilageMarkedBy: String
}, { _id: true }); // ensure subdocs have IDs

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    session: {
        type: mongoose.Schema.ObjectId,
        ref: 'DiningSession',
        required: false
    },
    table: {
        type: mongoose.Schema.ObjectId,
        ref: 'Table'
    },
    source: {
        type: String,
        enum: ['Table QR', 'Waiter', 'Waiter POS', 'Reception', 'Admin', 'Dine In', 'Dine-In', 'Takeaway', 'Delivery', 'POS'],
        default: 'Waiter'
    },
    waiter: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    items: [orderItemSchema],
    status: {
        type: String,
        enum: ['Draft', 'Pending Acceptance', 'Accepted', 'Preparing', 'Ready to Serve', 'Served', 'Completed', 'Cancelled'],
        default: 'Pending Acceptance'
    },
    priority: {
        type: String,
        enum: ['Normal', 'High Priority', 'VIP', 'Urgent', 'Chef Priority'],
        default: 'Normal'
    },
    subtotal: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        default: 0
    },
    customerNotes: {
        type: String
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Pending', 'Non-Chargeable', 'NC'],
        default: 'Pending'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Non-Chargeable'],
        default: 'Pending'
    },
    paymentDetails: {
        cashReceived: Number,
        changeGiven: Number,
        upiTxnId: String,
        cardType: String,
        cardRef: String,
        paidAt: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
