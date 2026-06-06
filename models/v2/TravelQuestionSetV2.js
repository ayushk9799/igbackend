import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const TravelQuestionSetV2 = mongoose.model('TravelQuestionSetV2', createQuestionSetSchema());
export default TravelQuestionSetV2;
