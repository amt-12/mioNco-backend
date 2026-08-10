const express = require('express');
const router = express.Router();
const {
  getSections, createSection, updateSection, deleteSection,
  getCategories, createCategory, updateCategory, deleteCategory,
  getItems, getItem, createItem, updateItem, deleteItem,
  getMenuAnalytics
} = require('../controllers/menuController');

router.route('/analytics').get(getMenuAnalytics);

router.route('/sections')
  .get(getSections)
  .post(createSection);

router.route('/sections/:id')
  .put(updateSection)
  .delete(deleteSection);

router.route('/categories')
  .get(getCategories)
  .post(createCategory);

router.route('/categories/:id')
  .put(updateCategory)
  .delete(deleteCategory);

router.route('/items')
  .get(getItems)
  .post(createItem);

router.route('/items/:id')
  .get(getItem)
  .put(updateItem)
  .delete(deleteItem);

module.exports = router;
