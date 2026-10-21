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
        enum: ['GST', 'VAT', 'Exempt'],
        default: 'GST',
        set: function(val) {
            if (val === 'Inherit' || !val) {
                return (this && this.itemType === 'Liquor') ? 'VAT' : 'GST';
            }
            return val;
        }
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
    spoilageMarkedBy: String,
    isAirMenuOrder: {
        type: Boolean,
        default: false
    }
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
        enum: ['Table QR', 'Air Menu', 'Customer (Air Menu)', 'Waiter', 'Waiter POS', 'Reception', 'Admin', 'Dine In', 'Dine-In', 'Takeaway', 'Delivery', 'POS'],
        default: 'Waiter'
    },
    isAirMenuOrder: {
        type: Boolean,
        default: false
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
    pax: {
        type: Number,
        default: 1
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
    },
    transferredFromTable: {
        tableId: { type: mongoose.Schema.ObjectId, ref: 'Table' },
        tableNumber: String,
        tableName: String,
        floorName: String
    },
    coveredTables: [{ type: String }],
    businessDay: {
        type: mongoose.Schema.ObjectId,
        ref: 'BusinessDay',
        index: true
    },
    businessDate: {
        type: String,
        index: true
    }
}, {
    timestamps: true
});

orderSchema.pre('save', async function (next) {
    if (!this.businessDate) {
        try {
            const BusinessDay = mongoose.model('BusinessDay');
            const activeDay = await BusinessDay.findOne({ status: 'Open' }).sort({ createdAt: -1 });
            if (activeDay) {
                this.businessDay = activeDay._id;
                let bDate = activeDay.businessDate;
                if (!bDate && activeDay.startTime) {
                    const tzOffsetMs = -330 * 60 * 1000;
                    const localStart = new Date(activeDay.startTime.getTime() - tzOffsetMs);
                    const y = localStart.getUTCFullYear();
                    const m = String(localStart.getUTCMonth() + 1).padStart(2, '0');
                    const d = String(localStart.getUTCDate()).padStart(2, '0');
                    bDate = `${y}-${m}-${d}`;
                }
                this.businessDate = bDate;
            } else {
                // Fallback to local IST date of creation
                const tzOffsetMs = -330 * 60 * 1000;
                const refTime = this.createdAt ? new Date(this.createdAt) : new Date();
                const localDate = new Date(refTime.getTime() - tzOffsetMs);
                const y = localDate.getUTCFullYear();
                const m = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                const d = String(localDate.getUTCDate()).padStart(2, '0');
                this.businessDate = `${y}-${m}-${d}`;
            }
        } catch (err) {
            console.error('Error in Order pre-save businessDate hook:', err);
        }
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);
