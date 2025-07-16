const db = require('../config/db');

exports.createOrder = async (req, res) => {
  const { customer_id, shop_id, items } = req.body;
  const created_by = req.user.id;

  if (!customer_id || !shop_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin đơn hàng' });
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    let total_price = 0;

    for (const item of items) {
      if (!item.category_id || !item.warehouse_id) {
        await conn.rollback();
        return res.status(400).json({ message: `Thiếu kho / danh mục cho sản phẩm ID ${item.product_id}` });
      }

      const [rows] = await conn.execute(
        `SELECT quantity FROM product_quantity WHERE product_id = ? AND category_id = ? AND warehouse_id = ? AND shop_id = ?`,
        [item.product_id, item.category_id, item.warehouse_id, shop_id]
      );

      if (rows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ message: `Không tìm thấy tồn kho cho sản phẩm ID ${item.product_id}` });
      }

      if (rows[0].quantity < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ message: `Sản phẩm ID ${item.product_id} không đủ hàng` });
      }
    }

    for (const item of items) {
      total_price += item.price * item.quantity;
    }
    const tax = Math.round(total_price * 0.08);
    const grandTotal = total_price + tax;

    const [[{ count }]] = await conn.execute(`SELECT COUNT(*) AS count FROM orders`);
    const code = `ORD${String(count + 1).padStart(2, '0')}`;

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code, customer_id, shop_id, grandTotal, tax, created_by]
    );
    const order_id = orderResult.insertId;

    for (const item of items) {
      const itemTotal = item.price * item.quantity;
      const [[prod]] = await conn.execute(`SELECT code, name FROM product WHERE id = ?`, [item.product_id]);

      await conn.execute(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, total_price, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [order_id, item.product_id, prod?.code || '', prod?.name || '', item.quantity, itemTotal, created_by]
      );

      await conn.execute(
        `UPDATE product_quantity SET quantity = quantity - ? WHERE product_id = ? AND category_id = ? AND warehouse_id = ? AND shop_id = ?`,
        [item.quantity, item.product_id, item.category_id, item.warehouse_id, shop_id]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Tạo đơn hàng thành công', order_id, code });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi tạo đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi tạo đơn hàng' });
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

exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT o.id, o.code, o.total_price, o.tax, o.status, o.created_at,
             c.name AS customer_name, s.name AS shop_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      LEFT JOIN shop s ON o.shop_id = s.id
    `;
    const params = [];
    if (status) {
      query += ' WHERE o.status = ?';
      params.push(status);
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

exports.getProductsByShopWarehouse = async (req, res) => {
  const { shopId, warehouseId } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.code, p.name, p.price, pq.quantity, pq.category_id, pq.warehouse_id, pq.shop_id, c.name AS category_name
      FROM product_quantity pq
      JOIN product p ON pq.product_id = p.id
      JOIN category c ON pq.category_id = c.id
      WHERE pq.shop_id = ? AND pq.warehouse_id = ?`,
      [shopId, warehouseId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server khi lấy SP' });
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