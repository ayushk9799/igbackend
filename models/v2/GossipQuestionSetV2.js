import mongoose from 'mongoose';
import { createQuestionSetSchema } from './questionSetSchemaFields.js';

const GossipQuestionSetV2 = mongoose.model('GossipQuestionSetV2', createQuestionSetSchema());
export default GossipQuestionSetV2;
