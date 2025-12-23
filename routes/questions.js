import express from 'express';
import Categories from '../models/Categories.js';
import { getModelByName, getModelBySlug } from '../models/modelRegistry.js';

const router = express.Router();

/**
 * Helper: Get model from category slug (via Categories collection or direct mapping)
 */
const getModelForCategory = async (categorySlug) => {
    // First try to get from Categories collection (for dynamic modelName)
    const category = await Categories.findOne({ slug: categorySlug, isActive: true });

    if (category && category.modelName) {
        const model = getModelByName(category.modelName);
        if (model) return { model, category };
    }

    // Fallback to direct slug mapping
    const directModel = getModelBySlug(categorySlug);
    if (directModel) return { model: directModel, category };

    return { model: null, category: null };
};

/**
 * GET /api/questions/:category
 * Get all questions for a specific category
 */
router.get('/:category', async (req, res) => {
    try {
        const { category: categorySlug } = req.params;
        const { limit = 50, skip = 0, active = 'true' } = req.query;

        const { model, category } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const query = active === 'true' ? { isActive: true } : {};
        const questions = await model
            .find(query)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .sort({ createdAt: -1 });

        const total = await model.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                category: category || { slug: categorySlug },
                questions,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    skip: parseInt(skip),
                    hasMore: (parseInt(skip) + questions.length) < total
                }
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
 * GET /api/questions/:category/:id
 * Get a single question by ID
 */
router.get('/:category/:id', async (req, res) => {
    try {
        const { category: categorySlug, id } = req.params;

        const { model } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const question = await model.findById(id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        res.status(200).json({
            success: true,
            data: question
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
 * POST /api/questions/:category
 * Create a new question for a specific category
 */
router.post('/:category', async (req, res) => {
    try {
        const { category: categorySlug } = req.params;
        const questionData = req.body;

        const { model, category } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const newQuestion = new model(questionData);
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
 * POST /api/questions/:category/bulk
 * Create multiple questions at once
 */
router.post('/:category/bulk', async (req, res) => {
    try {
        const { category: categorySlug } = req.params;
        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Questions array is required and must not be empty'
            });
        }

        const { model } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const results = {
            created: [],
            errors: []
        };

        for (const questionData of questions) {
            try {
                const newQuestion = new model(questionData);
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
 * PUT /api/questions/:category/:id
 * Update a question
 */
router.put('/:category/:id', async (req, res) => {
    try {
        const { category: categorySlug, id } = req.params;
        const updateData = req.body;

        const { model } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const question = await model.findByIdAndUpdate(
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
 * DELETE /api/questions/:category/:id
 * Soft delete a question (sets isActive to false)
 */
router.delete('/:category/:id', async (req, res) => {
    try {
        const { category: categorySlug, id } = req.params;

        const { model } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const question = await model.findByIdAndUpdate(
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
 * GET /api/questions/:category/random/:count
 * Get random questions for a category (useful for gameplay)
 */
router.get('/:category/random/:count', async (req, res) => {
    try {
        const { category: categorySlug, count } = req.params;

        const { model, category } = await getModelForCategory(categorySlug);

        if (!model) {
            return res.status(404).json({
                success: false,
                message: `No question model found for category: ${categorySlug}`
            });
        }

        const questions = await model.aggregate([
            { $match: { isActive: true } },
            { $sample: { size: parseInt(count) || 5 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                category: category || { slug: categorySlug },
                questions
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
