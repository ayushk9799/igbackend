import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const FamilyQuestionSetV2 = mongoose.model('FamilyQuestionSetV2', createQuestionSetSchema());
export default FamilyQuestionSetV2;
