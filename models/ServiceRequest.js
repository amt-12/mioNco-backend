const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema({
    table: {
        type: mongoose.Schema.ObjectId,
        ref: 'Table',
        required: true
    },
    waiter: {
        type: mongoose.Schema.ObjectId,
        ref: 'User' // The waiter assigned to the table at the time of request
    },
    type: {
        type: String,
        enum: ['Call Waiter', 'Water Request', 'Bill Request', 'Cleaning Request', 'Food Ready', 'Special Assistance', 'Extra Cutlery', 'Tissue Request'],
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Acknowledged', 'Completed', 'Cancelled'],
        default: 'Pending'
    },
    priority: {
        type: String,
        enum: ['Normal', 'High', 'Urgent'],
        default: 'Normal'
    },
    order: {
        type: mongoose.Schema.ObjectId,
        ref: 'Order' // Populated if type is 'Food Ready'
    },
    notes: {
        type: String // E.g., customer custom message
    },
    resolvedAt: {
        type: Date
    },
    resolvedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
