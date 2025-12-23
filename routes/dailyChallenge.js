import express from 'express';
import DailyChallenge from '../models/DailyChallenge.js';

const router = express.Router();

/**
 * GET /api/daily-challenge
 * Get all daily challenges with pagination
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 50, skip = 0, active = 'true' } = req.query;

        const query = active === 'true' ? { isActive: true } : {};
        const challenges = await DailyChallenge
            .find(query)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .sort({ date: -1 });

        const total = await DailyChallenge.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                challenges,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    skip: parseInt(skip),
                    hasMore: (parseInt(skip) + challenges.length) < total
                }
            }
        });
    } catch (error) {
        console.error('Error fetching daily challenges:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch daily challenges',
            error: error.message
        });
    }
});

/**
 * GET /api/daily-challenge/today
 * Get today's challenge
 */
router.get('/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        const challenge = await DailyChallenge.findOne({
            date: today,
            isActive: true
        });

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'No challenge found for today'
            });
        }

        res.status(200).json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error fetching today\'s challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch today\'s challenge',
            error: error.message
        });
    }
});

/**
 * GET /api/daily-challenge/date/:date
 * Get challenge by specific date (format: YYYY-MM-DD)
 */
router.get('/date/:date', async (req, res) => {
    try {
        const { date } = req.params;

        const challenge = await DailyChallenge.findOne({
            date,
            isActive: true
        });

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: `No challenge found for date: ${date}`
            });
        }

        res.status(200).json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error fetching challenge by date:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch challenge',
            error: error.message
        });
    }
});

/**
 * GET /api/daily-challenge/:id
 * Get a single challenge by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const challenge = await DailyChallenge.findById(id);

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        res.status(200).json({
            success: true,
            data: challenge
        });
    } catch (error) {
        console.error('Error fetching challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch challenge',
            error: error.message
        });
    }
});

/**
 * POST /api/daily-challenge
 * Create a new daily challenge
 */
router.post('/', async (req, res) => {
    try {
        const challengeData = req.body;

        const newChallenge = new DailyChallenge(challengeData);
        await newChallenge.save();

        res.status(201).json({
            success: true,
            message: 'Daily challenge created successfully',
            data: newChallenge
        });
    } catch (error) {
        console.error('Error creating daily challenge:', error);

        // Handle duplicate date error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A challenge already exists for this date',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create daily challenge',
            error: error.message
        });
    }
});

/**
 * POST /api/daily-challenge/bulk
 * Create multiple daily challenges at once
 */
router.post('/bulk', async (req, res) => {
    try {
        const { challenges } = req.body;

        if (!Array.isArray(challenges) || challenges.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Challenges array is required and must not be empty'
            });
        }

        const results = {
            created: [],
            errors: []
        };

        for (const challengeData of challenges) {
            try {
                const newChallenge = new DailyChallenge(challengeData);
                await newChallenge.save();
                results.created.push(newChallenge);
            } catch (err) {
                results.errors.push({
                    data: challengeData,
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
        console.error('Error in bulk challenge creation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create challenges',
            error: error.message
        });
    }
});

/**
 * PUT /api/daily-challenge/:id
 * Update a daily challenge
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const challenge = await DailyChallenge.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Daily challenge updated successfully',
            data: challenge
        });
    } catch (error) {
        console.error('Error updating daily challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update daily challenge',
            error: error.message
        });
    }
});

/**
 * PUT /api/daily-challenge/:id/tasks
 * Update tasks within a daily challenge
 */
router.put('/:id/tasks', async (req, res) => {
    try {
        const { id } = req.params;
        const { tasks } = req.body;

        if (!Array.isArray(tasks) || tasks.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tasks array is required and must not be empty'
            });
        }

        const challenge = await DailyChallenge.findByIdAndUpdate(
            id,
            { tasks },
            { new: true, runValidators: true }
        );

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tasks updated successfully',
            data: challenge
        });
    } catch (error) {
        console.error('Error updating tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tasks',
            error: error.message
        });
    }
});

/**
 * DELETE /api/daily-challenge/:id
 * Soft delete a daily challenge (sets isActive to false)
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const challenge = await DailyChallenge.findByIdAndUpdate(
            id,
            { isActive: false },
            { new: true }
        );

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Daily challenge deactivated successfully',
            data: challenge
        });
    } catch (error) {
        console.error('Error deleting daily challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete daily challenge',
            error: error.message
        });
    }
});

/**
 * DELETE /api/daily-challenge/:id/hard
 * Hard delete a daily challenge (permanently removes from database)
 */
router.delete('/:id/hard', async (req, res) => {
    try {
        const { id } = req.params;

        const challenge = await DailyChallenge.findByIdAndDelete(id);

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Daily challenge permanently deleted',
            data: challenge
        });
    } catch (error) {
        console.error('Error hard deleting daily challenge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete daily challenge',
            error: error.message
        });
    }
});

export default router;
