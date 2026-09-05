const Order = require('../models/Order');
const DiningSession = require('../models/DiningSession');
const MenuItem = require('../models/MenuItem');
const ServiceRequest = require('../models/ServiceRequest');
const Table = require('../models/Table');
const AuditLog = require('../models/AuditLog');
const RestaurantSettings = require('../models/RestaurantSettings');

// Utility to generate IDs
const generateId = async (prefix, model) => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    let unique = false;
    while (!unique) {
        id = `${prefix}-`;
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        let existing;
        if (prefix === 'ORD') existing = await model.findOne({ orderId: id });
        else existing = await model.findOne({ sessionId: id });
        
        if (!existing) unique = true;
    }
    return id;
};

// @desc    Place a new Order
// @route   POST /api/v1/orders
// Helper to consolidate multiple active orders for the same table session into ONE master order card
const consolidateActiveTableOrders = async (tableId, sessionId) => {
    try {
        const activeOrders = await Order.find({
            table: tableId,
            session: sessionId,
            status: { $nin: ['Completed', 'Cancelled'] }
        }).sort({ createdAt: 1 });

        if (activeOrders.length <= 1) return activeOrders[0] || null;

        const masterOrder = activeOrders[0];
        const redundantOrders = activeOrders.slice(1);

        const RestaurantSettings = require('../models/RestaurantSettings');
        const settings = await RestaurantSettings.findOne({ isSingleton: 'CONFIG' });
        const defaultGST = settings?.taxSettings?.defaultGSTPercent ?? 5;
        const defaultVAT = settings?.taxSettings?.defaultVATPercent ?? 18.9;

        let itemsAppended = false;
        for (const redOrder of redundantOrders) {
            if (redOrder.items && redOrder.items.length > 0) {
                masterOrder.items.push(...redOrder.items);
                itemsAppended = true;
            }
            if (redOrder.customerNotes && !masterOrder.customerNotes?.includes(redOrder.customerNotes)) {
                masterOrder.customerNotes = masterOrder.customerNotes 
                    ? `${masterOrder.customerNotes} | ${redOrder.customerNotes}` 
                    : redOrder.customerNotes;
            }
            await Order.findByIdAndDelete(redOrder._id);
        }

        if (itemsAppended) {
            masterOrder.markModified('items');
            let subtotal = 0;
            let totalTax = 0;
            masterOrder.items.forEach(i => {
                if (i.isSpoiled) return;
                const itemTotal = i.totalPrice || (i.unitPrice * i.quantity) || 0;
                subtotal += itemTotal;
                const rate = i.taxRate || (i.itemType === 'Liquor' ? defaultVAT : defaultGST);
                totalTax += (itemTotal * rate) / 100;
            });

            masterOrder.subtotal = Number(subtotal.toFixed(2));
            masterOrder.tax = Number(totalTax.toFixed(2));
            masterOrder.total = Math.round(subtotal + totalTax);
            await masterOrder.save();
        }

        return masterOrder;
    } catch (err) {
        console.error('Error consolidating table active orders:', err);
        return null;
    }
};

// @desc    Place a new Order
// @route   POST /api/v1/orders
// @access  Private
exports.createOrder = async (req, res) => {
    try {
        const { tableId, floorId, items, source, waiter, priority, customerNotes, pax, guests, paxCount } = req.body;
        const resolvedPax = Math.max(1, Number(pax || guests || paxCount || 1));
        const srcStr = String(source || '').toLowerCase();
        const isAirMenu = srcStr.includes('air') || srcStr.includes('qr') || srcStr.includes('table qr') || srcStr.includes('customer') || Boolean(req.body.isAirMenuOrder);

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart items are required' });
        }

        const mongoose = require('mongoose');
        let targetTable = null;
        let validTableId = null;
        let session = null;

        if (tableId) {
            if (mongoose.Types.ObjectId.isValid(tableId)) {
                targetTable = await Table.findById(tableId);
            }
            if (!targetTable) {
                targetTable = await Table.findOne({
                    $or: [
                        { tableNumber: tableId },
                        { tableNumber: tableId.toString().replace(/^t/i, '') },
                        { name: tableId },
                        { qrSlug: tableId }
                    ]
                });
            }

            validTableId = targetTable ? targetTable._id : tableId;

            // 1. Find or create Active Dining Session for this table
            session = await DiningSession.findOne({ table: validTableId, status: 'Active' });
        }

        if (!session) {
            const sessionId = await generateId('SESS', DiningSession);
            session = await DiningSession.create({
                sessionId,
                table: validTableId || null,
                floor: floorId || targetTable?.floor || null,
                waiter,
                status: 'Active',
                guests: resolvedPax,
                startTime: new Date()
            });
        } else if (pax || guests || paxCount) {
            session.guests = resolvedPax;
            await session.save();
        }

            // Mark table as Occupied and emit real-time status
            if (targetTable) {
                targetTable.status = 'Occupied';
                if (isAirMenu) {
                    targetTable.hasAirMenuOrder = true;
                }
                await targetTable.save();

                const io = req.app.get('io');
                if (io) {
                    const populatedTable = await Table.findById(targetTable._id)
                        .populate('assignedWaiter', 'name')
                        .populate('mergedWith', 'tableNumber');
                    io.emit('table_status_changed', populatedTable);
                    io.emit('table_status_updated', populatedTable);
                    io.emit('new_air_menu_order', { table: populatedTable });
                }
            }

        // 2. Calculate totals & process items
        const settings = await RestaurantSettings.findOne({ isSingleton: 'CONFIG' });
        const defaultGST = settings?.taxSettings?.defaultGSTPercent ?? 5;
        const defaultVAT = settings?.taxSettings?.defaultVATPercent ?? 18.9;

        let addedSubtotal = 0;
        let addedTax = 0;
        const onRequestItemsLogged = [];

        const processedItems = await Promise.all(items.map(async item => {
            if (item.isOnRequest) {
                const foodName = item.foodName || item.name || 'On-Request Item';
                const itemType = item.itemType === 'Liquor' ? 'Liquor' : 'Food';
                const taxType = item.taxType || (itemType === 'Liquor' ? 'VAT' : 'GST');
                const taxRate = taxType === 'VAT' ? defaultVAT : defaultGST;
                const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
                const quantity = Number(item.quantity || 1);
                const totalPrice = unitPrice * quantity;
                addedSubtotal += totalPrice;

                const itemTax = (totalPrice * taxRate) / 100;
                addedTax += itemTax;

                const processedOnReq = {
                    menuItem: null,
                    isOnRequest: true,
                    foodName,
                    itemType,
                    taxType,
                    taxRate,
                    unitPrice,
                    quantity,
                    totalPrice,
                    notes: item.notes || item.reason || '',
                    reason: item.reason || item.notes || '',
                    addedBy: req.user?._id || waiter || null,
                    status: 'Pending'
                };

                onRequestItemsLogged.push(processedOnReq);
                return processedOnReq;
            }

            const mId = typeof item.menuItem === 'object' ? item.menuItem?._id : (item.menuItem || item.menuItemId);
            let menuItemDoc = null;
            if (mId) {
                try {
                    menuItemDoc = await MenuItem.findById(mId);
                } catch (e) {}
            }

            let rawPrice = item.unitPrice ?? item.price ?? item.menuItem?.basePrice ?? item.menuItem?.price ?? item.menuItem?.discountedPrice;
            if ((rawPrice === undefined || rawPrice === null || Number(rawPrice) === 0) && menuItemDoc) {
                rawPrice = menuItemDoc.basePrice ?? menuItemDoc.discountedPrice ?? menuItemDoc.price ?? 0;
            }

            let unitPrice = Number(rawPrice || 0);

            if (item.variant && item.variant.price) unitPrice += Number(item.variant.price);
            
            if (item.customizations) {
                item.customizations.forEach(c => {
                    if (c.price) unitPrice += Number(c.price);
                });
            }
            
            const quantity = Number(item.quantity || 1);
            const totalPrice = unitPrice * quantity;
            addedSubtotal += totalPrice;

            const itemTax = (totalPrice * defaultGST) / 100;
            addedTax += itemTax;
            
            return {
                menuItem: mId || item.menuItem,
                isOnRequest: false,
                foodName: menuItemDoc?.foodName || menuItemDoc?.displayName || item.foodName || 'Item',
                variant: item.variant,
                customizations: item.customizations,
                quantity,
                unitPrice,
                totalPrice,
                notes: item.notes,
                addedBy: item.addedBy || item.waiter || req.user?._id || waiter || null,
                isAirMenuOrder: isAirMenu,
                status: 'Pending'
            };
        }));

        const addedTotal = Math.round(addedSubtotal + addedTax);

        // 3. Find existing active order or create new master order for this table
        let existingOrder = null;
        if (validTableId && session) {
            existingOrder = await Order.findOne({
                table: validTableId,
                session: session._id,
                status: { $nin: ['Completed', 'Cancelled'] }
            }).sort({ createdAt: 1 });
        }

        let order;

        if (existingOrder) {
            // Append items into existing active order for Table
            existingOrder.items.push(...processedItems);

            // Heal any 0 price items on existing order items if menuItem doc exists
            for (let i of existingOrder.items) {
                if ((!i.unitPrice || i.unitPrice === 0) && i.menuItem) {
                    try {
                        const mDoc = await MenuItem.findById(i.menuItem);
                        if (mDoc) {
                            i.unitPrice = Number(mDoc.basePrice || mDoc.discountedPrice || 0);
                            i.totalPrice = i.unitPrice * (i.quantity || 1);
                        }
                    } catch (e) {}
                }
            }

            let subtotal = 0;
            let totalTax = 0;
            existingOrder.items.forEach(i => {
                const itemTotal = i.totalPrice || (i.unitPrice * i.quantity) || 0;
                subtotal += itemTotal;
                const rate = i.taxRate || (i.itemType === 'Liquor' ? defaultVAT : defaultGST);
                totalTax += (itemTotal * rate) / 100;
            });

            existingOrder.subtotal = Number(subtotal.toFixed(2));
            existingOrder.tax = Number(totalTax.toFixed(2));
            existingOrder.total = Math.round(subtotal + totalTax);

            if (customerNotes && !existingOrder.customerNotes?.includes(customerNotes)) {
                existingOrder.customerNotes = existingOrder.customerNotes
                    ? `${existingOrder.customerNotes} | ${customerNotes}`
                    : customerNotes;
            }

            if (priority === 'High') {
                existingOrder.priority = 'High';
            }

            if (waiter) {
                existingOrder.waiter = waiter;
            }

            if (resolvedPax) {
                existingOrder.pax = resolvedPax;
            }

            if (isAirMenu) {
                existingOrder.isAirMenuOrder = true;
            }

            // Always reset status to 'Pending Acceptance' so newly added items land in 'Incoming' on Live KDS
            existingOrder.status = 'Pending Acceptance';

            order = await existingOrder.save();
        } else {
            const tax = Number(addedTax.toFixed(2));
            const total = Math.round(addedSubtotal + tax);
            const orderId = await generateId('ORD', Order);
            order = await Order.create({
                orderId,
                session: session ? session._id : null,
                table: validTableId || null,
                source: isAirMenu ? 'Air Menu' : (source || 'Waiter POS'),
                isAirMenuOrder: isAirMenu,
                waiter: waiter || req.user?._id || null,
                items: processedItems,
                status: 'Pending Acceptance',
                priority: priority || 'Normal',
                pax: resolvedPax,
                subtotal: Number(addedSubtotal.toFixed(2)),
                tax,
                total,
                customerNotes: customerNotes || ''
            });
        }

        // Also clean up any legacy duplicate active orders for this table if session exists
        if (validTableId && session) {
            await consolidateActiveTableOrders(validTableId, session._id);
        }

        // 3b. Log Audit Log entries for any On-Request Items added
        if (onRequestItemsLogged.length > 0) {
            try {
                const staffId = req.user?._id || waiter || session.waiter;
                const staffName = req.user?.name || 'Staff';
                if (staffId) {
                    await AuditLog.create({
                        employeeId: staffId,
                        employeeName: staffName,
                        action: 'Add On-Request Item',
                        entityType: 'Order',
                        entityId: order._id,
                        updatedValue: {
                            orderId: order.orderId,
                            tableId: validTableId,
                            onRequestItems: onRequestItemsLogged
                        },
                        ipAddress: req.ip || ''
                    });
                }
            } catch (auditErr) {
                console.error('AuditLog error for on-request item:', auditErr);
            }
        }

        // 4b. Customer Loyalty Spend Tracking & WhatsApp Coupon Trigger
        let couponUnlocked = false;
        let couponCode = '';
        const customerPhone = req.body.customerPhone || req.body.phone;

        if (customerPhone && String(customerPhone).trim().length >= 8) {
            try {
                const Customer = require('../models/Customer');
                const NotificationLog = require('../models/NotificationLog');
                const cleanPhone = String(customerPhone).trim();

                const custName = req.body.customerName || req.body.name;
                let customer = await Customer.findOne({ phone: cleanPhone });
                if (!customer) {
                    customer = await Customer.create({
                        name: custName ? custName.trim() : `Customer (${cleanPhone.slice(-4)})`,
                        phone: cleanPhone,
                        totalSpend: 0,
                        loyaltyPoints: 0
                    });
                } else {
                    if (custName && custName.trim() && (customer.name.startsWith('Customer (') || customer.name === 'Guest')) {
                        customer.name = custName.trim();
                    }
                }

                const currentOrderTotal = Number(addedTotal || order.total || 0);
                customer.totalSpend = (customer.totalSpend || 0) + currentOrderTotal;
                customer.totalVisits = (customer.totalVisits || 0) + 1;
                customer.lastVisit = new Date();
                customer.loyaltyPoints = (customer.loyaltyPoints || 0) + Math.floor(currentOrderTotal / 100);

                // Check if accumulated spend reaches ₹100,000 threshold
                if (customer.totalSpend >= 100000 && !customer.unlocked100kCoupon) {
                    couponUnlocked = true;
                    couponCode = `LOYALTY5-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                    customer.unlocked100kCoupon = true;
                    customer.couponCode = couponCode;

                    // Log & Send WhatsApp Notification
                    const whatsappMsg = `🎉 Congratulations from Mio & Co.! You have reached ₹1,00,000 in orders! Here is your 5% DISCOUNT COUPON: *${couponCode}*. Show this to redeem on your next visit!`;
                    await NotificationLog.create({
                        channel: 'WhatsApp',
                        subject: 'Mio & Co. 5% Loyalty Coupon',
                        content: whatsappMsg,
                        status: 'Sent',
                        metadata: { phone: cleanPhone, couponCode, totalSpend: customer.totalSpend }
                    });
                }

                await customer.save();

                // Attach customer to order & session for unified CRM history
                if (order && !order.customer) {
                    order.customer = customer._id;
                    await order.save();
                }
                if (session && !session.customer) {
                    session.customer = customer._id;
                    await session.save();
                }
            } catch (loyaltyErr) {
                console.error('Loyalty tracking error:', loyaltyErr);
            }
        }

        // 5. Populate and emit to Kitchen
        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName sku'
            });

        const io = req.app.get('io');
        if (io) {
            io.emit('new_kitchen_order', populatedOrder);
            io.emit('new_order', populatedOrder);
            if (isAirMenu) {
                io.emit('new_air_menu_order', populatedOrder);
                io.emit('air_menu_order', populatedOrder);
            }
            io.emit('order_status_updated', populatedOrder);
            io.emit('order_updated', populatedOrder);
        }

        res.status(201).json({ 
            success: true, 
            data: populatedOrder,
            couponUnlocked,
            couponCode,
            message: couponUnlocked 
                ? `Order placed! 5% WhatsApp coupon (${couponCode}) sent to your phone!` 
                : 'Order placed successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all active orders for Kitchen / Dashboard
// @route   GET /api/v1/orders
// @access  Private
exports.getOrders = async (req, res) => {
    try {
        const { status, table } = req.query;

        // Automatically consolidate duplicate active orders per active dining session
        try {
            const activeSessions = await DiningSession.find({ status: 'Active' });
            for (const sess of activeSessions) {
                await consolidateActiveTableOrders(sess.table, sess._id);
            }
        } catch (cErr) {
            console.error('Consolidation error in getOrders:', cErr);
        }

        let query = {};
        
        if (status) {
            query.status = { $in: status.split(',') };
        }
        if (table) {
            const mongoose = require('mongoose');
            let tObj = null;
            if (mongoose.Types.ObjectId.isValid(table)) {
                tObj = await Table.findById(table);
            }
            if (!tObj) {
                tObj = await Table.findOne({
                    $or: [
                        { tableNumber: table },
                        { tableNumber: table.toString().replace(/^t/i, '') },
                        { name: table },
                        { qrSlug: table }
                    ]
                });
            }
            query.table = tObj ? tObj._id : table;
        }

        const orders = await Order.find(query)
            .populate({
                path: 'table',
                populate: { path: 'floor', select: 'name floorNumber slug' }
            })
            .populate('waiter', 'name email role')
            .populate('items.addedBy', 'name email role')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName sku categories'
            })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Order Status (Overall)
// @route   PUT /api/v1/orders/:id/status
// @access  Private
exports.updateOrderStatus = async (req, res) => {
    try {
        const { status, paymentMethod, paymentDetails, paymentStatus } = req.body;
        const order = await Order.findById(req.params.id);
        
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.status = status;
        if (paymentMethod) order.paymentMethod = paymentMethod;
        if (paymentStatus) order.paymentStatus = paymentStatus;
        if (paymentDetails) {
            order.paymentDetails = { 
                ...order.paymentDetails, 
                ...paymentDetails, 
                paidAt: new Date() 
            };
        }
        if (status === 'Completed') {
            order.paymentStatus = 'Paid';
            if (!order.paymentMethod) order.paymentMethod = paymentMethod || 'Cash';
        }

        // If order status is Preparing, mark all pending items as Preparing
        if (status === 'Preparing') {
            order.items.forEach(item => {
                if (!item.status || item.status === 'Pending' || item.status === 'Pending Acceptance') {
                    item.status = 'Preparing';
                }
            });
        }

        // If order status is Ready to Serve, mark all items as Ready
        if (status === 'Ready to Serve' || status === 'Ready') {
            order.items.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Ready';
                }
            });
        }
        
        // If order is cancelled, optionally zero out from session
        if (status === 'Cancelled') {
            const session = await DiningSession.findById(order.session);
            if (session) {
                session.totalAmount -= order.total;
                if (session.totalAmount < 0) session.totalAmount = 0;
                await session.save();
            }
            // Mark all pending items as cancelled
            order.items.forEach(item => {
                if (item.status === 'Pending' || item.status === 'Preparing') {
                    item.status = 'Cancelled';
                    item.cancelledAt = new Date();
                    item.cancelledReason = 'Entire order cancelled';
                }
            });
        }
        
        // If order is Served, auto-update item statuses
        if (status === 'Served') {
            order.items.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Served';
                    item.servedAt = new Date();
                }
            });
        }

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName'
            });

        const io = req.app.get('io');
        if (io) io.emit('order_status_updated', populatedOrder);

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Individual Order Item Status
// @route   PUT /api/v1/orders/:orderId/items/:itemId/status
// @access  Private
exports.updateOrderItemStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { orderId, itemId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        let item = null;
        if (itemId) {
            item = order.items.id(itemId);
            if (!item) {
                item = order.items.find(i => String(i._id) === String(itemId) || String(i.id) === String(itemId));
            }
            if (!item && !isNaN(Number(itemId))) {
                const idx = parseInt(itemId, 10);
                if (order.items[idx]) item = order.items[idx];
            }
        }
        if (!item && req.body.foodName) {
            item = order.items.find(i => (i.foodName === req.body.foodName || i.menuItem?.foodName === req.body.foodName || i.menuItem?.displayName === req.body.foodName) && i.status !== 'Served');
        }

        if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

        item.status = status;
        if (status === 'Served') item.servedAt = new Date();
        if (status === 'Cancelled') item.cancelledAt = new Date();

        // Check if all items are served, or ready, then update overall order status
        const allItemsServedOrCancelled = order.items.length > 0 && order.items.every(i => 
            i.status === 'Served' || i.status === 'Cancelled'
        );
        const allItemsReadyOrServed = order.items.length > 0 && order.items.every(i => 
            i.status === 'Ready' || i.status === 'Served' || i.status === 'Cancelled'
        );
        
        if (allItemsServedOrCancelled && order.status !== 'Completed' && order.status !== 'Cancelled') {
            order.status = 'Served';
            order.servedAt = new Date();
        } else if (allItemsReadyOrServed && order.status !== 'Completed' && order.status !== 'Cancelled' && order.status !== 'Served') {
            order.status = 'Ready to Serve';
        }

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName kitchenStation'
            });

        const io = req.app.get('io');
        if (io) {
            io.emit('order_item_status_updated', populatedOrder);
            io.emit('order_status_updated', populatedOrder);
            io.emit('kitchen_order_updated', populatedOrder);
            io.emit('order_updated', populatedOrder);
        }

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Order Dashboard Analytics
// @route   GET /api/v1/orders/analytics/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        // Today's bounds
        const startOfToday = new Date();
        startOfToday.setUTCHours(0,0,0,0);
        const endOfToday = new Date();
        endOfToday.setUTCHours(23,59,59,999);

        const todaysOrders = await Order.find({ createdAt: { $gte: startOfToday, $lte: endOfToday } });

        const metrics = {
            total: todaysOrders.length,
            active: todaysOrders.filter(o => !['Completed', 'Cancelled', 'Served'].includes(o.status)).length,
            preparing: todaysOrders.filter(o => o.status === 'Preparing').length,
            ready: todaysOrders.filter(o => o.status === 'Ready to Serve').length,
            completed: todaysOrders.filter(o => o.status === 'Completed' || o.status === 'Served').length,
            cancelled: todaysOrders.filter(o => o.status === 'Cancelled').length
        };

        // Source distribution
        const sources = {};
        todaysOrders.forEach(o => {
            sources[o.source] = (sources[o.source] || 0) + 1;
        });

        res.status(200).json({ 
            success: true, 
            data: {
                metrics,
                sources: Object.keys(sources).map(name => ({ name, value: sources[name] }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject Individual Order Item
// @route   PUT /api/v1/orders/:orderId/items/:itemId/reject
// @access  Private
exports.rejectItem = async (req, res) => {
    try {
        const { reason } = req.body;
        const { orderId, itemId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        let item = null;
        if (itemId) {
            item = order.items.id(itemId);
            if (!item) {
                item = order.items.find(i => String(i._id) === String(itemId) || String(i.id) === String(itemId));
            }
        }
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

        item.status = 'Cancelled';
        item.cancelledAt = new Date();
        item.cancelledReason = reason || 'Rejected by staff';

        // Recalculate order subtotal, tax & total excluding cancelled items (voiding item)
        const settings = await RestaurantSettings.findOne({ isSingleton: 'CONFIG' });
        const defaultGST = settings?.taxSettings?.defaultGSTPercent ?? 5;
        const defaultVAT = settings?.taxSettings?.defaultVATPercent ?? 18.9;

        let subtotal = 0;
        let totalTax = 0;
        order.items.forEach(i => {
            if (i.status !== 'Cancelled' && i.status !== 'Rejected' && i.status !== 'Void') {
                const itemTotal = i.totalPrice || ((i.unitPrice || 0) * (i.quantity || 1)) || 0;
                subtotal += itemTotal;
                const rate = i.taxRate || (i.itemType === 'Liquor' ? defaultVAT : defaultGST);
                totalTax += (itemTotal * rate) / 100;
            }
        });

        order.subtotal = Number(subtotal.toFixed(2));
        order.tax = Number(totalTax.toFixed(2));
        order.total = Math.round(subtotal + totalTax);

        // Check overall order status
        const activeItems = order.items.filter(i => i.status !== 'Cancelled' && i.status !== 'Rejected' && i.status !== 'Void');
        if (activeItems.length === 0) {
            order.status = 'Cancelled';
        } else {
            const allActiveFinished = activeItems.every(i => i.status === 'Ready' || i.status === 'Served');
            if (allActiveFinished && order.status === 'Preparing') {
                order.status = 'Ready to Serve';
            }
        }

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName kitchenStation'
            });

        const io = req.app.get('io');
        if (io) {
            io.emit('order_item_status_updated', populatedOrder);
            io.emit('order_status_updated', populatedOrder);
            io.emit('kitchen_order_updated', populatedOrder);
            io.emit('order_updated', populatedOrder);
            if (order.table) {
                io.emit('table_orders_updated', { tableId: order.table });
            }
        }

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Recall Individual Order Item (e.g. from Ready back to Preparing)
// @route   PUT /api/v1/orders/:orderId/items/:itemId/recall
// @access  Private
exports.recallItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in order' });

        item.status = 'Preparing';
        item.servedAt = undefined;
        item.cancelledAt = undefined;

        if (order.status === 'Ready to Serve' || order.status === 'Served') {
            order.status = 'Preparing';
        }

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate({
                path: 'items.menuItem',
                select: 'foodName displayName kitchenStation'
            });

        const io = req.app.get('io');
        if (io) io.emit('order_item_status_updated', populatedOrder);

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Kitchen Specific Analytics
// @route   GET /api/v1/orders/analytics/kitchen
// @access  Private
exports.getKitchenAnalytics = async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0,0,0,0);
        const endOfToday = new Date();
        endOfToday.setUTCHours(23,59,59,999);

        // Fetch only orders that reached the kitchen
        const todaysOrders = await Order.find({ 
            createdAt: { $gte: startOfToday, $lte: endOfToday },
            status: { $ne: 'Draft' } 
        }).populate('items.menuItem');

        // Workload distribution
        const stations = {
            'Tandoor': 0, 'Grill': 0, 'Curry': 0, 'Wok': 0, 'Dessert': 0, 'Beverage': 0, 'General': 0
        };
        
        let totalPrepTimeMinutes = 0;
        let completedOrReadyCount = 0;
        
        let delayedOrders = 0;

        todaysOrders.forEach(o => {
            // Station items counting
            o.items.forEach(i => {
                if (i.menuItem && i.menuItem.kitchenStation) {
                    stations[i.menuItem.kitchenStation] = (stations[i.menuItem.kitchenStation] || 0) + i.quantity;
                } else {
                    stations['General'] = (stations['General'] || 0) + i.quantity;
                }
            });

            // Delay calculations (if more than 30 mins)
            const elapsed = Math.floor((new Date() - new Date(o.createdAt)) / 60000);
            if (!['Completed', 'Served', 'Cancelled', 'Ready to Serve'].includes(o.status) && elapsed > 30) {
                delayedOrders++;
            }

            // Average prep time calculation (rough estimate based on 'updatedAt' if ready/served)
            if (['Ready to Serve', 'Served', 'Completed'].includes(o.status)) {
                // Approximate time taken = updatedAt - createdAt
                const prepTime = Math.floor((new Date(o.updatedAt) - new Date(o.createdAt)) / 60000);
                totalPrepTimeMinutes += prepTime;
                completedOrReadyCount++;
            }
        });

        const avgPrepTime = completedOrReadyCount > 0 ? Math.round(totalPrepTimeMinutes / completedOrReadyCount) : 0;

        res.status(200).json({ 
            success: true, 
            data: {
                metrics: {
                    active: todaysOrders.filter(o => ['Pending Acceptance', 'Preparing'].includes(o.status)).length,
                    ready: todaysOrders.filter(o => o.status === 'Ready to Serve').length,
                    delayed: delayedOrders,
                    avgPrepTime
                },
                stations: Object.keys(stations).map(name => ({ name, value: stations[name] }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Checkout and Pay Bill (Public)
// @route   POST /api/v1/orders/public/checkout
// @desc    Checkout and Pay Bill (Public)
// @route   POST /api/v1/orders/public/checkout
// @access  Public (for Customer AIR Menu)
exports.checkoutOrder = async (req, res) => {
    try {
        const { tableId, paymentMethod = 'Cash', paymentDetails = {} } = req.body;
        if (!tableId) return res.status(400).json({ success: false, message: 'Table ID required' });

        const Table = require('../models/Table');
        const mongoose = require('mongoose');

        let table = null;
        if (mongoose.Types.ObjectId.isValid(tableId)) {
            table = await Table.findById(tableId);
        }
        if (!table) {
            table = await Table.findOne({
                $or: [
                    { tableNumber: tableId },
                    { tableNumber: tableId.toString().replace(/^t/i, '') },
                    { name: tableId },
                    { qrSlug: tableId }
                ]
            });
        }

        const queryTableId = table ? table._id : tableId;

        // Update active orders for this table to Completed
        const activeOrders = await Order.find({ 
            table: queryTableId, 
            status: { $nin: ['Completed', 'Cancelled'] } 
        });
        
        for (let order of activeOrders) {
            order.status = 'Completed';
            order.paymentMethod = paymentMethod;
            order.paymentStatus = 'Paid';
            order.paymentDetails = {
                ...order.paymentDetails,
                ...paymentDetails,
                paidAt: new Date()
            };
            await order.save();
        }

        // Also mark any pending Service Requests for this table as Completed
        try {
            await ServiceRequest.updateMany(
                { table: queryTableId, status: { $nin: ['Completed', 'Cancelled'] } },
                { status: 'Completed', resolvedAt: new Date() }
            );
        } catch (srErr) {
            console.error('Error resolving service requests on checkout:', srErr);
        }

        // Free up the table -> Set status to Available
        if (table) {
            table.status = 'Available';
            table.assignedWaiter = null;
            await table.save();
            
            try {
                await DiningSession.updateMany(
                    { table: table._id, status: 'Active' },
                    { status: 'Completed', endTime: new Date() }
                );
            } catch (sessErr) {
                console.error('Error closing dining session on checkout:', sessErr);
            }

            const io = req.app.get('io');
            if (io) {
                io.emit('table_status_updated', table);
                io.emit('table_status_changed', table);
                io.emit('table_payment_received', { tableId: table._id, tableNumber: table.tableNumber, tableName: table.name });
                io.emit('table_payment_completed', { tableId: table._id, tableNumber: table.tableNumber, tableName: table.name });
                for (let order of activeOrders) {
                    io.emit('order_status_updated', order);
                }
            }
        }

        res.status(200).json({ success: true, message: 'Checkout successful, table is now Available', table });
    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Remove item from order
// @route   DELETE /api/v1/orders/:orderId/items/:itemId
// @access  Private
exports.removeOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.items = order.items.filter(i => i._id.toString() !== itemId);
        
        // Recalculate subtotal & total
        order.subTotal = order.items.reduce((acc, i) => acc + (i.totalPrice || (i.quantity * (i.unitPrice || 0))), 0);
        order.total = Math.max(0, order.subTotal + (order.tax || 0) + (order.serviceCharge || 0) - (order.discount || 0));
        
        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name')
            .populate('items.menuItem');

        const io = req.app.get('io');
        if (io) io.emit('order_status_updated', populatedOrder);

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add item to existing order
// @route   POST /api/v1/orders/:orderId/items
// @access  Private
exports.addOrderItem = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { menuItemId, quantity = 1, unitPrice, notes } = req.body;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const MenuItem = require('../models/MenuItem');
        const itemObj = await MenuItem.findById(menuItemId);
        const price = unitPrice || itemObj?.price?.basePrice || itemObj?.basePrice || 0;

        if (req.body.waiter && !order.waiter) {
            order.waiter = req.body.waiter;
        }

        order.items.push({
            menuItem: menuItemId,
            quantity,
            unitPrice: price,
            totalPrice: quantity * price,
            notes: notes || '',
            addedBy: req.user?._id || req.body.waiter || null,
            status: 'Pending'
        });

        order.subTotal = order.items.reduce((acc, i) => acc + (i.totalPrice || (i.quantity * (i.unitPrice || 0))), 0);
        order.total = Math.max(0, order.subTotal + (order.tax || 0) + (order.serviceCharge || 0) - (order.discount || 0));

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('table')
            .populate('waiter', 'name email role')
            .populate('items.addedBy', 'name email role')
            .populate('items.menuItem');

        const io = req.app.get('io');
        if (io) io.emit('order_status_updated', populatedOrder);

        res.status(200).json({ success: true, data: populatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Audit Logs for On-Request Items
// @route   GET /api/v1/orders/on-request-audit
// @access  Private
exports.getOnRequestAuditLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find({
            $or: [
                { action: 'Add On-Request Item' },
                { entityType: 'OnRequestItem' }
            ]
        })
        .populate('employeeId', 'name role email employeeId')
        .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Most Ordered Items per Floor
// @route   GET /api/v1/orders/popular-by-floor
// @access  Private
exports.getPopularItemsByFloor = async (req, res) => {
    try {
        const { timeframe } = req.query; // e.g. today, week, month, all
        let dateQuery = {};
        if (timeframe === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            dateQuery = { createdAt: { $gte: startOfDay } };
        } else if (timeframe === 'week') {
            const startOfWeek = new Date();
            startOfWeek.setDate(startOfWeek.getDate() - 7);
            dateQuery = { createdAt: { $gte: startOfWeek } };
        } else if (timeframe === 'month') {
            const startOfMonth = new Date();
            startOfMonth.setDate(startOfMonth.getDate() - 30);
            dateQuery = { createdAt: { $gte: startOfMonth } };
        }

        const orders = await Order.find({
            status: { $ne: 'Cancelled' },
            ...dateQuery
        })
        .populate({
            path: 'table',
            populate: { path: 'floor' }
        })
        .populate('items.menuItem');

        const floors = ['Mio Palazzo', 'Mio Bistro', 'Mio Privè', 'Mio Elite', 'Mio Skybar'];
        const floorMap = {};
        floors.forEach(f => {
            floorMap[f] = {};
        });

        orders.forEach(order => {
            const floorName = order.table?.floor?.name || 'Mio Bistro';
            let matchedFloor = floors.find(f => floorName.toLowerCase().includes(f.toLowerCase())) || 'Mio Bistro';

            if (!floorMap[matchedFloor]) {
                floorMap[matchedFloor] = {};
            }

            (order.items || []).forEach(item => {
                if (item.isSpoiled) return;

                const name = item.foodName || item.menuItem?.foodName || item.menuItem?.displayName || 'Item';
                const qty = item.quantity || 1;
                const rev = item.totalPrice || (qty * (item.unitPrice || 0));
                const category = item.menuItem?.dishType || item.itemType || 'Food';

                if (!floorMap[matchedFloor][name]) {
                    floorMap[matchedFloor][name] = {
                        dishName: name,
                        totalQty: 0,
                        totalRevenue: 0,
                        category,
                        unitPrice: item.unitPrice || 0
                    };
                }

                floorMap[matchedFloor][name].totalQty += qty;
                floorMap[matchedFloor][name].totalRevenue += rev;
            });
        });

        const popularByFloor = {};
        let overallPopularMap = {};

        floors.forEach(f => {
            const itemsList = Object.values(floorMap[f] || {})
                .sort((a, b) => b.totalQty - a.totalQty);

            itemsList.forEach((item, idx) => {
                item.rank = idx + 1;
                if (!overallPopularMap[item.dishName]) {
                    overallPopularMap[item.dishName] = {
                        dishName: item.dishName,
                        totalQty: 0,
                        totalRevenue: 0,
                        category: item.category,
                        floorsPopularIn: []
                    };
                }
                overallPopularMap[item.dishName].totalQty += item.totalQty;
                overallPopularMap[item.dishName].totalRevenue += item.totalRevenue;
                overallPopularMap[item.dishName].floorsPopularIn.push({ 
                    floor: f, 
                    qty: item.totalQty, 
                    rank: item.rank,
                    revenue: item.totalRevenue 
                });
            });

            popularByFloor[f] = itemsList;
        });

        const overallPopularList = Object.values(overallPopularMap)
            .sort((a, b) => b.totalQty - a.totalQty)
            .map((item, idx) => ({ ...item, overallRank: idx + 1 }));

        res.status(200).json({
            success: true,
            data: {
                floors,
                popularByFloor,
                overallPopularList
            }
        });
    } catch (error) {
        console.error('Error fetching popular items by floor:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
