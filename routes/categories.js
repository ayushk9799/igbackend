import express from 'express';
import Categories from '../models/Categories.js';

const router = express.Router();

/**
 * GET /api/categories
 * Fetch all active categories
 */
router.get('/', async (req, res) => {
    try {
        const categories = await Categories.find({ isActive: true }).sort({ title: 1 });
        res.status(200).json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

/**
 * GET /api/categories/:slug
 * Fetch a single category by slug
 */
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const category = await Categories.findOne({ slug, isActive: true });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category',
            error: error.message
        });
    }
});

/**
 * POST /api/categories
 * Create a new category
 */
router.post('/', async (req, res) => {
    try {
        const { slug, title, modelName, icon, description, isActive = true } = req.body;

        // Validate required fields
        if (!slug || !title || !modelName || !icon || !description) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: slug, title, modelName, icon, description'
            });
        }

        // Check if category with same slug already exists
        const existingCategory = await Categories.findOne({ slug });
        if (existingCategory) {
            return res.status(409).json({
                success: false,
                message: 'Category with this slug already exists'
            });
        }

        const newCategory = new Categories({
            slug,
            title,
            modelName,
            icon,
            description,
            isActive
        });

        await newCategory.save();

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: newCategory
        });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create category',
            error: error.message
        });
    }
});

/**
 * POST /api/categories/bulk
 * Create multiple categories at once (useful for initial seeding)
 */
router.post('/bulk', async (req, res) => {
    try {
        const { categories } = req.body;

        if (!Array.isArray(categories) || categories.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Categories array is required and must not be empty'
            });
        }

        const results = {
            created: [],
            skipped: [],
            errors: []
        };

        for (const category of categories) {
            try {
                const { slug, title, modelName, icon, description, isActive = true } = category;

                if (!slug || !title || !modelName || !icon || !description) {
                    results.errors.push({ slug, reason: 'Missing required fields' });
                    continue;
                }

                const existingCategory = await Categories.findOne({ slug });
                if (existingCategory) {
                    results.skipped.push({ slug, reason: 'Already exists' });
                    continue;
                }

                const newCategory = new Categories({
                    slug,
                    title,
                    modelName,
                    icon,
                    description,
                    isActive
                });

                await newCategory.save();
                results.created.push(newCategory);
            } catch (err) {
                results.errors.push({ slug: category.slug, reason: err.message });
            }
        }

        res.status(201).json({
            success: true,
            message: `Bulk operation completed`,
            data: results
        });
    } catch (error) {
        console.error('Error in bulk category creation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create categories',
            error: error.message
        });
    }
});

/**
 * PUT /api/categories/:slug
 * Update a category by slug
 */
router.put('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const updateData = req.body;

        const category = await Categories.findOneAndUpdate(
            { slug },
            updateData,
            { new: true, runValidators: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: category
        });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update category',
            error: error.message
        });
    }
});

/**
 * DELETE /api/categories/:slug
 * Soft delete a category (sets isActive to false)
 */
router.delete('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const category = await Categories.findOneAndUpdate(
            { slug },
            { isActive: false },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Category deactivated successfully',
            data: category
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete category',
            error: error.message
        });
    }
});

export default router;
