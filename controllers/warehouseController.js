const db = require('../config/db');

exports.createWarehouse = async (req, res) => {
  const { name, shop_id } = req.body;

  try {
    const [existing] = await db.query('SELECT * FROM warehouse WHERE shop_id = ?', [shop_id]);

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Shop này đã có kho' });
    }

    await db.query('INSERT INTO warehouse (name, shop_id) VALUES (?, ?)', [name, shop_id]);
    res.status(201).json({ message: 'Tạo kho thành công' });
  } catch (err) {
    console.error('Lỗi tạo kho:', err);
    res.status(500).json({ message: 'Lỗi server khi tạo kho' });
  }
};

exports.getWarehouseById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM warehouse WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy kho' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Lỗi lấy kho:', err);
    res.status(500).json({ message: 'Không thể lấy kho' });
  }
};

exports.updateWarehouse = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    await db.query('UPDATE warehouse SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'Cập nhật kho thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật kho:', err);
    res.status(500).json({ message: 'Không thể cập nhật kho' });
  }
};

exports.deleteWarehouse = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM warehouse WHERE id = ?', [id]);
    res.json({ message: 'Xoá kho thành công' });
  } catch (err) {
    console.error('Lỗi xoá kho:', err);
    res.status(500).json({ message: 'Không thể xoá kho' });
  }
};

exports.getAllWarehouses = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT w.*, s.name AS shop_name 
      FROM warehouse w 
      JOIN shop s ON w.shop_id = s.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy danh sách kho:', err);
    res.status(500).json({ message: 'Lỗi truy vấn danh sách kho' });
  }
};

exports.getWarehousesByShop = async (req, res) => {
  const { shopId } = req.params;

  try {
    const [rows] = await db.query(`
      SELECT w.*, s.name AS shop_name 
      FROM warehouse w 
      JOIN shop s ON w.shop_id = s.id
      WHERE w.shop_id = ?
    `, [shopId]);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi lấy kho theo shop:', err);
    res.status(500).json({ message: 'Không thể lấy kho theo shop' });
  }
};
