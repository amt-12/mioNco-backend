const express = require('express');
const router = express.Router();
const {
  getSections, createSection, updateSection, deleteSection,
  getCategories, createCategory,
  getItems, getItem, createItem, updateItem, deleteItem,
  getMenuAnalytics
} = require('../controllers/menuController');

// Using mock auth middleware for now until we integrate the actual one
// const { protect, authorize } = require('../middlewares/auth');

router.route('/analytics').get(getMenuAnalytics);

router.route('/sections')
  .get(getSections)
  .post(createSection);

router.route('/sections/:id')
  .put(updateSection)
  .delete(deleteSection);

router.route('/items')
  .get(getItems)
  .post(createItem);

router.route('/items/:id')
  .get(getItem)
  .put(updateItem)
  .delete(deleteItem);

module.exports = router;
