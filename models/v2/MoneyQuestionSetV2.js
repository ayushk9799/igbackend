import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const MoneyQuestionSetV2 = mongoose.model('MoneyQuestionSetV2', createQuestionSetSchema());
export default MoneyQuestionSetV2;
