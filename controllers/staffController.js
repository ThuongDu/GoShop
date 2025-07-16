const db = require('../config/db');

exports.getWarehousesByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const [[staff]] = await db.query('SELECT shop_id FROM users WHERE id = ?', [staffId]);
    if (!staff) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });

    const [warehouses] = await db.query('SELECT id, name FROM warehouse WHERE shop_id = ?', [staff.shop_id]);
    res.json(warehouses);
  } catch (err) {
    console.error('getWarehousesByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getOrdersByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;

    const [[staff]] = await db.query(
      "SELECT shop_id FROM users WHERE id = ?", [staffId]
    );
    if (!staff || !staff.shop_id) {
      return res.status(404).json({ message: "Nhân viên chưa gán shop" });
    }

    // Cho phép filter ?status=
    const { status } = req.query;
    let sql = `
      SELECT 
        o.id,
        o.code,
        o.total_price,
        o.tax,
        o.status,
        o.created_at,
        c.name AS customer_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      WHERE o.shop_id = ?
    `;
    const params = [staff.shop_id];

    if (status) {
      sql += " AND o.status = ?";
      params.push(status);
    }
    sql += " ORDER BY o.created_at DESC";

    const [orders] = await db.query(sql, params);
    res.json(orders);
  } catch (err) {
    console.error("getOrdersByStaff error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.createOrderByStaff = async (req, res) => {
  const created_by = req.user.id;
  const { customer_id, items } = req.body;

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin đơn hàng' });
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [[staff]] = await conn.query('SELECT shop_id FROM users WHERE id = ?', [created_by]);
    if (!staff || !staff.shop_id) {
      await conn.rollback();
      return res.status(400).json({ message: 'Nhân viên chưa được gán shop' });
    }

    const shop_id = staff.shop_id;

    for (const item of items) {
      if (!item.category_id || !item.warehouse_id) {
        await conn.rollback();
        return res.status(400).json({ message: `Thiếu kho / danh mục cho sản phẩm ID ${item.product_id}` });
      }

      const [rows] = await conn.query(
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

    let total_price = 0;
    for (const item of items) {
      total_price += item.price * item.quantity;
    }
    const tax = Math.round(total_price * 0.08);
    const grandTotal = total_price + tax;

    const [[{ count }]] = await conn.query(`SELECT COUNT(*) AS count FROM orders`);
    const code = `ORD${String(count + 1).padStart(2, '0')}`;

    const [orderResult] = await conn.query(
      `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code, customer_id, shop_id, grandTotal, tax, created_by]
    );
    const order_id = orderResult.insertId;

    for (const item of items) {
      const itemTotal = item.price * item.quantity;
      const [[prod]] = await conn.query(`SELECT code, name FROM product WHERE id = ?`, [item.product_id]);

      await conn.query(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, total_price, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [order_id, item.product_id, prod?.code || '', prod?.name || '', item.quantity, itemTotal, created_by]
      );

      await conn.query(
        `UPDATE product_quantity 
         SET quantity = quantity - ? 
         WHERE product_id = ? AND category_id = ? AND warehouse_id = ? AND shop_id = ?`,
        [item.quantity, item.product_id, item.category_id, item.warehouse_id, shop_id]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Tạo đơn hàng thành công', order_id, code });
  } catch (err) {
    await conn.rollback();
    console.error('Lỗi tạo đơn hàng từ staff:', err);
    res.status(500).json({ message: 'Lỗi server khi staff tạo đơn hàng' });
  } finally {
    conn.release();
  }
};

exports.getProductsByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const [[staff]] = await db.query('SELECT shop_id FROM users WHERE id = ?', [staffId]);
    if (!staff || !staff.shop_id) return res.status(400).json({ message: 'Staff chưa gắn shop' });

    const [products] = await db.query(`
      SELECT DISTINCT p.id, p.name, p.price, p.code, p.created_at
      FROM product p
      JOIN product_quantity pq ON p.id = pq.product_id
      WHERE pq.shop_id = ?
      ORDER BY p.created_at DESC
    `, [staff.shop_id]);

    for (const product of products) {
      const [images] = await db.query('SELECT id, url FROM product_image WHERE product_id = ?', [product.id]);
      product.images = images;
    }

    res.json(products);
  } catch (err) {
    console.error('getProductsByStaff error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addQuantityByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const shop_id = req.user.shop_id; // ← Lấy từ middleware auth
    const { product_id, image_id, category_id, warehouse_id, quantity } = req.body;

    if (!product_id || !image_id || !category_id || !warehouse_id || !quantity) {
      return res.status(400).json({ message: 'Thiếu thông tin' });
    }

    const [warehouse] = await db.query(
      'SELECT id FROM warehouse WHERE id = ? AND shop_id = ?',
      [warehouse_id, shop_id]
    );
    if (warehouse.length === 0) {
      return res.status(400).json({ message: 'Kho không hợp lệ hoặc không thuộc cửa hàng của bạn' });
    }

    await db.query(
      `INSERT INTO product_quantity 
       (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id, image_id, category_id, warehouse_id, shop_id, quantity, staffId]
    );

    res.json({ message: 'Thêm số lượng thành công' });
  } catch (err) {
    console.error('addQuantityByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.createCustomerByStaff = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ message: 'Thiếu tên hoặc SĐT' });

    const [exist] = await db.query('SELECT id FROM customer WHERE phone = ?', [phone]);
    if (exist.length > 0) {
      return res.json({ message: 'Khách đã tồn tại', customer_id: exist[0].id });
    }

    const [result] = await db.query('INSERT INTO customer (name, phone) VALUES (?, ?)', [name, phone]);
    res.json({ message: 'Thêm khách thành công', customer_id: result.insertId });
  } catch (err) {
    console.error('createCustomerByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// 📄 Lấy tất cả khách hàng (dùng cho suggest)
exports.getCustomers = async (req, res) => {
  try {
    const [customers] = await db.query('SELECT id, name, phone FROM customer ORDER BY id DESC');
    res.json(customers);
  } catch (err) {
    console.error('getCustomers error:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};