const express = require("express");
const router  = express.Router();
const staff   = require("../controllers/staffController");
const auth    = require("../middleware/auth");

router.get("/warehouses",        auth, staff.getWarehousesByStaff);   
router.get("/products",          auth, staff.getProductsByStaff);       
router.get ("/orders",           auth, staff.getOrdersByStaff);          
router.post("/orders",           auth, staff.createOrderByStaff);        
router.post("/quantity",         auth, staff.addQuantityByStaff);     
router.post("/customers",        auth, staff.createCustomerByStaff);    
router.get ("/customers",        auth, staff.getCustomers);          
router.get ("/profile",          auth, staff.getStaffProfile);         

module.exports = router;
