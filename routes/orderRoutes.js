const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.post('/', auth, role('admin', 'staff'), orderController.createOrder);
router.post('/create-customer', auth, role('admin', 'staff'), orderController.createCustomerIfNotExists);
router.post('/ordersstaff', auth, role('staff'), orderController.createOrderByStaff);
router.post('/staff/quantity', auth, role('staff'), orderController.addQuantityByStaff);

router.get('/', auth, role('admin', 'staff'), orderController.getAllOrders);
router.get('/:orderId', auth, orderController.getOrderInfo);
router.get('/:orderId/details', auth, orderController.getOrderDetails);
router.get('/products/:shopId/:warehouseId', auth, role('admin', 'staff'), orderController.getProductsByShopWarehouse);
router.get('/products/:shopId/:warehouseId/:categoryId', auth, role('admin', 'staff'), orderController.getProductsByShopWarehouseCategory);

router.patch('/:orderId/status', auth, orderController.updateOrderStatus);

module.exports = router;