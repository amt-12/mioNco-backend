// @desc    Get top KPI stats
// @route   GET /api/v1/dashboard/kpis
// @access  Private (Admin/Manager roles)
exports.getDashboardKPIs = async (req, res, next) => {
    try {
        // Since we don't have real Orders/Reservations models yet, we return mock data
        // designed exactly as the frontend expects.
        const data = {
            todayRevenue: { value: 14500, trend: 12.5 }, // 12.5% up
            todayOrders: { value: 184, trend: 8.2 },
            totalSales: { value: 342500, trend: 15.0 },
            activeCustomers: { value: 42, trend: -2.1 },
            
            // Table metrics
            tables: {
                total: 45,
                occupied: 18,
                reserved: 12,
                available: 15,
                utilization: 66, // 66%
            },
            
            // Order Statuses
            orders: {
                pending: 12,
                preparing: 24,
                ready: 8,
                served: 135,
                cancelled: 5
            },
            
            // Averages
            averageOrderValue: { value: 78.80, trend: 4.1 },
            averagePrepTime: { value: 24, trend: -5.0 }, // 24 mins, decreased by 5% (good)
            
            // Reservations
            reservations: {
                today: 28,
                upcoming: 15
            }
        };

        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Revenue Analytics (Charts)
// @route   GET /api/v1/dashboard/revenue
// @access  Private
exports.getRevenueAnalytics = async (req, res, next) => {
    try {
        // Mock daily revenue data for the chart
        const data = [
            { name: 'Mon', revenue: 12000, orders: 150 },
            { name: 'Tue', revenue: 13500, orders: 165 },
            { name: 'Wed', revenue: 11000, orders: 140 },
            { name: 'Thu', revenue: 15000, orders: 190 },
            { name: 'Fri', revenue: 22000, orders: 250 },
            { name: 'Sat', revenue: 28000, orders: 320 },
            { name: 'Sun', revenue: 24000, orders: 280 },
        ];
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Floor Performance
// @route   GET /api/v1/dashboard/floors
// @access  Private
exports.getFloorAnalytics = async (req, res, next) => {
    try {
        const data = [
            { name: 'Mio Skybar', revenue: 8500, occupancy: 85, orders: 45 },
            { name: 'Mio Elite', revenue: 12000, occupancy: 60, orders: 30 },
            { name: 'Mio Privè', revenue: 4500, occupancy: 40, orders: 15 },
            { name: 'Mio Bistro', revenue: 5000, occupancy: 70, orders: 60 },
            { name: 'Mio Palazzo', revenue: 9000, occupancy: 90, orders: 70 },
        ];
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Recent Activities
// @route   GET /api/v1/dashboard/activities
// @access  Private
exports.getRecentActivities = async (req, res, next) => {
    try {
        const data = [
            { id: 1, type: 'order', title: 'New Order #4021', time: '5 mins ago', description: 'Table 14 placed an order for $145.' },
            { id: 2, type: 'reservation', title: 'VIP Reservation', time: '15 mins ago', description: 'John Doe reserved Mio Elite for 8 PM.' },
            { id: 3, type: 'kitchen', title: 'Kitchen Alert', time: '28 mins ago', description: 'Wagyu Beef inventory running low (5 left).' },
            { id: 4, type: 'user', title: 'New Customer', time: '1 hour ago', description: 'Sarah Smith registered via Website.' },
        ];
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
