const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.post('/', auth, role('admin', 'staff'), orderController.createOrder);
router.get('/', auth, role('admin', 'staff'), orderController.getAllOrders);
router.patch('/:orderId/status', auth, role('admin','staff'), orderController.updateOrderStatus);

router.get('/:orderId/details', auth, orderController.getOrderDetails);
router.post('/create-customer', auth, role('admin', 'staff'), orderController.createCustomerIfNotExists);
router.get('/products/:shopId/:warehouseId/:categoryId', auth, role('admin', 'staff'), orderController.getProductsByShopWarehouseCategory);
router.get('/products/:shopId/:warehouseId', auth, role('admin','staff'), orderController.getProductsByShopWarehouse);
router.get('/:orderId', auth, orderController.getOrderInfo);
router.post('/ordersstaff', auth, role('staff'), orderController.createOrderByStaff);
router.post('/staff/quantity', auth, role('staff'), orderController.addQuantityByStaff);

module.exports = router;
