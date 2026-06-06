import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const GetToKnowQuestionSetV2 = mongoose.model('GetToKnowQuestionSetV2', createQuestionSetSchema());
export default GetToKnowQuestionSetV2;
