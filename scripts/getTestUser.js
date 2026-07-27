import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const MONGODB_URI = process.env.MONGODB_URI;

async function getUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        const user = await User.findOne({});
        if (user) {
        } else {
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
getUser();
