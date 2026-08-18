const express = require('express');
const router = express.Router();
const { createSpoilage, getSpoilages, deleteSpoilage } = require('../controllers/spoilageController');

router.route('/')
  .get(getSpoilages)
  .post(createSpoilage);

router.route('/:id')
  .delete(deleteSpoilage);

module.exports = router;
