const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authController = require('../controllers/authController')(db);
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.get('/me', auth, authController.me);
router.post('/forgot', auth, authController.forgotPassword);

router.post('/register', authController.register);
router.post('/login', authController.login);

router.get('/all', auth, role('admin'), authController.getAll);
router.get('/staff', auth, role('admin'), authController.getStaffList);
router.put('/staff/:id', auth, role('admin'), authController.updateStaff);
router.delete('/staff/:id', auth, role('admin'), authController.deleteStaff);


module.exports = router;
