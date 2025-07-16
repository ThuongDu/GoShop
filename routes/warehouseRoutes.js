const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/shop/:shopId', auth, warehouseController.getWarehousesByShop);
router.get('/:id', auth, warehouseController.getWarehouseById);
router.post('/', auth, role('admin'), warehouseController.createWarehouse);
router.put('/:id', auth, role('admin'), warehouseController.updateWarehouse);
router.delete('/:id', auth, role('admin'), warehouseController.deleteWarehouse);
router.get('/', auth, role('admin'), warehouseController.getAllWarehouses);

module.exports = router;
