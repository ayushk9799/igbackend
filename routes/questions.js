import express from 'express';
import Categories from '../models/Categories.js';

// Import topic-specific models
import FutureQuestion from '../models/FutureQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';
import MoneyQuestion from '../models/MoneyQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';
import FamilyQuestion from '../models/FamilyQuestion.js';

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
};

/**
 * GET /api/questions/topic/:topicId
 * Get questions for a specific topic from its dedicated model
 * Topics: future, hotspicy (more can be added)
 */
router.get('/topic/:topicId', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { limit = 20, shuffle = 'true' } = req.query;

        const TopicModel = TOPIC_MODELS[topicId];

        if (!TopicModel) {
            return res.status(400).json({
                success: false,
                message: `No model found for topic: ${topicId}. Available topics: ${Object.keys(TOPIC_MODELS).join(', ')}`
            });
        }

        // Fetch all active questions from this topic's model
        let questions = await TopicModel.find({ isActive: true }).lean();

        // Transform questions for frontend TaskCard
        questions = questions.map(q => ({
            ...q,
            category: q.visualType,  // TaskCard.jsx uses 'category' to pick the card component
            taskstatement: q.question || q.statement || q.taskstatement
        }));

        // Shuffle if requested
        if (shuffle === 'true') {
            questions = questions.sort(() => Math.random() - 0.5);
        }

        // Limit results
        const limitedQuestions = questions.slice(0, parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                topic: topicId,
                questions: limitedQuestions,
                total: questions.length,
                returned: limitedQuestions.length
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
