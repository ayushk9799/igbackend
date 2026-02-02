import mongoose from 'mongoose';

/**
 * Chat - Stores chat threads linked to questions
 * Auto-created when either partner answers a question
 * 
 * Supports multiple question sources:
 * - Topic-specific models (future, money, hotspicy, etc.)
 * - DailyChallenge tasks
 * - Core visual types (likelyto, neverhaveiever, deep)
 */
const chatSchema = new mongoose.Schema({
    // Couple identification
    coupleId: {
        type: String,
        required: true,
        index: true
    },
    partner1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    partner2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Question context - flexible to handle all sources
    questionSource: {
        type: String,
        required: true,
        enum: ['future', 'money', 'hotspicy', 'political', 'fitness', 'travel', 'family', 'dailychallenge', 'likelyto', 'neverhaveiever', 'deep']
    },
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        // Not required because DailyChallenge tasks have embedded _id
    },
    // For DailyChallenge - reference to challenge and task index
    challengeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyChallenge'
    },
    taskIndex: {
        type: Number
    },

    // Store question text for display (denormalized for performance)
    questionText: {
        type: String,
        required: true
    },
    questionCategory: {
        type: String  // 'likelyto', 'neverhaveiever', 'deep', 'takephoto'
    },

    // Chat metadata
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active'
    },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },  // Preview of last message for list display
    messageCount: { type: Number, default: 0 },

    // Unread tracking per user
    partner1Unread: { type: Number, default: 0 },
    partner2Unread: { type: Number, default: 0 },

    // Integrated messages array
    messages: [{
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: {
            type: String,
            required: true,
            maxlength: 2000
        },
        messageType: {
            type: String,
            enum: ['text', 'reaction', 'image', 'system', 'answer'],
            default: 'text'
        },
        answerType: {
            type: String,
            enum: ['text', 'photo', 'video'],
        },
        isRead: { type: Boolean, default: false },
        readAt: { type: Date },
        reactions: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            emoji: String,
            createdAt: { type: Date, default: Date.now }
        }],
        createdAt: { type: Date, default: Date.now }
    }],
}, { timestamps: true });

// Indexes for efficient queries
chatSchema.index({ coupleId: 1, questionId: 1 });
chatSchema.index({ coupleId: 1, challengeId: 1, taskIndex: 1 });
chatSchema.index({ partner1: 1, status: 1, lastMessageAt: -1 });
chatSchema.index({ partner2: 1, status: 1, lastMessageAt: -1 });

/**
 * Static method to generate a consistent coupleId from two user IDs
 * Always sorted so it's the same regardless of who submits
 */
chatSchema.statics.generateCoupleId = function (userId1, userId2) {
    const ids = [userId1.toString(), userId2.toString()].sort();
    return `${ids[0]}_${ids[1]}`;
};

/**
 * Find or create a chat for a question
 * Called when a user answers a question
 * 
 * @param {Object} params
 * @param {String} params.userId - User who answered
 * @param {String} params.partnerId - Partner's user ID
 * @param {String} params.questionSource - Source of question ('future', 'dailychallenge', etc.)
 * @param {String} params.questionId - Question document ID (for topic questions)
 * @param {String} params.challengeId - DailyChallenge ID (for daily challenge)
 * @param {Number} params.taskIndex - Task index in DailyChallenge (for daily challenge)
 * @param {String} params.questionText - The question text
 * @param {String} params.questionCategory - Visual type ('likelyto', 'deep', etc.)
 * @param {String} params.answer - The user's answer
 * @param {String} params.answerType - The answer type ('text', 'photo', 'video')
 * @returns {Object} The chat document
 */
chatSchema.statics.findOrCreateForQuestion = async function (params) {
    const {
        userId,
        partnerId,
        questionSource,
        questionId,
        challengeId,
        taskIndex,
        questionText,
        questionCategory,
        answer,
        answerType = 'text'
    } = params;

    const coupleId = this.generateCoupleId(userId, partnerId);
    const [p1, p2] = [userId.toString(), partnerId.toString()].sort();
    const isPartner1 = userId.toString() === p1;

    // Build query based on source
    let query = { coupleId };
    if (challengeId && taskIndex !== undefined) {
        query.challengeId = challengeId;
        query.taskIndex = taskIndex;
    } else if (questionId) {
        query.questionId = questionId;
    }

    let chat = await this.findOne(query);

    if (!chat) {
        // Create new chat
        chat = new this({
            coupleId,
            partner1: p1,
            partner2: p2,
            questionSource,
            questionId: challengeId ? undefined : questionId,
            challengeId: challengeId || undefined,
            taskIndex: taskIndex !== undefined ? taskIndex : undefined,
            questionText,
            questionCategory,
            lastMessageAt: new Date(),
            lastMessagePreview: answerType === 'photo' ? '📷 Photo' : (answerType === 'video' ? '🎥 Video' : answer),
            messages: [{
                senderId: userId,
                content: answer,
                messageType: 'answer',
                answerType: answerType,
                createdAt: new Date()
            }]
        });
        console.log(`💬 [Chat] Created new chat with answer: "${questionText?.substring(0, 50)}..."`);
    } else {
        // Push the new answer to the embedded messages array
        chat.messages.push({
            senderId: userId,
            content: answer,
            messageType: 'answer',
            answerType: answerType,
            createdAt: new Date()
        });

        // Update metadata
        chat.lastMessageAt = new Date();
        chat.lastMessagePreview = answerType === 'photo' ? '📷 Photo' : (answerType === 'video' ? '🎥 Video' : answer);

        // Update unread count for the other partner
        const isPartner1Now = userId.toString() === chat.partner1.toString();
        const unreadField = isPartner1Now ? 'partner2Unread' : 'partner1Unread';
        chat[unreadField] += 1;
        chat.messageCount += 1;

        console.log(`💬 [Chat] Added partner's answer to message thread`);
    }

    await chat.save();
    return chat;
};

/**
 * Get all chats for a user with unread counts
 * @param {String} userId
 * @returns {Array} Array of chat documents
 */
chatSchema.statics.getChatsForUser = async function (userId) {
    const chats = await this.find({
        $or: [
            { partner1: userId },
            { partner2: userId }
        ],
        status: 'active'
    })
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .populate('partner1', 'name nickname avatar')
        .populate('partner2', 'name nickname avatar')
        .lean();

    // Add unread count for this user
    return chats.map(chat => {
        const isPartner1 = chat.partner1._id.toString() === userId.toString();
        return {
            ...chat,
            unreadCount: isPartner1 ? chat.partner1Unread : chat.partner2Unread,
            partner: isPartner1 ? chat.partner2 : chat.partner1
        };
    });
};

/**
 * Get total unread count for a user (for badge)
 * @param {String} userId
 * @returns {Number} Total unread messages
 */
chatSchema.statics.getTotalUnreadCount = async function (userId) {
    const result = await this.aggregate([
        {
            $match: {
                $or: [
                    { partner1: new mongoose.Types.ObjectId(userId) },
                    { partner2: new mongoose.Types.ObjectId(userId) }
                ],
                status: 'active'
            }
        },
        {
            $project: {
                unread: {
                    $cond: {
                        if: { $eq: ['$partner1', new mongoose.Types.ObjectId(userId)] },
                        then: '$partner1Unread',
                        else: '$partner2Unread'
                    }
                }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$unread' }
            }
        }
    ]);

    return result.length > 0 ? result[0].total : 0;
};

const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
