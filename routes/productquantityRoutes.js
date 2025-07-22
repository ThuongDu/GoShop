const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const productQuantityController = require('../controllers/productquantityController');

router.post('/', auth, role('admin', 'staff'), productQuantityController.createQuantity);          
router.put('/:id', auth, role('admin', 'staff'), productQuantityController.updateQuantity);        
router.delete('/:id', auth, role('admin', 'staff'), productQuantityController.deleteQuantity);   
router.get('/by-warehouse', auth, role('admin', 'staff'), productQuantityController.getQuantitiesByWarehouse);
router.get('/current', auth, role('admin', 'staff'), productQuantityController.getCurrentQuantities);
router.get(
  '/group-by-product', 
  auth, 
  productQuantityController.getQuantitiesGroupByProduct
);
router.get('/', auth, role('admin'), productQuantityController.getAllQuantities);                  
router.post('/add-many', auth, role('admin'), productQuantityController.addManyProductToWarehouse); 

router.get('/my', auth, role('staff'), productQuantityController.getMyQuantities);                
router.post('/staff/add', auth, role('staff'), productQuantityController.addQuantityByStaff);       
router.get('/staff/quantities', auth, role('staff','admin'), productQuantityController.getMyShopQuantities); 

router.get('/shop/:shopId/warehouse/:warehouseId', auth, role('admin','staff'), productQuantityController.getProductsByShopWarehouse);

module.exports = router;
