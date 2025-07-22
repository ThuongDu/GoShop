const db = require('../config/db');

exports.createQuantity = async (req, res) => {
  const { product_id, image_id, category_id, warehouse_id, quantity } = req.body;
  const user_id = req.user.id;

  try {
    const [[warehouse]] = await db.query('SELECT shop_id FROM warehouse WHERE id = ?', [warehouse_id]);
    if (!warehouse) return res.status(400).json({ message: 'warehouse_id không hợp lệ' });
    const shop_id = warehouse.shop_id;

    const [[img]] = await db.query('SELECT id FROM product_image WHERE id = ?', [image_id]);
    if (!img) return res.status(400).json({ message: 'Ảnh không tồn tại' });

    const [[exist]] = await db.query(
      `SELECT id FROM product_quantity
       WHERE product_id=? AND image_id=? AND category_id=? AND warehouse_id=? AND shop_id=?`,
      [product_id, image_id, category_id, warehouse_id, shop_id]
    );

    if (exist) {
      await db.execute(
        `UPDATE product_quantity
         SET quantity = quantity + ?, updated_by=?, updated_at=NOW()
         WHERE product_id=? AND image_id=? AND category_id=? AND warehouse_id=? AND shop_id=?`,
        [quantity, user_id, product_id, image_id, category_id, warehouse_id, shop_id]
      );
      return res.json({ message: 'Cập nhật số lượng thành công (đã cộng dồn)' });
    }

    await db.execute(
      `INSERT INTO product_quantity
       (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, image_id, category_id, warehouse_id, shop_id, quantity, user_id, user_id]
    );

    res.status(201).json({ message: 'Thêm số lượng thành công' });
  } catch (err) {
    console.error('Lỗi thêm số lượng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getAllQuantities = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pq.id, p.name AS product_name, p.code AS product_code,
             s.name AS shop_name, c.name AS category_name, w.name AS warehouse_name,
             pi.url AS image_url, pq.quantity, pq.created_at
      FROM product_quantity pq
      INNER JOIN product p ON pq.product_id = p.id
      INNER JOIN shop s ON pq.shop_id = s.id
      INNER JOIN category c ON pq.category_id = c.id
      INNER JOIN warehouse w ON pq.warehouse_id = w.id
      INNER JOIN product_image pi ON pq.image_id = pi.id
      ORDER BY pq.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getAllQuantities:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getMyQuantities = async (req, res) => {
  const user_id = req.user.id;
  try {
    const [[staff]] = await db.query('SELECT shop_id FROM staff WHERE id=?', [user_id]);
    if (!staff?.shop_id) return res.status(404).json({ message: 'Không tìm thấy shop của staff' });

    const [rows] = await db.query(`
      SELECT pq.id, p.name AS product_name, p.code AS product_code,
             pi.url AS image_url, c.name AS category_name, w.name AS warehouse_name,
             pq.quantity, pq.created_at
      FROM product_quantity pq
      INNER JOIN product p ON pq.product_id = p.id
      INNER JOIN product_image pi ON pq.image_id = pi.id
      INNER JOIN category c ON pq.category_id = c.id
      INNER JOIN warehouse w ON pq.warehouse_id = w.id
      WHERE pq.shop_id = ?
      ORDER BY pq.created_at DESC
    `, [staff.shop_id]);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getMyQuantities:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getQuantitiesGroupByProduct = async (req, res) => {
  const { warehouseId } = req.query;
  if (!warehouseId) return res.status(400).json({ message: 'Thiếu warehouseId' });

  try {
    const [rows] = await db.query(`
      SELECT 
        pq.product_id,
        p.name AS product_name,
        p.code AS product_code,
        w.name AS warehouse_name,
        pi.url AS image_url,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS category_names,
        SUM(pq.quantity) AS total_quantity
      FROM product_quantity pq
      INNER JOIN product p ON pq.product_id = p.id
      INNER JOIN warehouse w ON pq.warehouse_id = w.id
      INNER JOIN category c ON pq.category_id = c.id
      INNER JOIN product_image pi ON pq.image_id = pi.id
      WHERE pq.warehouse_id = ?
      GROUP BY pq.product_id, w.name, p.name, p.code, pi.url
      ORDER BY p.name ASC
    `, [warehouseId]);

    res.json(rows);
  } catch (err) {
    console.error('Lỗi getQuantitiesGroupByProduct:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getQuantitiesByWarehouse = async (req, res) => {
  const { warehouseId } = req.query;
  if (!warehouseId) return res.status(400).json({ message: 'Thiếu warehouseId' });

  try {
    const [rows] = await db.query(`
      SELECT pq.id, p.name AS product_name, p.code AS product_code,
             c.name AS category_name, pi.url AS image_url, w.name AS warehouse_name,
             pq.quantity, pq.created_at
      FROM product_quantity pq
      INNER JOIN product p ON pq.product_id = p.id
      INNER JOIN product_image pi ON pq.image_id = pi.id
      INNER JOIN category c ON pq.category_id = c.id
      INNER JOIN warehouse w ON pq.warehouse_id = w.id
      WHERE pq.warehouse_id = ?
      GROUP BY pq.id, p.name, p.code, w.name, pq.quantity, pq.created_at
      ORDER BY pq.created_at DESC
    `, [warehouseId]);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getQuantitiesByWarehouse:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.addManyProductToWarehouse = async (req, res) => {
  const { warehouse_id, product_ids, category_ids } = req.body;
  const user_id = req.user.id;

  try {
    const [[warehouse]] = await db.query('SELECT shop_id FROM warehouse WHERE id=?', [warehouse_id]);
    if (!warehouse) return res.status(400).json({ message: 'warehouse_id không hợp lệ' });
    const shop_id = warehouse.shop_id;

    for (const product_id of product_ids) {
      for (const category_id of category_ids) {
        const [[existPC]] = await db.query(
          'SELECT 1 FROM product_category WHERE product_id=? AND category_id=?',
          [product_id, category_id]
        );
        if (!existPC) {
          await db.query(
            'INSERT INTO product_category (product_id, category_id, created_by) VALUES (?, ?, ?)',
            [product_id, category_id, user_id]
          );
        }

        const [[image]] = await db.query(
          'SELECT id FROM product_image WHERE product_id=? LIMIT 1', 
          [product_id]
        );
        if (!image) continue;

        const [[existPQ]] = await db.query(
          `SELECT id FROM product_quantity
           WHERE product_id=? AND category_id=? AND warehouse_id=? AND shop_id=?`,
          [product_id, category_id, warehouse_id, shop_id]
        );
        if (existPQ) continue;

        await db.execute(
          `INSERT INTO product_quantity
           (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [product_id, image.id, category_id, warehouse_id, shop_id, 0, user_id, user_id]
        );
      }
    }

    res.json({ message: '✅ Đã thêm nhiều sản phẩm vào kho + danh mục thành công!' });
  } catch (err) {
    console.error('Lỗi addManyProductToWarehouse:', err);
    res.status(500).json({ message: '❌ Lỗi server' });
  }
};

exports.getProductsByShopWarehouse = async (req, res) => {
  const { shopId, warehouseId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT pq.id, pq.product_id, p.name, p.price, pq.quantity, pq.category_id,
              pq.warehouse_id, pq.shop_id, c.name AS category_name
       FROM product_quantity pq
       INNER JOIN product p ON pq.product_id = p.id
       INNER JOIN category c ON pq.category_id = c.id
       WHERE pq.shop_id=? AND pq.warehouse_id=?`,
      [shopId, warehouseId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getProductsByShopWarehouse:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm' });
  }
};

exports.deleteQuantity = async (req, res) => {
  const { id } = req.params;
  try {
    const [[item]] = await db.query('SELECT quantity FROM product_quantity WHERE id=?', [id]);
    if (!item) return res.status(404).json({ message: 'Không tìm thấy item để xoá' });
    if (item.quantity > 0) return res.status(400).json({ message: 'Không thể xoá vì số lượng > 0' });

    const [result] = await db.query('DELETE FROM product_quantity WHERE id=?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Không tìm thấy item để xoá' });

    res.json({ message: 'Xoá thành công' });
  } catch (err) {
    console.error('Lỗi deleteQuantity:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.updateQuantity = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const user_id = req.user.id;

  if (quantity == null || quantity < 0) {
    return res.status(400).json({ message: 'Giá trị quantity không hợp lệ' });
  }

  try {
    const [result] = await db.query(
      `UPDATE product_quantity
       SET quantity=?, updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [quantity, user_id, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy item để cập nhật' });
    }
    res.json({ message: 'Cập nhật số lượng thành công' });
  } catch (err) {
    console.error('Lỗi updateQuantity:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getCurrentQuantities = async (req, res) => {
  const { warehouseId, productIds } = req.query;
  if (!warehouseId || !productIds) return res.status(400).json({ message: 'Thiếu warehouseId hoặc productIds' });

  const ids = productIds.split(',').map(Number).filter(Boolean);
  if (!ids.length) return res.json({});

  try {
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT product_id, SUM(quantity) AS total
       FROM product_quantity
       WHERE warehouse_id=? AND product_id IN (${placeholders})
       GROUP BY product_id`,
      [warehouseId, ...ids]
    );
    const result = {};
    rows.forEach(r => result[r.product_id] = r.total);
    res.json(result);
  } catch (err) {
    console.error('Lỗi getCurrentQuantities:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.addQuantityByStaff = async (req, res) => {
  const { product_id, image_id, category_id, warehouse_id, quantity } = req.body;
  const created_by = req.user.id;

  try {
    const [[wh]] = await db.query(
      "SELECT id FROM warehouse WHERE id=? AND shop_id=?", 
      [warehouse_id, req.user.shop_id]
    );
    if (!wh) return res.status(403).json({ message: "Access denied" });

    await db.query(
      `INSERT INTO product_quantity
       (product_id, image_id, category_id, warehouse_id, shop_id, quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, image_id, category_id, warehouse_id, req.user.shop_id, quantity, created_by, created_by]
    );
    res.json({ message: "OK" });
  } catch (err) {
    console.error('Lỗi addQuantityByStaff:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.getMyShopQuantities = async (req, res) => {
  try {
    let shop_id = req.query.shopId;
    if (!shop_id) shop_id = req.user.shop_id; 
    if (!shop_id) return res.status(400).json({ message: 'Thiếu shop_id' });

    const [rows] = await db.query(
      `SELECT pq.id, p.code AS product_code, p.name AS product_name,
              pi.url AS image_url, c.name AS category_name, w.name AS warehouse_name,
              pq.quantity, pq.updated_at
       FROM product_quantity pq
       INNER JOIN product p ON pq.product_id = p.id
       INNER JOIN product_image pi ON pq.image_id = pi.id
       INNER JOIN category c ON pq.category_id = c.id
       INNER JOIN warehouse w ON pq.warehouse_id = w.id
       WHERE pq.shop_id=?
       ORDER BY w.name, c.name, p.name`,
      [shop_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi getMyShopQuantities:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};