const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
    reservationId: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        type: mongoose.Schema.ObjectId,
        ref: 'Customer',
        required: true
    },
    date: {
        type: Date,
        required: [true, 'Reservation date is required']
    },
    time: {
        type: String,
        required: [true, 'Reservation time is required (HH:mm)']
    },
    guests: {
        type: Number,
        required: [true, 'Number of guests is required'],
        min: 1
    },
    source: {
        type: String,
        enum: ['Public QR', 'Website', 'Reception', 'Phone', 'Walk-in', 'Admin', 'App'],
        default: 'Reception'
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Checked-in', 'Seated', 'Completed', 'Cancelled', 'No-Show', 'Waitlisted'],
        default: 'Pending'
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor'
    },
    tables: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Table'
    }],
    specialOccasion: {
        type: String,
        default: 'None'
    },
    seatingPreference: {
        type: String,
        enum: ['Indoor', 'Outdoor', 'Window', 'Private', 'Any'],
        default: 'Any'
    },
    specialRequests: {
        type: String
    },
    assignedStaff: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    waitlistPosition: {
        type: Number
    },
    durationMinutes: {
        type: Number,
        default: 120 // Default 2 hours dining duration
    },
    notes: {
        type: String
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure a customer cannot double book the same time slot
reservationSchema.index({ customer: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model('Reservation', reservationSchema);
