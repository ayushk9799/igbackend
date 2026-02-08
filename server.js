import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
// This ensures AWS credentials are available when modules initialize
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import apiRoutes from './routes/sample.js';
import loginRoutes from './routes/login.js';
import partnerRoutes from './routes/partner.js';
import userRoutes from './routes/user.js';
import categoriesRoutes from './routes/categories.js';
import questionsRoutes from './routes/questions.js';
import dailyChallengeRoutes from './routes/dailyChallenge.js';
import answersRoutes from './routes/answers.js';
import uploadRoutes from './routes/upload.js';
import puzzleRoutes from './routes/puzzle.js';
import tictactoeRoutes from './routes/tictactoe.js';
import wordleRoutes from './routes/wordle.js';
import chatRoutes from './routes/chat.js';
import initializeSocket from './socket/index.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI)
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes

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
app.use('/api/daily-challenge', dailyChallengeRoutes);
app.use('/api/answers', answersRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/puzzle', puzzleRoutes);
app.use('/api/tictactoe', tictactoeRoutes);
app.use('/api/wordle', wordleRoutes);
app.use('/api/chat', chatRoutes);

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
