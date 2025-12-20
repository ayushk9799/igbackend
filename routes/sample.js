import express from 'express';

const router = express.Router();

// Example route
router.get('/', (req, res) => {
    res.json({ message: 'API is working!' });
});

// Add more route imports here as needed
// import usersRoutes from './users.js';
// router.use('/users', usersRoutes);

export default router;
