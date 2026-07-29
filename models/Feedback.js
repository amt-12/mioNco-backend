const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    table: {
        type: mongoose.Schema.ObjectId,
        ref: 'Table',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comments: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Feedback', feedbackSchema);
