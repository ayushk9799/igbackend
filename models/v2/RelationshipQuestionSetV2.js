import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const RelationshipQuestionSetV2 = mongoose.model('RelationshipQuestionSetV2', createQuestionSetSchema());
export default RelationshipQuestionSetV2;
