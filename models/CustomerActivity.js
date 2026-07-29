const mongoose = require('mongoose');

const customerActivitySchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.ObjectId,
        ref: 'Customer',
        required: true
    },
    type: {
        type: String,
        enum: ['Reservation', 'Order', 'Feedback', 'Note', 'Loyalty Points Added', 'Loyalty Points Redeemed', 'Tier Upgrade', 'Complaint'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    referenceId: {
        type: mongoose.Schema.ObjectId
        // Can point to Reservation, Order, etc. based on 'type'
    },
    metadata: {
        type: Object // Flexible payload for things like points amount, tags, etc.
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User' // Staff member who added a note, if applicable
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CustomerActivity', customerActivitySchema);
