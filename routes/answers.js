import express from 'express';
import DailyAnswers from '../models/DailyAnswers.js';
import DailyChallenge from '../models/DailyChallenge.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * POST /api/answers/submit
 * Submit an answer for a specific task (by index)
 * 
 * Body: { userId, challengeId, taskIndex, answer, answerType? }
 */
router.post('/submit', async (req, res) => {
    try {
        const { userId, challengeId, taskIndex, answer, answerType = 'text' } = req.body;

        // Basic validation
        if (!userId || !challengeId || taskIndex === undefined || !answer) {
            console.warn('[answers.submit] Validation failed - missing fields:', {
                hasUserId: !!userId,
                hasChallengeId: !!challengeId,
                hasTaskIndex: taskIndex !== undefined,
                hasAnswer: !!answer
            });
            return res.status(400).json({
                success: false,
                message: 'Required: userId, challengeId, taskIndex, answer'
            });
        }

        // Input sanitization and validation for answer field
        let sanitizedAnswer = answer;
        if (typeof answer === 'string') {
            // Max length validation (10,000 chars to prevent abuse)
            if (answer.length > 10000) {
                console.warn('[answers.submit] Answer too long:', {
                    userId,
                    challengeId,
                    taskIndex,
                    length: answer.length
                });
                return res.status(400).json({
                    success: false,
                    message: 'Answer exceeds maximum length (10,000 characters)'
                });
            }
            // Sanitize: trim whitespace
            sanitizedAnswer = answer.trim();
        }

        // Get the challenge
        const challenge = await DailyChallenge.findById(challengeId);
        if (!challenge) {
            console.warn('[answers.submit] Challenge not found:', { challengeId });
            return res.status(404).json({
                success: false,
                message: 'Challenge not found'
            });
        }

        // Validate task index
        if (taskIndex < 0 || taskIndex >= challenge.tasks.length) {
            console.warn('[answers.submit] Invalid taskIndex:', {
                taskIndex,
                maxIndex: challenge.tasks.length - 1
            });
            return res.status(400).json({
                success: false,
                message: `Invalid taskIndex. Must be 0-${challenge.tasks.length - 1}`
            });
        }

        // Get user for partner info
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate couple ID if user has partner
        const coupleId = user.partnerId
            ? DailyAnswers.generateCoupleId(userId, user.partnerId)
            : null;

        // Find or create answers document
        let dailyAnswers = await DailyAnswers.findOne({ challengeId, userId });

        if (!dailyAnswers) {
            // Initialize with empty answers array matching tasks length (include type from challenge)
            const emptyAnswers = challenge.tasks.map((task) => ({
                type: task.category,
                answerType: 'text',
                value: null,
                answeredAt: null
            }));

            dailyAnswers = new DailyAnswers({
                challengeId,
                date: challenge.date,
                userId,
                partnerId: user.partnerId,
                coupleId,
                answers: emptyAnswers,
                totalTasks: challenge.tasks.length,
                completedCount: 0,
            });
        }

        // Check if this task was already answered
        const wasAlreadyAnswered = dailyAnswers.answers[taskIndex]?.value !== null;

        // Update the answer at the specified index (preserving type)
        const taskType = challenge.tasks[taskIndex].category;
        dailyAnswers.answers[taskIndex] = {
            type: taskType,
            answerType: answerType,
            value: sanitizedAnswer,
            answeredAt: new Date(),
        };

        // Recalculate completed count
        dailyAnswers.completedCount = dailyAnswers.answers.filter(a => a.value !== null).length;

        // Check if all tasks are complete
        if (dailyAnswers.completedCount >= dailyAnswers.totalTasks) {
            dailyAnswers.isComplete = true;
            dailyAnswers.completedAt = new Date();
        }

        await dailyAnswers.save();

        res.status(200).json({
            success: true,
            message: 'Answer saved',
            data: {
                taskIndex,
                completedCount: dailyAnswers.completedCount,
                totalTasks: dailyAnswers.totalTasks,
                isComplete: dailyAnswers.isComplete,
            }
        });
    } catch (error) {
        console.error('Error submitting answer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit answer',
            error: error.message
        });
    }
});

/**
 * GET /api/answers/:challengeId
 * Get user's answers for a challenge
 * 
 * Query: ?userId=xxx
 */
router.get('/:challengeId', async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId query param required'
            });
        }

        const dailyAnswers = await DailyAnswers.findOne({ challengeId, userId });

        if (!dailyAnswers) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No answers found'
            });
        }

        res.status(200).json({
            success: true,
            data: dailyAnswers
        });
    } catch (error) {
        console.error('Error fetching answers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch answers',
            error: error.message
        });
    }
});

/**
 * GET /api/answers/:challengeId/partner
 * Get partner's answers for a challenge
 * 
 * Query: ?userId=xxx (your user ID, we'll find your partner's answers)
 */
router.get('/:challengeId/partner', async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId query param required'
            });
        }

        const user = await User.findById(userId);
        if (!user || !user.partnerId) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No partner linked'
            });
        }

        const partnerAnswers = await DailyAnswers.findOne({
            challengeId,
            userId: user.partnerId
        });

        res.status(200).json({
            success: true,
            data: partnerAnswers
        });
    } catch (error) {
        console.error('Error fetching partner answers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch partner answers',
            error: error.message
        });
    }
});

/**
 * GET /api/answers/activity/date/:date
 * Get activity feed for a specific date (format: YYYY-MM-DD)
 */
router.get('/activity/date/:date', async (req, res) => {
    try {
        const { date } = req.params;

        const activity = await DailyAnswers.find({
            date,
            isComplete: true
        })
            .populate('userId', 'name avatar')
            .sort({ completedAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            data: activity
        });
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch activity',
            error: error.message
        });
    }
});

/**
 * GET /api/answers/couple/:date
 * Get both partners' answers for a date
 * 
 * Query: ?userId=xxx
 */
router.get('/couple/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId query param required'
            });
        }

        const user = await User.findById(userId);
        if (!user || !user.partnerId) {
            return res.status(200).json({
                success: true,
                data: { user: null, partner: null },
                message: 'No partner linked'
            });
        }

        const coupleId = DailyAnswers.generateCoupleId(userId, user.partnerId);

        const coupleAnswers = await DailyAnswers.find({ coupleId, date })
            .populate('userId', 'name avatar');

        const userAnswers = coupleAnswers.find(a => a.userId._id.toString() === userId);
        const partnerAnswers = coupleAnswers.find(a => a.userId._id.toString() !== userId);

        res.status(200).json({
            success: true,
            data: {
                user: userAnswers || null,
                partner: partnerAnswers || null,
                bothComplete: !!(userAnswers?.isComplete && partnerAnswers?.isComplete)
            }
        });
    } catch (error) {
        console.error('Error fetching couple answers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch couple answers',
            error: error.message
        });
    }
});

export default router;
