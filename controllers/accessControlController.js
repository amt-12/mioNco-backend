const User = require('../models/User');

// System Modules definition matching sidebar structure
const SYSTEM_MODULES = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'DashboardOutlined',
    key: '/dashboard',
  },
  {
    id: 'restaurant_group',
    name: 'Table & Floor Mgmt',
    icon: 'ShopOutlined',
    key: 'restaurant-group',
    children: [
      { id: 'table_analytics', name: 'Analytics', key: '/tables/dashboard' },
      { id: 'live_floor', name: 'Live Floor Plan', key: '/tables/live' },
      { id: 'floor_setup', name: 'Floor Setup', key: '/floor' },
      { id: 'table_setup', name: 'Table Setup', key: '/tables/setup' },
    ]
  },
  {
    id: 'menu_group',
    name: 'Menu Mgmt',
    icon: 'ProfileOutlined',
    key: 'menu-group',
    children: [
      { id: 'menu_overview', name: 'Overview', key: '/menu/dashboard' },
      { id: 'menu_sections', name: 'Menu Sections', key: '/menu/sections' },
      { id: 'food_items', name: 'Food Items', key: '/menu/items' },
    ]
  },
  {
    id: 'billing_group',
    name: 'Billing & Invoices',
    icon: 'DollarOutlined',
    key: 'billing-group',
    children: [
      { id: 'revenue_overview', name: 'Revenue Overview', key: '/billing/dashboard' },
      { id: 'invoices_directory', name: 'Invoices Directory', key: '/billing/invoices' },
      { id: 'daily_sales_report', name: 'Daily Sales Report', key: '/billing/daily-sales-report' }
    ]
  },
  {
    id: 'qr_group',
    name: 'QR Management',
    icon: 'QrcodeOutlined',
    key: 'qr-group',
    children: [
      { id: 'qr_analytics', name: 'QR Analytics', key: '/qr/dashboard' },
      { id: 'qr_directory', name: 'QR Directory', key: '/qr/manage' },
    ]
  },
  {
    id: 'orders',
    name: 'Order Management',
    icon: 'ShoppingCartOutlined',
    key: 'orders',
    children: [
      { id: 'order_dashboard', name: 'Order Dashboard', key: '/orders/dashboard' },
      { id: 'waiter_pos', name: 'Waiter POS', key: '/orders/pos' },
      { id: 'waiter_punches', name: 'Waiter Punch Stats', key: '/orders/waiter-punches' },
      { id: 'all_orders', name: 'All Orders', key: '/orders/list' },
      { id: 'popular_by_floor', name: 'Most Ordered by Floor', key: '/orders/popular-by-floor' }
    ]
  },
  {
    id: 'inventory_group',
    name: 'Inventory Management',
    icon: 'InboxOutlined',
    key: 'inventory-group',
    children: [
      { id: 'inventory_dashboard', name: 'Raw Materials & Stock', key: '/inventory/dashboard' },
      { id: 'inventory_kitchen_issues', name: 'Issued Stock to Kitchen', key: '/inventory/kitchen-issues' }
    ]
  },
  {
    id: 'spoilage',
    name: 'Food Spoilage Log',
    icon: 'WarningOutlined',
    key: '/spoilage'
  },
  {
    id: 'kitchen',
    name: 'Kitchen Dashboard',
    icon: 'FireOutlined',
    key: 'kitchen',
    children: [
      { id: 'kitchen_analytics', name: 'Kitchen Analytics', key: '/kitchen/dashboard' },
      { id: 'live_kds', name: 'Live KDS', key: '/kitchen/kds' },
      { id: 'kitchen_history', name: 'Kitchen History', key: '/kitchen/history' },
    ]
  },
  {
    id: 'waiters',
    name: 'Waiter Operations',
    icon: 'BellOutlined',
    key: 'waiters',
    children: [
      { id: 'task_queue', name: 'My Task Queue', key: '/waiters/tasks' },
    ]
  },
  {
    id: 'reservations',
    name: 'Reservations',
    icon: 'CalendarOutlined',
    key: 'reservations',
    children: [
      { id: 'res_dashboard', name: 'Dashboard', key: '/reservations/dashboard' },
      { id: 'res_list', name: 'Reception / Check-in', key: '/reservations/list' },
      { id: 'res_calendar', name: 'Calendar View', key: '/reservations/calendar' },
      { id: 'res_new', name: 'New Booking', key: '/reservations/new' },
    ]
  },
  {
    id: 'crm',
    name: 'Customer CRM',
    icon: 'TeamOutlined',
    key: 'crm',
    children: [
      { id: 'crm_analytics', name: 'CRM Analytics', key: '/crm/dashboard' },
      { id: 'customer_directory', name: 'Customer Directory', key: '/crm/directory' },
      { id: 'loyalty_settings', name: 'Loyalty Settings', key: '/crm/loyalty' },
    ]
  },
  {
    id: 'hr',
    name: 'HR & Onboarding',
    icon: 'TeamOutlined',
    key: 'hr',
    children: [
      { id: 'hr_dashboard', name: 'HR Dashboard', key: '/hr/dashboard' },
      { id: 'employee_directory', name: 'Employee Directory', key: '/hr/directory' },
      { id: 'onboard_staff', name: 'Onboard Staff', key: '/hr/onboard' },
    ]
  },
  {
    id: 'access_control',
    name: 'Access Control',
    icon: 'SafetyCertificateOutlined',
    key: '/access-control',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: 'SettingOutlined',
    key: '/settings',
  }
];

// @desc    Get all side components / modules
// @route   GET /api/v1/access-control/modules
// @access  Private
exports.getModules = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: SYSTEM_MODULES
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current user dynamic sidebar navigation based on permissions
// @route   GET /api/v1/access-control/my-navigation
// @access  Private
exports.getMyNavigation = async (req, res) => {
  try {
    const user = req.user;
    const normalizedRole = (user?.role || '').toLowerCase().replace(/[\s_-]+/g, '');

    // Super Admin / Admin gets all system modules automatically
    if (normalizedRole === 'superadmin' || normalizedRole === 'admin' || normalizedRole.includes('superadmin')) {
      return res.status(200).json({
        success: true,
        data: SYSTEM_MODULES
      });
    }

    // Filter permissions for staff members
    const userPerms = user.permissions || [];
    const permMap = {};
    userPerms.forEach(p => {
      if (p.read || p.allAccess || p.granted) {
        permMap[p.moduleKey] = true;
      }
    });

    // Default access to dashboard
    permMap['dashboard'] = true;

    const filteredModules = SYSTEM_MODULES.map(group => {
      if (!group.children) {
        if (permMap[group.id] || group.id === 'dashboard') {
          return group;
        }
        return null;
      }

      const filteredChildren = group.children.filter(sub => permMap[sub.id]);
      if (filteredChildren.length > 0) {
        return {
          ...group,
          children: filteredChildren
        };
      }
      return null;
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      data: filteredModules
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all staff members for access control
// @route   GET /api/v1/access-control/users
// @access  Private
exports.getStaffUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email role status profileImage permissions createdAt');
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user permissions
// @route   GET /api/v1/access-control/users/:userId
// @access  Private
exports.getUserPermissions = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId, 'name email role status permissions');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        permissions: user.permissions || []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user permissions matrix
// @route   PUT /api/v1/access-control/users/:userId
// @access  Private (Super Admin / Admin)
exports.updateUserPermissions = async (req, res) => {
  try {
    const { permissions } = req.body;

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.permissions = permissions;
    await user.save();

    res.status(200).json({
      success: true,
      message: `Permissions updated successfully for ${user.name}`,
      data: user.permissions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
