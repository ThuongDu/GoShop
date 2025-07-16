const db = require('../config/db');

exports.getCategoriesByWarehouse = async (req, res) => {
  const warehouseId = req.params.warehouseId;

  const sql = `
    SELECT category.*, warehouse.name AS warehouse_name 
    FROM category 
    JOIN warehouse ON category.warehouse_id = warehouse.id
    WHERE category.warehouse_id = ?
  `;

  try {
    const [results] = await db.query(sql, [warehouseId]);
    res.json(results);
  } catch (err) {
    console.error('Lỗi lấy danh mục:', err);
    res.status(500).json({ message: 'Lỗi lấy danh mục theo kho' });
  }
};

exports.getCategoriesByProduct = async (req, res) => {
  const productId = req.params.productId;

  const sql = `
    SELECT c.*, p.name AS product_name
    FROM category c
    JOIN product p ON c.id = p.category_id
    WHERE p.id = ?
  `;

  try {
    const [results] = await db.query(sql, [productId]);
    res.json(results);
  } catch (err) {
    console.error('Lỗi lấy danh mục theo sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi truy vấn danh mục theo sản phẩm' });
  }
};

exports.createCategory = async (req, res) => {
  const { name, warehouse_id } = req.body;

  if (!name || !warehouse_id) {
    return res.status(400).json({ message: 'Thiếu thông tin' });
  }

  const sql = `INSERT INTO category (name, warehouse_id) VALUES (?, ?)`;

  try {
    const [result] = await db.query(sql, [name, warehouse_id]);
    res.json({ id: result.insertId, name, warehouse_id });
  } catch (err) {
    console.error('Lỗi thêm danh mục:', err);
    res.status(500).json({ message: 'Lỗi thêm danh mục' });
  }
};

exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, warehouse_id } = req.body;

  const sql = `UPDATE category SET name = ?, warehouse_id = ? WHERE id = ?`;

  try {
    const [result] = await db.query(sql, [name, warehouse_id, id]);
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật danh mục:', err);
    res.status(500).json({ message: 'Lỗi cập nhật' });
  }
};

exports.deleteCategory = async (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM category WHERE id = ?`;

  try {
    const [result] = await db.query(sql, [id]);
    res.json({ message: 'Xoá thành công' });
  } catch (err) {
    console.error('Lỗi xoá danh mục:', err);
    res.status(500).json({ message: 'Lỗi xoá danh mục' });
  }
};

exports.getCategoryById = async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.query(`SELECT * FROM category WHERE id = ?`, [id]);
    if (results.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }
    res.json(results[0]);  // trả về object thay vì array
  } catch (err) {
    console.error('Lỗi lấy chi tiết danh mục:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};