const Feedback = require('../models/Feedback');

// @desc    Submit new feedback
// @route   POST /api/v1/feedback/public
// @access  Public
exports.submitFeedback = async (req, res) => {
    try {
        const { tableId, rating, comments } = req.body;

        if (!tableId || !rating) {
            return res.status(400).json({ success: false, message: 'Table and Rating are required' });
        }

        const feedback = await Feedback.create({
            table: tableId,
            rating,
            comments
        });

        res.status(201).json({ success: true, data: feedback });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
