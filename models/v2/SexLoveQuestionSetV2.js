import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const SexLoveQuestionSetV2 = mongoose.model('SexLoveQuestionSetV2', createQuestionSetSchema());
export default SexLoveQuestionSetV2;
