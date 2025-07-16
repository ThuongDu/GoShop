// routes/productquantityRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const productQuantityController = require('../controllers/productquantityController');

router.post('/', auth, role('admin', 'staff'), productQuantityController.createQuantity);
router.get('/', auth, role('admin'), productQuantityController.getAllQuantities);
router.get('/my', auth, role('staff'), productQuantityController.getMyQuantities);
router.post('/add-many', auth, productQuantityController.addManyProductToWarehouse);
router.get('/by-warehouse', auth, role('admin', 'staff'), productQuantityController.getQuantitiesByWarehouse);
router.delete('/:id', auth, role('admin', 'staff'), productQuantityController.deleteQuantity);
router.put('/:id', auth, role('admin', 'staff'), productQuantityController.updateQuantity);
router.get('/current', auth, role('admin','staff'), productQuantityController.getCurrentQuantities);
router.get('/staff/quantities', auth, role('staff','admin'), productQuantityController.getMyShopQuantities);

module.exports = router;
