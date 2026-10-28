import 'dotenv/config'; import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
const rows = await mongoose.connection.db.collection('letters').find({}).sort({ _id: -1 }).limit(6).project({ bird:1,status:1,sentAt:1,deliverAt:1,senderId:1,recipientId:1 }).toArray();
console.log(JSON.stringify(rows, null, 1)); await mongoose.disconnect();
