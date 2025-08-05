const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/staticController');
const auth = require('../middleware/auth');

router.get('/', auth, statisticsController.getStatistics);
router.get('/daily-revenue', auth, statisticsController.getDailyRevenue);
router.get('/monthly-revenue', auth, statisticsController.getMonthlyRevenue);
router.get('/revenue-by-shop', auth, statisticsController.getRevenueByShop);
router.get('/revenue-by-staff', auth, statisticsController.getRevenueByStaff);
router.get('/top-products', auth, statisticsController.getTopProducts);
router.get('/order-status-counts', auth, statisticsController.getOrderStatusCounts);
router.get('/today-revenue-by-staff', auth, statisticsController.getTodayRevenueByStaff);
router.get('/staff/sold-products', auth, statisticsController.getSoldProductsByStaff);
router.get('/staff/shop-revenue', auth, statisticsController.getTotalRevenueByStaffShop);
router.get('/staff/top-products', auth, statisticsController.getStaffTopProducts);
router.get('/staff/recent-orders', auth, statisticsController.getStaffRecentOrders);

module.exports = router;