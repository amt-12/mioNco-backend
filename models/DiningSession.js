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
        required: true
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
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('DiningSession', diningSessionSchema);
