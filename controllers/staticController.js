const db = require('../config/db');

exports.getStatistics = async (req, res) => {
  try {
    const [[{ total_orders }]] = await db.query(`SELECT COUNT(*) AS total_orders FROM orders`);
    const [[{ total_revenue }]] = await db.query(`
      SELECT IFNULL(SUM(total_price + tax), 0) AS total_revenue 
      FROM orders 
      WHERE status = 'thành công'
    `);
    const [[{ total_customers }]] = await db.query(`SELECT COUNT(*) AS total_customers FROM customer`);
    const [[{ total_items_sold }]] = await db.query(`SELECT IFNULL(SUM(quantity), 0) AS total_items_sold FROM order_detail`);

    res.json({
      total_orders,
      total_revenue,
      total_customers,
      total_items_sold,
    });
  } catch (err) {
    console.error('Lỗi getStatistics:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy thống kê' });
  }
};

exports.getDailyRevenue = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_price + tax) AS revenue
      FROM orders
      WHERE created_at >= CURDATE() - INTERVAL 30 DAY AND status = 'thành công'
      GROUP BY date
      ORDER BY date
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getDailyRevenue:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu theo ngày' });
  }
};

exports.getMonthlyRevenue = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        MONTH(created_at) AS month,
        SUM(total_price + tax) AS revenue
      FROM orders
      WHERE YEAR(created_at) = YEAR(CURDATE()) AND status = 'thành công'
      GROUP BY month
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getMonthlyRevenue:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu theo tháng' });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.id, p.name, p.code,
        SUM(od.quantity) AS total_sold
      FROM order_detail od
      JOIN product p ON od.product_id = p.id
      GROUP BY od.product_id
      ORDER BY total_sold DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getTopProducts:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy top sản phẩm' });
  }
};

exports.getOrderStatusCounts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getOrderStatusCounts:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy thống kê trạng thái đơn' });
  }
};

exports.getRevenueByStaff = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id, u.name,
        SUM(o.total_price + o.tax) AS revenue
      FROM orders o
      JOIN users u ON o.created_by = u.id
      WHERE o.status = 'thành công'
      GROUP BY u.id, u.name
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getRevenueByStaff:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu theo nhân viên' });
  }
};

exports.getRevenueByShop = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        s.id, s.name,
        SUM(o.total_price + o.tax) AS revenue
      FROM orders o
      JOIN shop s ON o.shop_id = s.id
      WHERE o.status = 'thành công'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getRevenueByShop:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu theo cửa hàng' });
  }
};
exports.getTodayRevenueByStaff = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.id, u.name,
        SUM(o.total_price) AS revenue
      FROM orders o
      JOIN users u ON o.created_by = u.id
      WHERE o.status = 'thành công' AND DATE(o.created_at) = CURDATE()
      GROUP BY u.id, u.name
      ORDER BY revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getTodayRevenueByStaff:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu trong ngày theo nhân viên' });
  }
};
