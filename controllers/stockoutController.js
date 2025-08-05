const db = require('../config/db');

exports.createStockOut = async (req, res) => {
  const { product_id, quantity, warehouse_id, reason } = req.body;
  const created_by = req.user?.id; // Lấy từ authMiddleware

  // Kiểm tra các trường bắt buộc
  if (!product_id || !quantity || !warehouse_id) {
    return res.status(400).json({ message: 'Vui lòng cung cấp product_id, quantity và warehouse_id' });
  }

  if (quantity <= 0) {
    return res.status(400).json({ message: 'Số lượng xuất kho phải lớn hơn 0' });
  }

  if (!created_by) {
    return res.status(401).json({ message: 'Không tìm thấy thông tin người dùng từ token' });
  }

  try {
    // Kiểm tra product_id và warehouse_id tồn tại
    const [[productExists]] = await db.query(`SELECT 1 FROM products WHERE id = ?`, [product_id]);
    const [[warehouseExists]] = await db.query(`SELECT shop_id FROM warehouse WHERE id = ?`, [warehouse_id]);
    const [[userExists]] = await db.query(`SELECT 1 FROM users WHERE id = ?`, [created_by]);

    if (!productExists) {
      return res.status(400).json({ message: 'Sản phẩm không tồn tại' });
    }
    if (!warehouseExists) {
      return res.status(400).json({ message: 'Kho không tồn tại' });
    }
    if (!userExists) {
      return res.status(400).json({ message: 'Người dùng không tồn tại' });
    }

    const shop_id = warehouseExists.shop_id;

    // Kiểm tra số lượng tồn kho (tổng hợp quantity bất kể expiry_date)
    const [[currentQuantity]] = await db.query(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity 
       FROM product_quantity 
       WHERE product_id = ? AND warehouse_id = ? AND shop_id = ? AND quantity > 0 
       AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
      [product_id, warehouse_id, shop_id]
    );

    if (currentQuantity.quantity < quantity) {
      return res.status(400).json({ message: 'Số lượng tồn kho không đủ để xuất' });
    }

    // Bắt đầu transaction
    await db.query('START TRANSACTION');

    try {
      // Tạo bản ghi xuất kho
      await db.query(
        `INSERT INTO stock_out (product_id, quantity, reason, created_at, created_by)
         VALUES (?, ?, ?, NOW(), ?)`,
        [product_id, quantity, reason || '', created_by]
      );

      // Cập nhật số lượng tồn kho (giảm tổng quantity)
      await db.query(
        `UPDATE product_quantity 
         SET quantity = quantity - ? 
         WHERE product_id = ? AND warehouse_id = ? AND shop_id = ? 
         AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
        [quantity, product_id, warehouse_id, shop_id]
      );

      // Commit transaction
      await db.query('COMMIT');

      res.status(201).json({ message: 'Xuất kho thành công' });
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('Lỗi trong transaction:', err);
      res.status(500).json({ message: 'Lỗi server khi xuất kho', error: err.message });
    }
  } catch (err) {
    console.error('Lỗi createStockOut:', err);
    res.status(500).json({ message: 'Lỗi server khi xuất kho', error: err.message });
  }
};