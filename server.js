const express = require("express");
const cors = require("cors");
const db = require("./config/db");  
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const authRoutes = require("./routes/authRoutes");
const shopRoutes = require('./routes/shopRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const productquantityRoutes = require('./routes/productquantityRoutes');
const productCategoryRoutes = require('./routes/productcategoryRoutes');
const customerRoutes = require('./routes/customerRoutes'); 
const orderRoutes = require('./routes/orderRoutes');
const staffRoutes = require('./routes/staffRoutes');
const statisticsRoutes = require("./routes/staticRoutes");

app.use("/api/auth", authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/quantities', productquantityRoutes);
app.use('/api/productcategories', productCategoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/staff', staffRoutes);
app.use("/api/statistics", statisticsRoutes); 


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, () => {
  console.log(`Server đang chạy trên http://localhost:${PORT}`);
});
