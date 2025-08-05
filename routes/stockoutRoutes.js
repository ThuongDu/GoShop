const express = require('express');
const router = express.Router();
const stockoutController = require('../controllers/stockoutController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.post('/', auth, role('admin'), stockoutController.createStockOut);

module.exports = router;