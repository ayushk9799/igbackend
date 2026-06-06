import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const CoupleTherapyQuestionSetV2 = mongoose.model('CoupleTherapyQuestionSetV2', createQuestionSetSchema());
export default CoupleTherapyQuestionSetV2;
