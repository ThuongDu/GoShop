const db = require('../config/db');

exports.getProductsByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const [[staff]] = await db.query('SELECT shop_id FROM users WHERE id = ?', [staffId]);
    
    if (!staff || !staff.shop_id) {
      return res.status(400).json({ message: 'Nhân viên chưa được gán cửa hàng' });
    }

    const query = `
      SELECT 
        p.id AS product_id,
        p.name,
        p.price,
        p.sale_price,
        p.code,
        p.weight,
        p.unit,
        p.created_at,
        SUM(pq.quantity) AS quantity,
        pq.expiry_date,
        pq.category_id
      FROM product p
      JOIN product_quantity pq ON p.id = pq.product_id
      WHERE pq.shop_id = ? AND pq.quantity > 0
      AND (pq.expiry_date IS NULL OR pq.expiry_date >= NOW())
      GROUP BY p.id, pq.expiry_date, pq.category_id, p.name, p.price, p.sale_price, p.code, p.weight, p.unit, p.created_at
      ORDER BY p.created_at DESC, pq.expiry_date ASC
    `;
    
    const [products] = await db.query(query, [staff.shop_id]);

    for (const product of products) {
      const [images] = await db.query(
        'SELECT id, url FROM product_image WHERE product_id = ?', 
        [product.product_id]
      );
      product.images = images || [];
    }

    res.json(products);
  } catch (err) {
    console.error('getProductsByStaff error:', err.stack);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách sản phẩm' });
  }
};

exports.createOrderByStaff = async (req, res) => {
  const created_by = req.user?.id;
  const { customer_id, items, payment_method } = req.body;

  console.log('Received request to create order:', { customer_id, items, payment_method });

  if (!created_by) {
    return res.status(401).json({ message: 'Không tìm thấy thông tin người dùng' });
  }

  if (!customer_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin đơn hàng' });
  }

  if (!['tiền mặt', 'chuyển khoản'].includes(payment_method)) {
    return res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' });
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [[staff]] = await conn.query('SELECT shop_id FROM users WHERE id = ?', [created_by]);
    if (!staff || !staff.shop_id) {
      throw new Error('Nhân viên chưa được gán cửa hàng');
    }
    const shop_id = staff.shop_id;

    const [[customer]] = await conn.query('SELECT id FROM customer WHERE id = ?', [customer_id]);
    if (!customer) {
      throw new Error('Khách hàng không tồn tại');
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1 || !item.price || item.price < 0 || !item.product_code || !item.product_name) {
        throw new Error(`Thông tin sản phẩm không hợp lệ cho sản phẩm ID ${item.product_id}`);
      }

      const now = new Date();
      if (item.expiry_date && new Date(item.expiry_date) < now) {
        throw new Error(`Lô sản phẩm ${item.product_name} đã hết hạn`);
      }

      const [rows] = await conn.query(
        `SELECT SUM(quantity) AS total_quantity 
         FROM product_quantity 
         WHERE product_id = ? AND shop_id = ? 
         AND (expiry_date IS NULL OR expiry_date = ? OR expiry_date >= NOW())`,
        [item.product_id, shop_id, item.expiry_date || null]
      );

      const availableQuantity = rows[0].total_quantity || 0;
      if (availableQuantity < item.quantity) {
        throw new Error(`Sản phẩm ${item.product_name} không đủ số lượng (còn: ${availableQuantity})`);
      }
    }

    const total_price = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const tax = Math.round(total_price * 0.08);
    const grandTotal = total_price + tax;

    const [[{ count }]] = await conn.query(`SELECT COUNT(*) AS count FROM orders WHERE shop_id = ?`, [shop_id]);
    const code = `ORD${shop_id}-${String(count + 1).padStart(4, '0')}`;

    const [orderResult] = await conn.query(
      `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, payment_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, customer_id, shop_id, grandTotal, tax, payment_method, created_by]
    );
    const order_id = orderResult.insertId;

    for (const item of items) {
      const itemTotal = Number(item.price) * item.quantity;
      const [[prod]] = await conn.query(`SELECT code, name FROM product WHERE id = ?`, [item.product_id]);

      await conn.query(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, price, total_price, category_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order_id, item.product_id, prod?.code || item.product_code, prod?.name || item.product_name, item.quantity, item.price, itemTotal, item.category_id || null, created_by]
      );

      await conn.query(
        `UPDATE product_quantity 
         SET quantity = quantity - ? 
         WHERE product_id = ? AND shop_id = ? 
         AND (expiry_date IS NULL OR expiry_date = ? OR expiry_date >= NOW())`,
        [item.quantity, item.product_id, shop_id, item.expiry_date || null]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Tạo đơn hàng thành công', order_id, code });
  } catch (err) {
    await conn.rollback();
    console.error('createOrderByStaff error:', err.stack);
    res.status(400).json({ message: err.message || 'Lỗi khi tạo đơn hàng' });
  } finally {
    conn.release();
  }
};

// Other endpoints remain unchanged
exports.getWarehousesByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;
    const [[staff]] = await db.query('SELECT shop_id FROM users WHERE id = ?', [staffId]);
    
    if (!staff || !staff.shop_id) {
      return res.status(404).json({ message: 'Nhân viên chưa được gán cửa hàng' });
    }

    const [warehouses] = await db.query('SELECT id, name FROM warehouse WHERE shop_id = ?', [staff.shop_id]);
    res.json(warehouses);
  } catch (err) {
    console.error('getWarehousesByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách kho' });
  }
};

exports.getOrdersByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;

    // Lấy shop_id của nhân viên
    const [[staff]] = await db.query(
      'SELECT shop_id FROM users WHERE id = ?',
      [staffId]
    );

    if (!staff || !staff.shop_id) {
      return res
        .status(404)
        .json({ message: 'Nhân viên chưa được gán cửa hàng' });
    }

    const { status, search, start_date, end_date } = req.query;
    let sql = `
      SELECT 
        o.id,
        o.code,
        o.total_price,
        o.tax,
        o.status,
        o.created_at,
        o.payment_method,
        c.name AS customer_name,
        u.name AS created_by_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.shop_id = ?
    `;

    const params = [staff.shop_id];

    // Lọc theo trạng thái
    if (status && ['đang xử lý', 'thành công'].includes(status)) {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    // Lọc theo từ khóa
    if (search) {
      const keyword = `%${search}%`;
      sql += `
        AND (
          o.code LIKE ? OR 
          c.name LIKE ? OR 
          u.name LIKE ?
        )
      `;
      params.push(keyword, keyword, keyword);
    }

    // Lọc theo ngày tạo
    if (start_date) {
      sql += ' AND DATE(o.created_at) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      sql += ' AND DATE(o.created_at) <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY o.created_at DESC';

    const [orders] = await db.query(sql, params);
    return res.json(orders);
  } catch (err) {
    console.error('getOrdersByStaff error:', err);
    return res
      .status(500)
      .json({ message: 'Lỗi server khi lấy danh sách đơn hàng' });
  }
};

exports.addQuantityByStaff = async (req, res) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const staffId = req.user.id;
    const shop_id = req.user.shop_id;
    const { product_id, image_id, category_id, quantity, expiry_date } = req.body;

    if (!product_id || !quantity || quantity <= 0) {
      throw new Error('Thiếu hoặc thông tin không hợp lệ (product_id, quantity)');
    }

    const [[product]] = await conn.query('SELECT id FROM product WHERE id = ?', [product_id]);
    if (!product) {
      throw new Error(`Sản phẩm ID ${product_id} không tồn tại`);
    }

    if (category_id) {
      const [[category]] = await conn.query('SELECT id FROM category WHERE id = ?', [category_id]);
      if (!category) {
        throw new Error(`Danh mục ID ${category_id} không tồn tại`);
      }
    }

    if (image_id) {
      const [[image]] = await conn.query(
        'SELECT id FROM product_image WHERE id = ? AND product_id = ?', 
        [image_id, product_id]
      );
      if (!image) {
        throw new Error(`Ảnh ID ${image_id} không hợp lệ hoặc không thuộc sản phẩm`);
      }
    }

    await conn.query(
      `INSERT INTO product_quantity 
       (product_id, image_id, category_id, shop_id, quantity, expiry_date, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id, image_id || null, category_id || null, shop_id, quantity, expiry_date || null, staffId]
    );

    await conn.commit();
    res.json({ message: 'Thêm số lượng thành công' });
  } catch (err) {
    await conn.rollback();
    console.error('addQuantityByStaff error:', err);
    res.status(400).json({ message: err.message || 'Lỗi khi thêm số lượng sản phẩm' });
  } finally {
    conn.release();
  }
};

exports.createCustomerByStaff = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Thiếu tên hoặc số điện thoại' });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: 'Số điện thoại không hợp lệ' });
    }

    const [exist] = await db.query('SELECT id FROM customer WHERE phone = ?', [phone]);
    if (exist.length > 0) {
      return res.json({ message: 'Khách hàng đã tồn tại', customer_id: exist[0].id });
    }

    const [result] = await db.query(
      'INSERT INTO customer (name, phone, created_at) VALUES (?, ?, NOW())', 
      [name, phone]
    );
    
    res.status(201).json({ 
      message: 'Thêm khách hàng thành công', 
      customer_id: result.insertId 
    });
  } catch (err) {
    console.error('createCustomerByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server khi thêm khách hàng' });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const [customers] = await db.query(
      'SELECT id, name, phone, created_at FROM customer ORDER BY created_at DESC'
    );
    res.json(customers);
  } catch (err) {
    console.error('getCustomers error:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách khách hàng' });
  }
};

exports.getStaffProfile = async (req, res) => {
  try {
    const staffId = req.user.id;
    const [[staff]] = await db.query(
      `SELECT u.id, u.shop_id, s.name AS shop_name, s.address AS shop_address 
       FROM users u 
       LEFT JOIN shop s ON u.shop_id = s.id 
       WHERE u.id = ?`,
      [staffId]
    );

    if (!staff) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    if (!staff.shop_id) {
      return res.status(400).json({ message: 'Nhân viên chưa được gán cửa hàng' });
    }

    res.json({
      shop_id: staff.shop_id,
      shop_name: staff.shop_name || 'Unknown Shop',
      shop_address: staff.shop_address || 'Không có địa chỉ'
    });
  } catch (err) {
    console.error('getStaffProfile error:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy thông tin nhân viên' });
  }
};