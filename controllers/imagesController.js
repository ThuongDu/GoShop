const db = require('../config/db');

exports.addProductImage = async (req, res) => {
  const { name, url, product_id } = req.body;

  const sql = 'INSERT INTO product_image (name, url, product_id) VALUES (?, ?, ?)';
  try {
    const [result] = await db.query(sql, [name, url, product_id]);
    res.json({ message: 'Thêm ảnh thành công', id: result.insertId });
  } catch (err) {
    console.error('Lỗi thêm ảnh sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi khi thêm ảnh' });
  }
};

exports.updateProductImage = async (req, res) => {
  const id = req.params.id;
  const { name, url } = req.body;

  const sql = 'UPDATE product_image SET name = ?, url = ? WHERE id = ?';
  try {
    await db.query(sql, [name, url, id]);
    res.json({ message: 'Cập nhật ảnh thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật ảnh:', err);
    res.status(500).json({ message: 'Lỗi khi cập nhật ảnh' });
  }
};

exports.deleteProductImage = async (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM product_image WHERE id = ?';

  try {
    await db.query(sql, [id]);
    res.json({ message: 'Xoá ảnh thành công' });
  } catch (err) {
    console.error('Lỗi xoá ảnh:', err);
    res.status(500).json({ message: 'Lỗi khi xoá ảnh' });
  }
};

exports.getImagesByProductId = async (req, res) => {
  const productId = req.params.productId;
  const sql = 'SELECT * FROM product_image WHERE product_id = ? ORDER BY created_at DESC';

  try {
    const [results] = await db.query(sql, [productId]);
    res.json(results);
  } catch (err) {
    console.error('Lỗi lấy danh sách ảnh:', err);
    res.status(500).json({ message: 'Lỗi khi lấy ảnh' });
  }
};
