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

module.exports = router;
