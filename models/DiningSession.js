const mongoose = require('mongoose');

const diningSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    table: {
        type: mongoose.Schema.ObjectId,
        ref: 'Table',
        required: false
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor'
    },
    customer: {
        type: mongoose.Schema.ObjectId,
        ref: 'Customer'
    },
    reservation: {
        type: mongoose.Schema.ObjectId,
        ref: 'Reservation'
    },
    waiter: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['Active', 'Completed', 'Cancelled'],
        default: 'Active'
    },
    guests: {
        type: Number,
        default: 1
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date
    },
    totalAmount: {
        type: Number,
        default: 0
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

diningSessionSchema.pre('save', async function (next) {
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
                const tzOffsetMs = -330 * 60 * 1000;
                const refTime = this.createdAt ? new Date(this.createdAt) : new Date();
                const localDate = new Date(refTime.getTime() - tzOffsetMs);
                const y = localDate.getUTCFullYear();
                const m = String(localDate.getUTCMonth() + 1).padStart(2, '0');
                const d = String(localDate.getUTCDate()).padStart(2, '0');
                this.businessDate = `${y}-${m}-${d}`;
            }
        } catch (err) {
            console.error('Error in DiningSession pre-save businessDate hook:', err);
        }
    }
    next();
});

module.exports = mongoose.model('DiningSession', diningSessionSchema);
