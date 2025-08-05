const db = require('../config/db');

exports.createOrder = async (req, res) => {
  const { customer_id, shop_id, warehouse_id, items, payment_method, total } = req.body;
  const userId = req.user?.id;

  console.log('Received request to create order:', { customer_id, shop_id, warehouse_id, items, payment_method, total });

  if (!userId) {
    return res.status(401).json({ message: 'Không tìm thấy thông tin người dùng' });
  }
  if (!customer_id || !shop_id || !warehouse_id || !items || items.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
  }
  if (!['tiền mặt', 'chuyển khoản'].includes(payment_method)) {
    return res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Kiểm tra và lọc các sản phẩm hợp lệ trước khi thêm
    const validItems = [];
    for (const item of items) {
      const [rows] = await connection.query(
        `SELECT quantity, expiry_date FROM product_quantity WHERE product_id = ? AND shop_id = ? AND warehouse_id = ?`,
        [item.product_id, shop_id, warehouse_id]
      );
      console.log(`Checking product ${item.product_id}:`, rows);

      if (!rows || rows.length === 0) {
        console.warn(`Sản phẩm ${item.product_name || item.product_id} không tồn tại trong kho, bỏ qua.`);
        continue; // Bỏ qua sản phẩm không tồn tại thay vì rollback
      }

      const now = new Date();
      const availableQuantity = rows
        .filter(row => !row.expiry_date || new Date(row.expiry_date) >= now)
        .reduce((sum, row) => sum + row.quantity, 0);

      if (availableQuantity < item.quantity) {
        console.warn(`Sản phẩm ${item.product_name || item.product_id} không đủ số lượng (còn: ${availableQuantity}), bỏ qua.`);
        continue; // Bỏ qua sản phẩm không đủ số lượng
      }

      if (item.expiry_date && new Date(item.expiry_date) < now) {
        console.warn(`Lô sản phẩm ${item.product_name || item.product_id} đã hết hạn, bỏ qua.`);
        continue; // Bỏ qua lô hàng hết hạn
      }

      if (!item.price || item.price < 0) {
        console.warn(`Sản phẩm ${item.product_name || item.product_id} có giá không hợp lệ: ${item.price}, bỏ qua.`);
        continue; // Bỏ qua sản phẩm có giá không hợp lệ
      }

      validItems.push(item);
    }

    if (validItems.length === 0) {
      throw new Error('Không có sản phẩm nào hợp lệ để tạo đơn hàng.');
    }

    // Tạo mã đơn hàng duy nhất
    let orderCode;
    let orderResult;
    do {
      orderCode = `ORD${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      [orderResult] = await connection.query(
        `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, payment_method, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [orderCode, customer_id, shop_id, 0, 0.00, payment_method, userId] // Tổng và thuế tạm thời, sẽ cập nhật sau
      );
      console.log('Inserted order with code:', orderCode, 'result:', orderResult);
    } while (!orderResult.insertId);

    const orderId = orderResult.insertId;

    // Thêm chi tiết đơn hàng và cập nhật tồn kho
    let orderTotal = 0;
    for (const item of validItems) {
      const [productRows] = await connection.query(
        `SELECT code, name FROM product WHERE id = ?`,
        [item.product_id]
      );
      const { code: product_code, name: product_name } = productRows[0] || { code: 'N/A', name: 'Unknown' };

      const itemTotalPrice = item.price * item.quantity;
        orderTotal += itemTotalPrice;
      const [detailResult] = await connection.query(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, total_price, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [orderId, item.product_id, product_code, product_name, item.quantity, itemTotalPrice, userId || null]
      );
      console.log(`Inserted order_detail for order_id ${orderId}, product_id ${item.product_id}, result:`, detailResult);

      let qtyToDeduct = item.quantity;

      const [stockRows] = await connection.query(
        `SELECT id, quantity
        FROM product_quantity
        WHERE product_id = ? AND shop_id = ? AND warehouse_id = ? AND quantity > 0
          AND (expiry_date IS NULL OR expiry_date >= NOW())
        ORDER BY 
          CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
          expiry_date ASC`,
        [item.product_id, shop_id, warehouse_id]
      );

      for (const row of stockRows) {
        if (qtyToDeduct <= 0) break;

        const deductQty = Math.min(qtyToDeduct, row.quantity);

        await connection.query(
          `UPDATE product_quantity SET quantity = quantity - ? WHERE id = ?`,
          [deductQty, row.id]
        );

        qtyToDeduct -= deductQty;
      }

      if (qtyToDeduct > 0) {
        throw new Error(`Không đủ số lượng tồn kho cho sản phẩm ID ${item.product_id}`);
      }
    }

    // Tính thuế (8% của orderTotal) và cập nhật tổng tiền
    const tax = orderTotal * 0.08;
    const totalWithTax = orderTotal + tax;

    if (Math.abs(orderTotal - total) > 0.01 || Math.abs(tax - 0.00) > 0.01) {
      await connection.query(
        `UPDATE orders SET total_price = ?, tax = ? WHERE id = ?`,
        [totalWithTax, tax, orderId]
      );
      console.log(`Updated total_price to ${totalWithTax} and tax to ${tax} for order_id ${orderId}`);
    }

    await connection.commit();
    console.log('Transaction committed for order:', orderCode);
    res.status(201).json({ code: orderCode, message: 'Tạo đơn hàng thành công' });
  } catch (err) {
    await connection.rollback();
    console.error('Lỗi tạo đơn hàng:', err);
    res.status(500).json({ message: err.message || 'Lỗi server khi tạo đơn hàng' });
  } finally {
    connection.release();
  }
};

exports.createCustomerIfNotExists = async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ message: 'Thiếu thông tin khách hàng' });

  try {
    const [[existing]] = await db.query('SELECT id FROM customer WHERE phone = ?', [phone]);
    if (existing) {
      return res.json({ message: 'Khách hàng đã tồn tại', customer_id: existing.id });
    }
    const [result] = await db.query('INSERT INTO customer (name, phone) VALUES (?, ?)', [name, phone]);
    res.status(201).json({ message: 'Tạo khách hàng thành công', customer_id: result.insertId });
  } catch (err) {
    console.error('Lỗi tạo khách hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getProductsByShopWarehouse = async (req, res) => {
  const { shopId, warehouseId } = req.params;
  try {
    const [products] = await db.query(
      `SELECT 
         p.id AS product_id, 
         p.code, 
         p.name, 
         p.price, 
         p.sale_price, 
         p.weight, 
         p.unit, 
         pq.expiry_date,
         pq.quantity, 
         pq.category_id, 
         c.name AS category_name
       FROM product p
       JOIN product_quantity pq ON p.id = pq.product_id
       JOIN category c ON pq.category_id = c.id
       WHERE pq.shop_id = ? AND pq.warehouse_id = ? 
         AND (pq.expiry_date IS NULL OR pq.expiry_date >= NOW()) 
         AND pq.quantity > 0`,
      [shopId, warehouseId]
    );

    for (const product of products) {
      const [images] = await db.query(
        'SELECT id, url FROM product_image WHERE product_id = ?',
        [product.product_id]
      );
      product.images = images || [];
    }

    res.json(products);
  } catch (err) {
    console.error('Lỗi lấy sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm' });
  }
};

exports.getAllShops = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name FROM shop WHERE status = ?', ['active']);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy danh sách cửa hàng:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách cửa hàng' });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { status, shop_id, search, start_date, end_date } = req.query;
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
    const conditions = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (shop_id) {
      conditions.push('o.shop_id = ?');
      params.push(shop_id);
    }
    if (search) {
      conditions.push('(o.code LIKE ? OR c.name LIKE ? OR u.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (start_date) {
      conditions.push('o.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('o.created_at <= ?');
      params.push(`${end_date} 23:59:59`);
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

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const user = req.user;

  const validStatuses = ['đang xử lý', 'chờ lấy hàng', 'thành công'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
  }

  try {
    if (user.role === 'staff') {
      const [[check]] = await db.query('SELECT id FROM orders WHERE id = ? AND shop_id = ?', [orderId, user.shop_id]);
      if (!check) return res.status(403).json({ message: 'Access denied' });
    }

    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
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
    const [rows] = await db.query(
      `SELECT 
         o.code AS order_code, 
         od.product_code, 
         od.product_name, 
         od.quantity, 
         od.total_price, 
         od.created_at, 
         od.created_by,
         p.weight,
         p.unit
       FROM order_detail od
       JOIN orders o ON od.order_id = o.id
       JOIN product p ON od.product_id = p.id
       WHERE od.order_id = ?`,
      [orderId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getProductsByShopWarehouseCategory = async (req, res) => {
  const { shopId, warehouseId, categoryId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.code, p.name, p.price, pq.quantity, pq.category_id, pq.warehouse_id, pq.shop_id, c.name AS category_name, pq.expiry_date
       FROM product p
       JOIN product_quantity pq ON p.id = pq.product_id
       JOIN category c ON pq.category_id = c.id
       WHERE pq.shop_id = ? AND pq.warehouse_id = ? AND pq.category_id = ? AND pq.quantity > 0`,
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
    const [[order]] = await db.query(
      `SELECT o.id, o.code, o.total_price, o.tax, o.status, o.created_at, o.created_by,
              c.name AS customer_name, s.name AS shop_name
       FROM orders o
       LEFT JOIN customer c ON o.customer_id = c.id
       LEFT JOIN shop s ON o.shop_id = s.id
       WHERE o.id = ?`,
      [orderId]
    );
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.json(order);
  } catch (err) {
    console.error('Lỗi lấy thông tin đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
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
    // Validate staff and shop
    const [[staff]] = await conn.query('SELECT shop_id FROM users WHERE id = ?', [created_by]);
    if (!staff || !staff.shop_id) {
      throw new Error('Nhân viên chưa được gán cửa hàng');
    }
    const shop_id = staff.shop_id;

    // Validate customer
    const [[customer]] = await conn.query('SELECT id FROM customer WHERE id = ?', [customer_id]);
    if (!customer) {
      throw new Error('Khách hàng không tồn tại');
    }

    // Validate items
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

    // Calculate totals
    const total_price = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const tax = Math.round(total_price * 0.08);
    const grandTotal = total_price + tax;

    // Generate unique order code
    const [[{ count }]] = await conn.query(`SELECT COUNT(*) AS count FROM orders WHERE shop_id = ?`, [shop_id]);
    const code = `ORD${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Insert order
    const [orderResult] = await conn.query(
      `INSERT INTO orders (code, customer_id, shop_id, total_price, tax, payment_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, customer_id, shop_id, grandTotal, tax, payment_method, created_by]
    );
    const order_id = orderResult.insertId;

    // Insert order details and update inventory
    for (const item of items) {
      const itemTotal = Number(item.price) * item.quantity;
      const [[prod]] = await conn.query(`SELECT code, name FROM product WHERE id = ?`, [item.product_id]);

      await conn.query(
        `INSERT INTO order_detail (order_id, product_id, product_code, product_name, quantity, total_price, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [order_id, item.product_id, prod?.code || item.product_code, prod?.name || item.product_name, item.quantity, itemTotal, created_by]
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

exports.addQuantityByStaff = async (req, res) => {
  const { product_id, image_id, category_id, warehouse_id, quantity } = req.body;
  const created_by = req.user?.id;
  const user_shop_id = req.user?.shop_id;

  if (!product_id || !image_id || !category_id || !warehouse_id || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Thiếu thông tin hoặc số lượng không hợp lệ' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT 1 FROM warehouse WHERE id = ? AND shop_id = ?',
      [warehouse_id, user_shop_id]
    );
    if (rows.length === 0) {
      return res.status(403).json({ message: 'Kho không thuộc cửa hàng của bạn' });
    }

    await db.execute(
      `INSERT INTO product_quantity (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by, created_at, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + ?, updated_at = NOW(), updated_by = ?, expiry_date = ?`,
      [product_id, image_id, category_id, warehouse_id, user_shop_id, quantity, created_by, null, quantity, created_by, null]
    );

    res.json({ message: 'Thêm số lượng thành công' });
  } catch (err) {
    console.error('addQuantityByStaff error:', err);
    res.status(500).json({ message: 'Lỗi server khi thêm số lượng' });
  }
};