import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const NaughtyQuestionSetV2 = mongoose.model('NaughtyQuestionSetV2', createQuestionSetSchema());
export default NaughtyQuestionSetV2;
