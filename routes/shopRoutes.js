const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

router.get('/', shopController.getAllShops);
router.get('/:id', shopController.getShopById);
router.post('/', shopController.createShop);
router.put('/:id', shopController.updateShop);
router.delete('/:id', shopController.deleteShop);
router.put('/shops/:id', shopController.updateShop);

module.exports = router;
