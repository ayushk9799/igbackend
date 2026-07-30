import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
// This ensures AWS credentials are available when modules initialize
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import mongoose from 'mongoose';
import apiRoutes from './routes/sample.js';
import loginRoutes from './routes/login.js';
import partnerRoutes from './routes/partner.js';
import userRoutes from './routes/user.js';
import categoriesRoutes from './routes/categories.js';
import questionsRoutes from './routes/questions.js';
import questionsV2Routes, { initializeTopicQuestionMetadataCache } from './routes/questionsV2.js';
import questionChatsV2Routes from './routes/questionChatsV2.js';
import dailyChallengeRoutes from './routes/dailyChallenge.js';
import answersRoutes from './routes/answers.js';
import uploadRoutes from './routes/upload.js';
import memoriesRoutes from './routes/memories.js';
import puzzleRoutes from './routes/puzzle.js';
import tictactoeRoutes from './routes/tictactoe.js';
import wordleRoutes from './routes/wordle.js';
import chatRoutes from './routes/chat.js';
import webhookRoutes from './routes/webhook.js';
import subscriptionRoutes from './routes/subscriptions.js';
import appConfigRoutes from './routes/appConfig.js';
import scribbleRoutes from './routes/scribble.js';
import couplePhotoRoutes from './routes/couplePhoto.js';
import initializeSocket from './socket/index.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || process.env.JWT_SECRET;

if (!APP_JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('APP_JWT_SECRET must be configured in production');
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI is not defined in environment variables.');
} else {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            try {
                await initializeTopicQuestionMetadataCache();
            } catch (error) {
                // The topics endpoint retries lazily if startup initialization fails.
                console.error('❌ Topic question metadata cache initialization failed:', error);
            }
        })
        .catch((err) => console.error('❌ MongoDB connection error:', err));
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes

// Serve Thousand Ways landing page on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Simple test endpoint to verify frontend-backend connectivity
app.get('/api/test', (req, res) => {

    res.json({
        success: true,
        message: 'Backend is connected!',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/login', loginRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/user', userRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/v2/questions', questionsV2Routes);
app.use('/api/v2/question-chats', questionChatsV2Routes);
app.use('/api/daily-challenge', dailyChallengeRoutes);
app.use('/api/answers', answersRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/memories', memoriesRoutes);
app.use('/api/puzzle', puzzleRoutes);
app.use('/api/tictactoe', tictactoeRoutes);
app.use('/api/wordle', wordleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/app-config', appConfigRoutes);
app.use('/api/scribbles', scribbleRoutes);
app.use('/api/couple-photo', couplePhotoRoutes);

// Initialize Socket.io
const io = initializeSocket(httpServer);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Use httpServer.listen instead of app.listen for Socket.io
httpServer.listen(PORT, () => {
});

export default app;
