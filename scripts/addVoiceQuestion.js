import mongoose from 'mongoose';
import FutureQuestion from '../models/FutureQuestion.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

async function addVoiceQuestion() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get the highest order number
        const highestOrder = await FutureQuestion.findOne({ isActive: true })
            .sort({ order: -1 })
            .select('order');

        const newOrder = (highestOrder?.order || 0) + 1;

        const voiceQuestion = new FutureQuestion({
            question: "Record a 30-second voice message sharing your biggest dream for the future",
            visualType: "voicerecord",
            spiceLevel: "mild",
            isActive: true,
            order: newOrder,
            placeholder: "Tap and hold to record your voice..."
        });

        await voiceQuestion.save();
        console.log('✅ Voice question added successfully!');
        console.log('📝 Question:', voiceQuestion.question);
        console.log('📊 Order:', voiceQuestion.order);
        console.log('🆔 ID:', voiceQuestion._id);

        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

addVoiceQuestion();
