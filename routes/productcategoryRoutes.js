const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const productCategoryController = require('../controllers/productcategoryController');

router.get('/category/:categoryId', auth, productCategoryController.getProductsByCategory);

module.exports = router;
