// Reads one day's daily challenge back from the database and prints it.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import DailyChallenge from '../models/DailyChallenge.js';

const date = process.argv[2];
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
const doc = await DailyChallenge.findOne({ date }).lean();
if (!doc) { console.log('NOT FOUND for', date); process.exit(1); }
console.log('FOUND', doc.date, '|', doc.title, '| active:', doc.isActive, '| id:', String(doc._id));
doc.tasks.forEach((t, i) => console.log(` ${i + 1}. [${t.category}] ${t.taskstatement}${t.category === 'slider' ? ` (${t.minLabel} -> ${t.maxLabel}, ${t.minValue}-${t.maxValue})` : ''}${t.options?.length ? ' options=' + JSON.stringify(t.options) : ''}`));
await mongoose.disconnect();
process.exit(0);
