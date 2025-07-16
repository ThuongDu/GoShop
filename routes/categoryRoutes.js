const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const auth = require('../middleware/auth');

router.get('/warehouse/:warehouseId', auth, categoryController.getCategoriesByWarehouse);
router.post('/', auth, categoryController.createCategory);
router.put('/:id', auth, categoryController.updateCategory);
router.delete('/:id', auth, categoryController.deleteCategory);
router.get('/product/:productId', auth, categoryController.getCategoriesByProduct);
router.get('/:id', auth, categoryController.getCategoryById);


module.exports = router;
