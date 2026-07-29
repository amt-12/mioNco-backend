const NotificationTemplate = require('../models/NotificationTemplate');
const NotificationLog = require('../models/NotificationLog');

class NotificationEngine {
    
    static async sendManual(templateId, recipientCustomerId, data, io) {
        try {
            const template = await NotificationTemplate.findById(templateId);
            if (!template || !template.isActive) return false;

            let parsedBody = this.parseVariables(template.body, data);
            
            const log = await NotificationLog.create({
                template: template._id,
                recipientCustomer: recipientCustomerId,
                channel: template.channel,
                subject: template.subject,
                content: parsedBody,
                status: 'Sent' // Assume sent for now as we're mocking external channels
            });

            // If it's in-app or a general blast we could emit to a specific socket room
            return log;
        } catch (error) {
            console.error('NotificationEngine Error:', error);
            return false;
        }
    }

    static async triggerEvent(eventName, data, io) {
        try {
            const templates = await NotificationTemplate.find({ triggerEvent: eventName, isActive: true });
            
            for (let template of templates) {
                let parsedBody = this.parseVariables(template.body, data);
                
                // Example: We are triggering a staff alert
                if (template.category === 'Alert' || template.category === 'Operational') {
                    const log = await NotificationLog.create({
                        template: template._id,
                        channel: 'In-App',
                        content: parsedBody,
                        status: 'Delivered',
                        metadata: data
                    });
                    
                    if (io) {
                        io.emit('global_staff_alert', {
                            _id: log._id,
                            content: parsedBody,
                            createdAt: log.createdAt
                        });
                    }
                }
            }
        } catch (error) {
            console.error('NotificationEngine trigger error:', error);
        }
    }

    static parseVariables(templateString, data) {
        if (!templateString) return '';
        if (!data) return templateString;
        
        return templateString.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, variable) => {
            return data[variable] !== undefined ? data[variable] : match;
        });
    }
}

module.exports = NotificationEngine;
