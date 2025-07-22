const db = require('../config/db');

exports.createOrder = async (req, res) => {
  const { customer_id, shop_id, warehouse_id, items, payment_method } = req.body;
  const created_by = req.user.id;

  if (!customer_id || !shop_id || !warehouse_id || !Array.isArray(items) || items.length === 0 || !payment_method) {
    return res.status(400).json({ message: 'Thiếu thông tin đơn hàng' });
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    let total_price = 0;

    for (const item of items) {
      if (!item.category_id || !item.product_id || !item.quantity || item.quantity <= 0) {
        await conn.rollback();
        return res.status(400).json({ message: `Thiếu thông tin cho sản phẩm ID ${item.product_id}` });
      }

      // Lấy giá từ bảng product, ưu tiên sale_price nếu > 0
      const [[product]] = await conn.execute(
        `SELECT price, sale_price, code, name FROM product WHERE id = ?`,
        [item.product_id]
      );
      if (!product || (!product.price && !product.sale_price) || (product.price <= 0 && (!product.sale_price || product.sale_price <= 0))) {
        await conn.rollback();
        return res.status(400).json({ message: `Giá sản phẩm ID ${item.product_id} không hợp lệ` });
      }
      const item_price = product.sale_price > 0 ? product.sale_price : product.price;

      // Kiểm tra tồn kho
      const [rows] = await conn.execute(
        `SELECT quantity FROM product_quantity WHERE product_id = ? AND category_id = ? AND warehouse_id = ? AND shop_id = ?`,
        [item.product_id, item.category_id, warehouse_id, shop_id]
      );

      if (rows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ message: `Không tìm thấy tồn kho cho sản phẩm ID ${item.product_id}` });
      }

      if (rows[0].quantity < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ message: `Sản phẩm ID ${item.product_id} không đủ hàng (còn ${rows[0].quantity})` });
      }

      total_price += item_price * item.quantity;
    }

    const tax = Math.round(total_price * 0.08);
    const grandTotal = total_price + tax;

    // Tạo mã đơn hàng
    const [[{ count }]] = await conn.execute(`SELECT COUNT(*) AS count FROM orders`);
    const code = `ORD${String(count + 1).padStart(4, '0')}`;

    // Tạo đơn hàng, thêm payment_method
    const [orderResult] = await conn.execute(
      `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, status, payment_method, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [code, customer_id, shop_id, grandTotal, tax, 'đang xử lý', payment_method, created_by]
    );
    const order_id = orderResult.insertId;

    // Thêm chi tiết đơn hàng và cập nhật tồn kho
    for (const item of items) {
      const [[product]] = await conn.execute(`SELECT price, sale_price, code, name FROM product WHERE id = ?`, [item.product_id]);
      const item_price = product.sale_price > 0 ? product.sale_price : product.price;
      const itemTotal = item_price * item.quantity;

      await conn.execute(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, total_price, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [order_id, item.product_id, product.code, product.name, item.quantity, itemTotal, created_by]
      );

      await conn.execute(
        `UPDATE product_quantity SET quantity = quantity - ? WHERE product_id = ? AND category_id = ? AND warehouse_id = ? AND shop_id = ?`,
        [item.quantity, item.product_id, item.category_id, warehouse_id, shop_id]
      );
    }
    console.log("Dữ liệu nhận được:", req.body);
    await conn.commit();
    res.status(201).json({ message: 'Tạo đơn hàng thành công', order_id, code, total_price, tax, grandTotal });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi tạo đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi tạo đơn hàng', error: err.message });
  } finally {
    conn.release();
  }
};


exports.createCustomerIfNotExists = async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ message: 'Thiếu thông tin khách hàng' });

  try {
    const [[existing]] = await db.query(`SELECT id FROM customer WHERE phone = ?`, [phone]);
    if (existing) {
      return res.json({ message: 'Khách hàng đã tồn tại', customer_id: existing.id });
    }
    const [result] = await db.query(`INSERT INTO customer (name, phone) VALUES (?, ?)`, [name, phone]);
    res.status(201).json({ message: 'Tạo khách hàng thành công', customer_id: result.insertId });
  } catch (err) {
    console.error('Lỗi tạo khách hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getProductsByShopWarehouse = async (req, res) => {
  const { shopId, warehouseId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.code, p.name, p.price, p.sale_price, pq.quantity, pq.category_id, c.name AS category_name
       FROM product p
       JOIN product_quantity pq ON p.id = pq.product_id
       JOIN category c ON pq.category_id = c.id
       WHERE pq.shop_id = ? AND pq.warehouse_id = ?`,
      [shopId, warehouseId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm' });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT o.id, o.code, o.total_price, o.tax, o.status, o.created_at, o.payment_method,
             c.name AS customer_name, s.name AS shop_name,
             u.name AS created_by_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      LEFT JOIN shop s ON o.shop_id = s.id
      LEFT JOIN users u ON o.created_by = u.id
    `;
    const params = [];
    if (status) {
      query += ' WHERE o.status = ?';
      params.push(status);
    }
    const { search, start_date, end_date } = req.query;
    if (search) {
      query += (status ? ' AND' : ' WHERE') + ' (o.code LIKE ? OR c.name LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (start_date) {
      query += (status || search ? ' AND' : ' WHERE') + ' o.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += (status || search || start_date ? ' AND' : ' WHERE') + ' o.created_at <= ?';
      params.push(`${end_date} 23:59:59`);
    }
    query += ' ORDER BY o.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy danh sách đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const validStatuses = ['đang xử lý', 'chờ lấy hàng', 'thành công'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }

  try {
    const [result] = await db.query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.json({ message: 'Cập nhật trạng thái thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật trạng thái:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getOrderDetails = async (req, res) => {
  const { orderId } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT o.code AS order_code, od.product_code, od.product_name, od.quantity, od.total_price, od.created_at, od.created_by
      FROM order_detail od
      JOIN orders o ON od.order_id = o.id
      WHERE od.order_id = ?`, [orderId]);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getProductsByShopWarehouseCategory = async (req, res) => {
  const { shopId, warehouseId, categoryId } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.code, p.name, p.price, pq.quantity, pq.category_id, pq.warehouse_id, pq.shop_id, c.name AS category_name
      FROM product p
      JOIN product_quantity pq ON p.id = pq.product_id
      JOIN category c ON pq.category_id = c.id
      WHERE pq.shop_id = ? AND pq.warehouse_id = ? AND pq.category_id = ?`,
      [shopId, warehouseId, categoryId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm' });
  }
};

exports.getOrderInfo = async (req, res) => {
  const { orderId } = req.params;
  try {
    const [[order]] = await db.query(`
      SELECT o.id, o.code, o.total_price, o.tax, o.status, o.created_at, o.created_by,
             c.name AS customer_name, s.name AS shop_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      LEFT JOIN shop s ON o.shop_id = s.id
      WHERE o.id = ?`, [orderId]);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.json(order);
  } catch (err) {
    console.error('Lỗi lấy thông tin đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const user = req.user;

  try {
    if (user.role === 'staff') {
      const [rows] = await db.query('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, user.shop_id]);
      if (rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    res.json({ message: 'Cập nhật trạng thái thành công' });

  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};


exports.createOrderByStaff = async (req, res) => {
  const created_by = req.user.id; 
  const { customer_id, items } = req.body;

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin đơn hàng' });
  }

  try {
    const [[staff]] = await db.query('SELECT shop_id FROM users WHERE id = ?', [created_by]);
    if (!staff || !staff.shop_id) {
      return res.status(400).json({ message: 'Nhân viên chưa được gán shop' });
    }

    const shop_id = staff.shop_id;

    const newReq = {
      ...req,
      body: { ...req.body, shop_id }
    };

    return exports.createOrder(newReq, res);
  } catch (err) {
    console.error('Lỗi tạo đơn hàng từ staff:', err);
    return res.status(500).json({ message: 'Lỗi server khi staff tạo đơn hàng' });
  }
};

exports.addQuantityByStaff = async (req, res) => {
  const { product_id, image_id, category_id, warehouse_id, quantity } = req.body;
  const created_by    = req.user.id;
  const user_shop_id  = req.user.shop_id;

  try {
    // 1. xác thực kho thuộc shop
    const [rows] = await db.execute(
      `SELECT 1 FROM warehouse WHERE id = ? AND shop_id = ?`,
      [warehouse_id, user_shop_id]
    );
    if (rows.length === 0)
      return res.status(403).json({ message: "Kho không thuộc cửa hàng của bạn" });

    // 2. thêm vào product_quantity (có shop_id)
    await db.execute(`
      INSERT INTO product_quantity
      (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      product_id,
      image_id,
      category_id,
      warehouse_id,
      user_shop_id,  
      quantity,
      created_by
    ]);

    res.json({ message: "Thêm số lượng thành công" });
  } catch (err) {
    console.error("addQuantityByStaff error:", err);
    res.status(500).json({ message: "Lỗi server khi thêm số lượng" });
  }
};