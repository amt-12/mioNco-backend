const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a template name'],
        trim: true,
        unique: true
    },
    channel: {
        type: String,
        enum: ['In-App', 'WhatsApp', 'SMS', 'Email', 'Push'],
        required: true
    },
    subject: {
        type: String, // Mostly for Email
        trim: true
    },
    body: {
        type: String,
        required: [true, 'Please provide template body'],
        // Can contain placeholders like {{CustomerName}}, {{OrderNumber}}, {{Time}}
    },
    triggerEvent: {
        type: String,
        enum: [
            'Manual', 
            'On_Reservation_Created', 
            'On_Reservation_Confirmed', 
            'On_Order_Ready', 
            'On_Customer_Call', 
            'On_Loyalty_Points_Earned',
            'On_System_Alert'
        ],
        required: true
    },
    category: {
        type: String,
        enum: ['Operational', 'Marketing', 'Transactional', 'Alert'],
        default: 'Operational'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
