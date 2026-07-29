const express = require('express');
const { submitFeedback } = require('../controllers/feedbackController');

const router = express.Router();

// Allow public feedback submission from digital menu
router.post('/public', submitFeedback);

module.exports = router;
