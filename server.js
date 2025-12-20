import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import apiRoutes from './routes/sample.js';
import loginRoutes from './routes/login.js';
import partnerRoutes from './routes/partner.js';
import userRoutes from './routes/user.js';
import initializeSocket from './socket/index.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes

// API Routes
app.use('/api/login', loginRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/user', userRoutes);

// Initialize Socket.io
const io = initializeSocket(httpServer);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Use httpServer.listen instead of app.listen for Socket.io
httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

export default app;
