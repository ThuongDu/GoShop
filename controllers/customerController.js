const db = require('../config/db');

exports.getAllCustomers = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM customer ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách khách hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

exports.createCustomer = async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ message: 'Vui lòng nhập tên và số điện thoại' });
  }

  try {
    await db.execute('INSERT INTO customer (name, phone) VALUES (?, ?)', [name, phone]);
    res.status(201).json({ message: 'Thêm khách hàng thành công' });
  } catch (err) {
    console.error('Lỗi khi thêm khách hàng:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: 'Số điện thoại đã tồn tại' });
    } else {
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
};

exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, phone } = req.body;

  try {
    await db.execute('UPDATE customer SET name = ?, phone = ? WHERE id = ?', [name, phone, id]);
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Lỗi khi cập nhật khách hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Xoá khách hàng
exports.deleteCustomer = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute('DELETE FROM customer WHERE id = ?', [id]);
    res.json({ message: 'Xoá khách hàng thành công' });
  } catch (err) {
    console.error('Lỗi khi xoá khách hàng:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};
