const NotificationLog = require('../models/NotificationLog');

/**
 * Format phone number to E.164 standard (default 91 for India if missing)
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
        if (cleaned.length === 10) {
            cleaned = `91${cleaned}`;
        } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
            cleaned = cleaned;
        } else {
            cleaned = `91${cleaned}`;
        }
    } else {
        cleaned = cleaned.replace('+', '');
    }
    return cleaned;
};

/**
 * Send WhatsApp Message via API (Waapi.app / UltraMsg / Meta Cloud / Webhook API)
 */
const sendWhatsAppApiMessage = async ({ toPhone, messageText, fromPhone = '9915497887' }) => {
    const formattedPhone = formatPhoneNumber(toPhone);
    const formattedSender = formatPhoneNumber(fromPhone);
    const instanceId = process.env.WHATSAPP_INSTANCE_ID || '102400';
    const apiToken = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_TOKEN || '';
    const provider = (process.env.WHATSAPP_PROVIDER || 'Waapi').toLowerCase();

    try {
        if (provider === 'waapi' || provider === 'waapi.app' || instanceId === '102400') {
            if (apiToken) {
                const url = `https://waapi.app/api/v1/instances/${instanceId}/client/action/send-message`;
                const chatId = `${formattedPhone}@c.us`;

                console.log(`[WhatsApp API Request -> Waapi.app]: Sending to ${chatId}...`);
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        chatId,
                        message: messageText
                    })
                });
                const data = await res.json();
                console.log(`[WhatsApp API Success - Waapi.app (Sender: ${formattedSender} -> Recipient: ${chatId})]:`, JSON.stringify(data, null, 2));
                return { success: true, provider: 'Waapi', data };
            } else {
                console.warn('[WhatsApp API Warning]: WHATSAPP_API_TOKEN is missing in .env');
            }
        }

        if (provider === 'ultramsg' && instanceId && apiToken) {
            // UltraMsg API dispatch
            const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
            const params = new URLSearchParams({
                token: apiToken,
                to: formattedPhone,
                body: messageText
            });

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            const data = await res.json();
            console.log(`[WhatsApp API Success - UltraMsg (From: ${formattedSender} To: ${formattedPhone})]:`, data);
            return { success: true, provider: 'UltraMsg', data };
        } 
        else if (provider === 'metacloud' && apiToken && process.env.WHATSAPP_PHONE_NUMBER_ID) {
            // Meta WhatsApp Cloud API dispatch
            const phoneNumId = process.env.WHATSAPP_PHONE_NUMBER_ID;
            const url = `https://graph.facebook.com/v18.0/${phoneNumId}/messages`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: formattedPhone,
                    type: 'text',
                    text: { body: messageText }
                })
            });
            const data = await res.json();
            console.log(`[WhatsApp API Success - Meta Cloud (From: ${formattedSender} To: ${formattedPhone})]:`, data);
            return { success: true, provider: 'MetaCloud', data };
        }
        else if (process.env.WHATSAPP_WEBHOOK_URL) {
            // Custom WhatsApp Gateway Webhook API
            const res = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: formattedSender,
                    to: formattedPhone,
                    message: messageText,
                    secret: process.env.WHATSAPP_SECRET || ''
                })
            });
            const data = await res.json();
            console.log(`[WhatsApp API Success - Webhook (From: ${formattedSender} To: ${formattedPhone})]:`, data);
            return { success: true, provider: 'CustomWebhook', data };
        }
        else {
            // Fallback / Simulation Mode: Log and generate direct WhatsApp API link
            const waWebUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;
            console.log(`[WhatsApp API Alert (Sender: ${formattedSender} -> Recipient: ${formattedPhone})]:\nLink: ${waWebUrl}\nMessage:\n${messageText}`);
            return { 
                success: true, 
                provider: 'WhatsAppWebLink', 
                sender: formattedSender,
                recipient: formattedPhone,
                waWebUrl
            };
        }
    } catch (err) {
        console.error('[WhatsApp API Request Error]:', err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Send WhatsApp Service Request Alert from sender 9915497887 to assigned waiter & all active waiters
 */
const sendWaiterWhatsAppAlert = async ({ waiter, table, type, notes, createdAt }) => {
    try {
        const User = require('../models/User');
        const senderPhone = process.env.WHATSAPP_SENDER_PHONE || '9915497887';

        const map = new Map();

        // 1. If assigned waiter is provided, fetch full profile to ensure phoneNumber is loaded
        if (waiter && waiter._id) {
            const assignedUser = await User.findById(waiter._id).select('name role phoneNumber');
            if (assignedUser && assignedUser.phoneNumber) {
                map.set(assignedUser._id.toString(), assignedUser);
            }
        }

        // 2. Also fetch all active waiters and managers on shift with stored phone numbers
        const staffList = await User.find({
            role: { $in: ['Waiter', 'Restaurant Manager', 'Waiter Manager', 'admin', 'super_admin', 'Super Admin'] },
            status: { $ne: 'Inactive' },
            phoneNumber: { $exists: true, $ne: '' }
        }).select('name role phoneNumber');

        staffList.forEach(s => {
            if (s.phoneNumber) {
                map.set(s._id.toString(), s);
            }
        });

        const recipients = Array.from(map.values());
        console.log(`[WhatsApp Service] Prepared ${recipients.length} waiter recipient(s):`, recipients.map(r => `${r.name} (${r.phoneNumber})`));

        if (recipients.length === 0) {
            console.warn('[WhatsApp Service] No waiters or staff members found with valid phone numbers in database.');
            return { success: false, message: 'No waiters found with phone numbers' };
        }

        const tableName = table?.tableNumber ? `Table T${table.tableNumber}` : 'Table';
        const floorName = table?.floor?.name ? `(${table.floor.name})` : '';
        const notesText = notes ? `\nNotes: "${notes}"` : '';
        const assignedName = waiter?.name || 'Available Staff';

        const dispatchResults = [];

        for (const targetWaiter of recipients) {
            if (!targetWaiter.phoneNumber) continue;

            const formattedRecipient = formatPhoneNumber(targetWaiter.phoneNumber);
            const messageContent = 
`AIR MENU WAITER ALERT - MIO & CO.

Hello *${targetWaiter.name}*,

A new customer request has been created from AIR Menu:
Location: ${tableName} ${floorName}
Request Type: *${type}*
Assigned Waiter: *${assignedName}*${notesText}
Time: ${new Date(createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

Please attend to ${tableName} immediately.`;

            // Dispatch message via Waapi.app API from sender 9915497887 to target waiter's stored phone number
            const apiResult = await sendWhatsAppApiMessage({
                toPhone: targetWaiter.phoneNumber,
                messageText: messageContent,
                fromPhone: senderPhone
            });

            // Write dispatch record to NotificationLog
            try {
                await NotificationLog.create({
                    channel: 'WhatsApp',
                    subject: `Waiter Alert - ${tableName}`,
                    content: messageContent,
                    status: apiResult.success ? 'Sent' : 'Failed',
                    recipientUser: targetWaiter._id,
                    metadata: {
                        senderPhone,
                        recipientName: targetWaiter.name,
                        recipientPhone: formattedRecipient,
                        tableNumber: table?.tableNumber,
                        requestType: type,
                        assignedWaiter: assignedName,
                        apiProvider: apiResult.provider,
                        apiResponse: apiResult
                    }
                });
            } catch (logErr) {
                console.error('[WhatsApp Service] Error writing NotificationLog:', logErr);
            }

            dispatchResults.push({
                waiter: targetWaiter.name,
                phone: formattedRecipient,
                apiResult
            });
        }

        return {
            success: true,
            senderPhone,
            totalNotified: dispatchResults.length,
            results: dispatchResults
        };
    } catch (error) {
        console.error('[WhatsApp Service] Error sending WhatsApp message to waiters:', error);
        return { success: false, message: error.message };
    }
};

module.exports = {
    formatPhoneNumber,
    sendWhatsAppApiMessage,
    sendWaiterWhatsAppAlert
};
