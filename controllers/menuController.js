const MenuSection = require('../models/MenuSection');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const AuditLog = require('../models/AuditLog');

// Helper for audit logs
const createAuditLog = async (req, action, entityType, entityId, previousValue, updatedValue) => {
  if (req.user) {
    await AuditLog.create({
      employeeId: req.user._id,
      employeeName: req.user.name,
      action,
      entityType,
      entityId,
      previousValue,
      updatedValue,
      ipAddress: req.ip
    });
  }
};

// --- MENU SECTIONS ---
exports.getSections = async (req, res) => {
  try {
    const sections = await MenuSection.find().sort({ displayOrder: 1 });
    res.status(200).json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createSection = async (req, res) => {
  try {
    const section = await MenuSection.create(req.body);
    await createAuditLog(req, 'Create', 'MenuSection', section._id, null, section);
    res.status(201).json({ success: true, data: section });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const oldSection = await MenuSection.findById(req.params.id);
    if (!oldSection) return res.status(404).json({ success: false, message: 'Section not found' });
    
    const section = await MenuSection.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    await createAuditLog(req, 'Update', 'MenuSection', section._id, oldSection, section);
    res.status(200).json({ success: true, data: section });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const section = await MenuSection.findById(req.params.id);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    await section.deleteOne();
    await createAuditLog(req, 'Delete', 'MenuSection', section._id, section, null);
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- MENU CATEGORIES ---
exports.getCategories = async (req, res) => {
  try {
    const categories = await MenuCategory.find().sort({ displayOrder: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const category = await MenuCategory.create(req.body);
    await createAuditLog(req, 'Create', 'MenuCategory', category._id, null, category);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const oldCat = await MenuCategory.findById(req.params.id);
    if (!oldCat) return res.status(404).json({ success: false, message: 'Category not found' });

    const category = await MenuCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    await createAuditLog(req, 'Update', 'MenuCategory', category._id, oldCat, category);
    res.status(200).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await MenuCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    await category.deleteOne();
    await createAuditLog(req, 'Delete', 'MenuCategory', category._id, category, null);
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- MENU ITEMS ---
exports.getItems = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.category) query.categories = req.query.category;
    
    const items = await MenuItem.find(query).populate('section');
    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id)
      .populate('section recommendedPairings similarDishes createdBy updatedBy');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createItem = async (req, res) => {
  try {
    const itemsData = Array.isArray(req.body) ? req.body : [req.body];
    
    for (let item of itemsData) {
      item.sku = 'SKU-' + Math.floor(Math.random() * 1000000).toString();
      item.createdBy = req.user ? req.user._id : null;
    }
    
    const items = await MenuItem.insertMany(itemsData);
    
    for (let item of items) {
      await createAuditLog(req, 'Create', 'MenuItem', item._id, null, item);
    }
    
    res.status(201).json({ success: true, data: items.length === 1 ? items[0] : items });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    req.body.updatedBy = req.user ? req.user._id : null;
    const oldItem = await MenuItem.findById(req.params.id);
    if (!oldItem) return res.status(404).json({ success: false, message: 'Item not found' });
    
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true
    });
    
    await createAuditLog(req, 'Update', 'MenuItem', item._id, oldItem, item);
    res.status(200).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    
    await item.deleteOne();
    await createAuditLog(req, 'Delete', 'MenuItem', item._id, item, null);
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- ANALYTICS DASHBOARD ---
exports.getMenuAnalytics = async (req, res) => {
  try {
    const totalItems = await MenuItem.countDocuments();
    const publishedItems = await MenuItem.countDocuments({ publishState: 'Published' });
    const draftItems = await MenuItem.countDocuments({ publishState: 'Draft' });
    
    const statusDistribution = await MenuItem.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    const categoryDistributionRaw = await MenuItem.aggregate([
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } }
    ]);
    const categoryDistribution = categoryDistributionRaw.map(c => ({
      name: c._id || 'Uncategorized',
      value: c.count
    }));

    const todaySpecials = await MenuItem.countDocuments({ badges: 'Today Special' });
    const chefRecs = await MenuItem.countDocuments({ badges: 'Chef Recommendation' });

    res.status(200).json({
      success: true,
      data: {
        totalItems,
        publishedItems,
        draftItems,
        statusDistribution,
        categoryDistribution,
        todaySpecials,
        chefRecs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
