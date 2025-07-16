const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const uploads = require('../middleware/uploads');
const auth = require('../middleware/auth');

router.post('/', auth, uploads.single('image'), productController.createProductWithImage);
router.get('/category/:categoryId', auth, productController.getProductsByCategory);
router.get('/:id/categories', auth, productController.getCategoriesByProduct);
router.get('/', auth, productController.getAllProducts);
router.get('/:id', auth, productController.getProductById);
router.put('/:id', auth, productController.updateProduct);
router.delete('/:id', auth, productController.deleteProduct);

module.exports = router;
