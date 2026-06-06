import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const LongDistanceQuestionSetV2 = mongoose.model('LongDistanceQuestionSetV2', createQuestionSetSchema());
export default LongDistanceQuestionSetV2;
