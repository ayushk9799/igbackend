import express from 'express';
import Categories from '../models/Categories.js';
import User from '../models/User.js';

// Import topic-specific models
import FutureQuestion from '../models/FutureQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';
import MoneyQuestion from '../models/MoneyQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';
import FamilyQuestion from '../models/FamilyQuestion.js';
import DeepQuestion from '../models/DeepQuestion.js';
import LikelyToQuestion from '../models/LikelyToQuestion.js';
import NeverHaveIEverQuestion from '../models/NeverHaveIEverQuestion.js';

const router = express.Router();

// Map topic IDs to their models
const TOPIC_MODELS = {
    'future': FutureQuestion,
    'hotspicy': HotSpicyQuestion,
    'money': MoneyQuestion,
    'political': PoliticalQuestion,
    'fitness': FitnessQuestion,
    'travel': TravelQuestion,
    'family': FamilyQuestion,
    'deep': DeepQuestion,
    'likelyto': LikelyToQuestion,
    'neverhaveiever': NeverHaveIEverQuestion,
};

/**
 * POST /api/questions/progress
 * Update user's progress for a topic (e.g. on skip or answer)
 * IMPORTANT: This route MUST be defined BEFORE any parameterized routes like /:topicId
 */
router.post('/progress', async (req, res) => {
    try {
        console.log('📥 [API] POST /progress received:', req.body);
        const { userId, topicId, lastOrder } = req.body;

        if (!userId || !topicId || lastOrder === undefined) {
            console.warn('⚠️ [API] Missing required fields:', { userId, topicId, lastOrder });
            return res.status(400).json({
                success: false,
                message: 'userId, topicId, and lastOrder are required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ [API] User not found:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Initialize map if needed
        if (!user.topicProgress) {
            user.topicProgress = new Map();
        }

        // Only update if new order is greater than existing
        const currentOrder = user.topicProgress.get(topicId) || 0;
        console.log(`🔍 [API] Current order for ${topicId}: ${currentOrder}, New: ${lastOrder}`);

        if (lastOrder > currentOrder) {
            user.topicProgress.set(topicId, lastOrder);
            await user.save();
            console.log(`✅ [API] Updated progress for user ${userId}, topic ${topicId} -> order ${lastOrder}`);
        } else {
            console.log(`ℹ️ [API] Progress ignored for user ${userId}, topic ${topicId}: ${lastOrder} <= ${currentOrder}`);
        }

        res.status(200).json({
            success: true,
            message: 'Progress updated',
            data: {
                topicId,
                lastSeenOrder: Math.max(lastOrder, currentOrder)
            }
        });
    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update progress',
            error: error.message
        });
    }
});

/**
 * GET /api/questions/topic/:topicId
 * Get questions for a specific topic, continuing from user's last seen order.
 */
router.get('/topic/:topicId', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { limit = 20, userId } = req.query;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(400).json({
                success: false,
                message: `No model found for topic: ${topicId}. Available topics: ${Object.keys(TOPIC_MODELS).join(', ')}`
            });
        }

        // 1. Determine the starting order
        let lastSeenOrder = 0;
        if (userId) {
            const user = await User.findById(userId);
            if (user && user.topicProgress) {
                lastSeenOrder = user.topicProgress.get(topicId) || 0;
            }
        }

        console.log(`📡 Fetching ${topicId} questions for user ${userId || 'anon'}, starting after order ${lastSeenOrder}`);

        // 2. Fetch active questions with order > lastSeenOrder
        let questions = await TopicModel.find({
            isActive: true,
            order: { $gt: lastSeenOrder }
        })
            .sort({ order: 1 }) // Sequential order
            .limit(parseInt(limit))
            .lean();

        // Transform questions for frontend TaskCard
        questions = questions.map(q => ({
            ...q,
            category: q.visualType,
            taskstatement: q.question || q.statement || q.taskstatement
        }));

        res.status(200).json({
            success: true,
            data: {
                topic: topicId,
                questions: questions,
                total: questions.length, // approximation, real total needs count
                returned: questions.length,
                startingOrder: lastSeenOrder
            }
        });
    } catch (error) {
        console.error('Error fetching questions by topic:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch questions by topic',
            error: error.message
        });
    }
});

/**
 * GET /api/questions/:topicId/all
 * Get all questions for a topic (admin use)
 */
router.get('/:topicId/all', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { active = 'true' } = req.query;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const query = active === 'true' ? { isActive: true } : {};
        const questions = await TopicModel.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                topic: topicId,
                questions: questions.map(q => ({
                    ...q.toObject(),
                    category: q.visualType,
                    taskstatement: q.question
                })),
                total: questions.length
            }
        });
    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch questions',
            error: error.message
        });
    }
});

/**
 * GET /api/questions/:topicId/:id
 * Get a single question by ID
 */
router.get('/:topicId/:id', async (req, res) => {
    try {
        const { topicId, id } = req.params;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const question = await TopicModel.findById(id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...question.toObject(),
                category: question.visualType,
                taskstatement: question.question
            }
        });
    } catch (error) {
        console.error('Error fetching question:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch question',
            error: error.message
        });
    }
});

/**
 * POST /api/questions/:topicId
 * Create a new question for a specific topic
 */
router.post('/:topicId', async (req, res) => {
    try {
        const { topicId } = req.params;
        const questionData = req.body;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const newQuestion = new TopicModel(questionData);
        await newQuestion.save();

        res.status(201).json({
            success: true,
            message: 'Question created successfully',
            data: newQuestion
        });
    } catch (error) {
        console.error('Error creating question:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create question',
            error: error.message
        });
    }
});

/**
 * POST /api/questions/:topicId/bulk
 * Create multiple questions at once
 */
router.post('/:topicId/bulk', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Questions array is required and must not be empty'
            });
        }

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const results = {
            created: [],
            errors: []
        };

        for (const questionData of questions) {
            try {
                const newQuestion = new TopicModel(questionData);
                await newQuestion.save();
                results.created.push(newQuestion);
            } catch (err) {
                results.errors.push({
                    data: questionData,
                    reason: err.message
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Bulk operation completed: ${results.created.length} created, ${results.errors.length} failed`,
            data: results
        });
    } catch (error) {
        console.error('Error in bulk question creation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create questions',
            error: error.message
        });
    }
});

/**
 * PUT /api/questions/:topicId/:id
 * Update a question
 */
router.put('/:topicId/:id', async (req, res) => {
    try {
        const { topicId, id } = req.params;
        const updateData = req.body;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const question = await TopicModel.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Question updated successfully',
            data: question
        });
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update question',
            error: error.message
        });
    }
});

/**
 * DELETE /api/questions/:topicId/:id
 * Soft delete a question (sets isActive to false)
 */
router.delete('/:topicId/:id', async (req, res) => {
    try {
        const { topicId, id } = req.params;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const question = await TopicModel.findByIdAndUpdate(
            id,
            { isActive: false },
            { new: true }
        );

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Question deactivated successfully',
            data: question
        });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete question',
            error: error.message
        });
    }
});

/**
 * GET /api/questions/:topicId/random/:count
 * Get random questions for a topic (useful for gameplay)
 */
router.get('/:topicId/random/:count', async (req, res) => {
    try {
        const { topicId, count } = req.params;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(404).json({
                success: false,
                message: `No model found for topic: ${topicId}`
            });
        }

        const questions = await TopicModel.aggregate([
            { $match: { isActive: true } },
            { $sample: { size: parseInt(count) || 5 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                topic: topicId,
                questions: questions.map(q => ({
                    ...q,
                    category: q.visualType,
                    taskstatement: q.question
                }))
            }
        });
    } catch (error) {
        console.error('Error fetching random questions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch random questions',
            error: error.message
        });
    }
});

export default router;
