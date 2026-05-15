import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

async function checkModels() {
    try {
        await mongoose.connect(MONGODB_URI);
        const modelsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'models');
        const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));
        
        console.log('--- Model Document Counts ---');
        for (const file of files) {
            try {
                const modelPath = path.join('file://', modelsDir, file);
                const importedModule = await import(modelPath);
                
                // Usually default export is the model
                const Model = importedModule.default;
                
                if (Model && Model.modelName && typeof Model.countDocuments === 'function') {
                    const count = await Model.countDocuments();
                    console.log(`[${count === 0 ? 'EMPTY' : 'DATA '}] ${Model.modelName}: ${count} documents`);
                }
            } catch (err) {
                // Not a mongoose model or failed to import
                console.log(`[SKIP ] ${file} (not a standard model export)`);
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkModels();
