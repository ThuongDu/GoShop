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
    const { dateRange } = req.query;
    let dateFilter = '';
    if (dateRange === 'today') {
      dateFilter = 'AND DATE(created_at) = CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_price + tax) AS revenue
      FROM orders
      WHERE status = 'thành công' ${dateFilter}
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
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [];
    if (dateRange === 'today') {
      dateFilter = 'AND o.created_at >= CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        p.id, p.name, p.code,
        SUM(od.quantity) AS total_sold
      FROM order_detail od
      JOIN product p ON od.product_id = p.id
      JOIN orders o ON od.order_id = o.id
      WHERE o.status = 'thành công' ${dateFilter}
      GROUP BY p.id, p.name, p.code
      ORDER BY total_sold DESC
      LIMIT 5
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getTopProducts:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy top sản phẩm' });
  }
};

exports.getOrderStatusCounts = async (req, res) => {
  try {
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [];
    if (dateRange === 'today') {
      dateFilter = 'WHERE DATE(created_at) = CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM orders
      ${dateFilter}
      GROUP BY status
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getOrderStatusCounts:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy thống kê trạng thái đơn' });
  }
};

exports.getRevenueByStaff = async (req, res) => {
  try {
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [req.user.id];

    if (dateRange === 'today') {
      dateFilter = 'AND DATE(o.created_at) = CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        u.id, u.name,
        SUM(o.total_price + o.tax) AS revenue,
        CASE WHEN u.id = ? THEN 1 ELSE 0 END AS isCurrentUser
      FROM orders o
      JOIN users u ON o.created_by = u.id
      WHERE o.status = 'thành công' ${dateFilter}
      GROUP BY u.id, u.name
      ORDER BY revenue DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getRevenueByStaff:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy doanh thu theo nhân viên' });
  }
};

exports.getRevenueByShop = async (req, res) => {
  try {
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [];
    if (dateRange === 'today') {
      dateFilter = 'AND DATE(created_at) = CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        s.id, s.name,
        SUM(o.total_price + o.tax) AS revenue
      FROM orders o
      JOIN shop s ON o.shop_id = s.id
      WHERE o.status = 'thành công' ${dateFilter}
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `, params);
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

exports.getSoldProductsByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [staffId];

    if (dateRange === 'today') {
      dateFilter = 'AND o.created_at >= CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        SUM(od.quantity) AS soldProducts
      FROM order_detail od
      JOIN orders o ON od.order_id = o.id
      WHERE o.created_by = ? AND o.status = 'thành công' ${dateFilter}
    `, params);
    res.json({ soldProducts: rows[0].soldProducts || 0 });
  } catch (err) {
    console.error('Lỗi getSoldProductsByStaff:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm đã bán theo nhân viên' });
  }
};

exports.getTotalRevenueByStaffShop = async (req, res) => {
  try {
    const staffId = req.user.id;
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [staffId];

    if (dateRange === 'today') {
      dateFilter = 'AND DATE(created_at) = CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [[{ shop_id }]] = await db.query(`
      SELECT shop_id FROM users WHERE id = ?
    `, params);

    const [[{ revenue }]] = await db.query(`
      SELECT SUM(total_price + tax) AS revenue
      FROM orders
      WHERE shop_id = ? AND status = 'thành công' ${dateFilter}
    `, [shop_id]);
    res.json({ shop_id, revenue: revenue || 0 });
  } catch (err) {
    console.error('Lỗi getTotalRevenueByStaffShop:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy tổng doanh thu cửa hàng' });
  }
};

exports.getStaffTopProducts = async (req, res) => {
  try {
    const staffId = req.user.id;
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [staffId];

    if (dateRange === 'today') {
      dateFilter = 'AND o.created_at >= CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        od.product_id,
        od.product_name,
        SUM(od.quantity) AS total_quantity,
        SUM(od.total_price) AS total_revenue
      FROM order_detail od
      JOIN orders o ON od.order_id = o.id
      WHERE o.created_by = ? AND o.status = 'thành công' ${dateFilter}
      GROUP BY od.product_id, od.product_name
      ORDER BY total_quantity DESC
      LIMIT 10
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getStaffTopProducts:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm bán chạy' });
  }
};

exports.getStaffRecentOrders = async (req, res) => {
  try {
    const staffId = req.user.id;
    const { dateRange } = req.query;
    let dateFilter = '';
    const params = [staffId];

    if (dateRange === 'today') {
      dateFilter = 'AND o.created_at >= CURDATE()';
    } else if (dateRange === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (dateRange === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(`
      SELECT 
        o.id,
        o.code,
        c.name AS customer_name,
        o.total_price,
        o.created_at
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      WHERE o.created_by = ? AND o.status = 'thành công' ${dateFilter}
      ORDER BY o.created_at DESC
      LIMIT 10
    `, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getStaffRecentOrders:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy đơn hàng gần đây' });
  }
};