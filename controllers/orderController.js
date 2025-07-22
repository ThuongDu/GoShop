const db = require('../config/db');

exports.createOrder = async (req, res) => {
  const { customer_id, shop_id, warehouse_id, items } = req.body;
  const created_by = req.user.id;

  if (!customer_id || !shop_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc: customer_id, shop_id hoặc danh sách sản phẩm' });
  }

  for (const item of items) {
    if (!item.product_id || item.quantity == null || item.quantity <= 0) {
      return res.status(400).json({ message: 'Thông tin sản phẩm không hợp lệ: thiếu product_id hoặc quantity' });
    }
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    let total_price = 0;
    let tax = 0;

    for (const item of items) {
      const price = item.price || 0;
      const sale_price = item.sale_price !== undefined ? item.sale_price : null;
      const priceToUse = sale_price !== null ? sale_price : price;
      const quantity = Number(item.quantity) || 0;
      total_price += priceToUse * quantity;
    }

    const [customerRows] = await conn.execute(
      'SELECT * FROM customer WHERE id = ?',
      [customer_id]
    );
    const customer = customerRows[0];
    if (!customer) {
      throw new Error('Không tìm thấy khách hàng');
    }

    for (const item of items) {
      const [categoryRows] = await conn.execute(
        'SELECT * FROM category WHERE id = ?',
        [item.category_id]
      );
      const category = categoryRows[0];
      if (!category) {
        throw new Error(`Không tìm thấy danh mục cho sản phẩm ${item.product_id}`);
      }

      const price = item.price || 0;
      const sale_price = item.sale_price !== undefined ? item.sale_price : null;
      const priceToUse = sale_price !== null ? sale_price : price;
      const quantity = Number(item.quantity) || 0;
      
      const taxRate = category.name.toLowerCase().includes('đồ ăn') ? 0.08 : 0.1;
      tax += priceToUse * quantity * taxRate;
    }

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (customer_id, shop_id, total_price, tax, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [customer_id, shop_id, total_price, tax, created_by]
    );
    const order_id = orderResult.insertId;

    for (const item of items) {
      const [productRows] = await conn.execute(
        'SELECT * FROM product WHERE id = ?',
        [item.product_id]
      );
      const prod = productRows[0];
      if (!prod) {
        throw new Error(`Không tìm thấy sản phẩm với ID: ${item.product_id}`);
      }

      const price = item.price || 0;
      const sale_price = item.sale_price !== undefined ? item.sale_price : null;
      const priceToUse = sale_price !== null ? sale_price : price;
      const quantity = Number(item.quantity) || 0;
      const itemTotal = priceToUse * quantity;

      const params = [
        order_id,
        item.product_id,
        prod.code || '',
        prod.name || '',
        quantity,
        price,
        sale_price,
        itemTotal,
        prod.description || '',
        (prod.weight !== undefined && prod.weight !== null) ? prod.weight : null,
        prod.unit || '',
        prod.expiry_date || null,
        created_by
      ];

      if (params.some(p => p === undefined)) {
        throw new Error(`Dữ liệu sản phẩm không hợp lệ: có tham số undefined`);
      }

      await conn.execute(`
        INSERT INTO order_detail (
          order_id, product_id, product_code, product_name, 
          quantity, price, sale_price, total_price, 
          description, weight, unit, expiry_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      );
    }

    await conn.commit();
    res.status(201).json({ 
      success: true,
      message: 'Đã tạo đơn hàng thành công', 
      order_id,
      total_price,
      tax
    });
  } catch (error) {
    await conn.rollback();
    console.error('Lỗi createOrder:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi khi tạo đơn hàng', 
      error: error.message 
    });
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
    const { status, search } = req.query;

    let query = `
      SELECT 
        o.id, o.code, o.total_price, o.tax, o.status, o.payment_method, o.created_at,
        c.name AS customer_name, s.name AS shop_name, u.name AS created_by_name
      FROM orders o
      LEFT JOIN customer c ON o.customer_id = c.id
      LEFT JOIN shop s ON o.shop_id = s.id
      LEFT JOIN users u ON o.created_by = u.id
    `;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    if (search) {
      const keyword = `%${search}%`;
      conditions.push(`(o.code LIKE ? OR c.name LIKE ? OR s.name LIKE ? OR u.name LIKE ?)`); 
      params.push(keyword, keyword, keyword, keyword);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY o.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy danh sách đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};


exports.getOrderInfo = async (req, res) => {
  const { orderId } = req.params;
  try {
    const [[order]] = await db.query(`
      SELECT o.id, o.code, o.total_price, o.tax, o.status, o.created_at, 
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
    console.error('Lỗi getOrderInfo:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getOrderDetails = async (req, res) => {
  const { orderId } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT od.*, p.description, p.weight, p.unit, p.expiry_date, p.sale_price,
             pi.url AS image_url, u.name AS creator_name
      FROM order_detail od
      JOIN product p ON od.product_id = p.id
      LEFT JOIN product_image pi ON p.id = pi.product_id
      LEFT JOIN users u ON od.created_by = u.id
      WHERE od.order_id = ?`, [orderId]);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getOrderDetails:', err);
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
      SELECT 
        p.id, p.code, p.name, p.price, p.sale_price, 
        p.description, p.weight, p.unit, p.expiry_date,
        pi.url AS image_url,
        pq.quantity, pq.category_id, pq.warehouse_id, pq.shop_id, 
        c.name AS category_name
      FROM product_quantity pq
      JOIN product p ON pq.product_id = p.id
      JOIN category c ON pq.category_id = c.id
      LEFT JOIN product_image pi ON p.id = pi.product_id
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