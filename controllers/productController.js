const db = require('../config/db');
const path = require('path');

const generateRandomNumber = (length) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

exports.createProductWithImage = async (req, res) => {
  try {
    const { 
      name, 
      price, 
      created_by, 
      updated_by,
      description, 
      weight, 
      unit, 
      sale_price,
      expiry_date
    } = req.body;
    const image = req.file;

    if (!name || !price || !created_by || !updated_by || !image) {
      return res.status(400).json({ message: 'Thiếu thông tin sản phẩm hoặc ảnh' });
    }

    let code;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      code = generateRandomNumber(11);
      
      const [[existingProduct]] = await db.query(
        'SELECT id FROM product WHERE code = ? LIMIT 1',
        [code]
      );
      
      if (!existingProduct) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ message: 'Không thể tạo mã sản phẩm duy nhất' });
    }

    const [productResult] = await db.query(
      `INSERT INTO product 
       (name, price, created_by, updated_by, description, weight, unit, sale_price, expiry_date, code) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, price, created_by, updated_by, description || null, weight || null, unit || null, sale_price || null, expiry_date || null, code]
    );
    
    const productId = productResult.insertId;
    
    const imageUrl = `uploads/${image.filename}`;
    await db.query(
      'INSERT INTO product_image (url, product_id) VALUES (?, ?)',
      [imageUrl, productId]
    );

    res.status(201).json({
      message: 'Thêm sản phẩm thành công',
      productId,
      code,
      imageUrl,
    });
  } catch (err) {
    console.error('Lỗi khi thêm sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi thêm sản phẩm' });
  }
};


exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const [[product]] = await db.query(`
      SELECT 
        p.*, 
        u.name AS nameCreated,
        CASE 
          WHEN p.sale_price IS NOT NULL AND p.sale_price > 0 THEN p.sale_price
          ELSE p.price
        END AS display_price
      FROM product p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `, [id]);

    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    const [images] = await db.query(
      'SELECT id, url FROM product_image WHERE product_id = ?',
      [id]
    );
    product.images = images;

    res.json(product);
  } catch (err) {
    console.error('Lỗi khi lấy chi tiết sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy chi tiết sản phẩm' });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const [products] = await db.query(
      `
      SELECT 
        p.id, p.name, p.price, 
        pi.id AS image_id, pi.url
      FROM product p
      JOIN product_category pc ON p.id = pc.product_id
      LEFT JOIN product_image pi ON p.id = pi.product_id
      WHERE pc.category_id = ?
      GROUP BY p.id
      `,
      [categoryId]
    );

    res.json(products);
  } catch (err) {
    console.error('Lỗi khi lấy sản phẩm theo danh mục:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm theo danh mục' });
  }
};


exports.getAllProducts = async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT 
        p.*, 
        u.name AS nameCreated
      FROM product p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `);

    for (const product of products) {
      const [images] = await db.query(
        'SELECT id, url FROM product_image WHERE product_id = ?',
        [product.id]
      );
      product.images = images;
    }

    res.json(products);
  } catch (err) {
    console.error('Lỗi khi lấy sản phẩm:', err.message || err);
    res.status(500).json({ message: 'Lỗi server' });
  }
};


exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      price, 
      updated_by,
      description, 
      weight, 
      unit, 
      sale_price,
      expiry_date 
    } = req.body;

    if (!name || !price || !updated_by) {
      return res.status(400).json({ message: 'Thiếu thông tin cập nhật' });
    }

    const [result] = await db.query(
      `UPDATE product SET 
        name = ?, 
        price = ?, 
        updated_by = ?,
        description = ?,
        weight = ?,
        unit = ?,
        sale_price = ?,
        expiry_date = ?
       WHERE id = ?`,
      [name, price, updated_by, description || null, weight || null, unit || null, sale_price || null, expiry_date || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm để cập nhật' });
    }

    res.json({ message: 'Cập nhật sản phẩm thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi cập nhật sản phẩm' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query('DELETE FROM product_image WHERE product_id = ?', [id]);
    await db.query('DELETE FROM product_category WHERE product_id = ?', [id]);

    const [result] = await db.query('DELETE FROM product WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm để xoá' });
    }

    res.json({ message: 'Xoá sản phẩm thành công' });
  } catch (err) {
    console.error('Lỗi khi xoá sản phẩm:', err);
    res.status(500).json({ message: 'Lỗi server khi xoá sản phẩm' });
  }
};

exports.getCategoriesByProduct = async (req,res)=>{
  const { id } = req.params;
  const [rows] = await db.query(`
    SELECT c.id, c.name
    FROM product_quantity pq
    JOIN category c ON pq.category_id = c.id
    WHERE pq.product_id = ? GROUP BY c.id`, [id]);
  res.json(rows);
};
exports.getProductsByStaff = async (req, res) => {
  try {
    const staffId = req.user.id;

    // Lấy shop_id của staff
    const [[staffShop]] = await db.query(
      'SELECT shop_id FROM users WHERE id = ?', [staffId]
    );
    if (!staffShop) return res.status(400).json({ message: 'Staff chưa gắn shop' });

    const shopId = staffShop.shop_id;

    const [products] = await db.query(`
      SELECT DISTINCT p.id, p.name, p.price, p.code, p.created_at,
        (SELECT url FROM product_image WHERE product_id = p.id LIMIT 1) AS image_url
      FROM product p
      JOIN product_quantity pq ON p.id = pq.product_id
      WHERE pq.shop_id = ?
      ORDER BY p.created_at DESC
    `, [shopId]);

    res.json(products);
  } catch (err) {
    console.error('Lỗi getProductsByStaff:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
