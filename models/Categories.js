import mongoose from "mongoose";

const categoriesSchema = new mongoose.Schema({
    slug:{
        type:String,
        required:true,
        unique:true
    },
    title:{
        type:String,
        required:true
    },
    modelName:{
        type:String,
        required:true
    },
    icon:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true
    },
    isActive:{
        type:Boolean,
        required:true,
        default:true
    },
},{timestamps:true});
categoriesSchema.index({title:1});
const Categories = mongoose.model("Categories",categoriesSchema);
export default Categories;