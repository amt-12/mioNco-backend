const generateId = async (prefix, model) => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    let unique = false;
    while (!unique) {
        id = `${prefix}-`;
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!model) {
            unique = true;
            break;
        }
        let existing;
        if (prefix === 'ORD') existing = await model.findOne({ orderId: id });
        else if (prefix === 'SESS') existing = await model.findOne({ sessionId: id });
        else if (prefix === 'TBL' || prefix === 'TAB') existing = await model.findOne({ tableId: id });
        else existing = await model.findOne({ id: id });

        if (!existing) unique = true;
    }
    return id;
};

module.exports = generateId;
