import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const FutureQuestionSetV2 = mongoose.model('FutureQuestionSetV2', createQuestionSetSchema());
export default FutureQuestionSetV2;
