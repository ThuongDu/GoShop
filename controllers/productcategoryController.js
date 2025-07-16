const db = require('../config/db');

exports.getProductsByCategory = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const [products] = await db.query(`
      SELECT 
        p.id, p.name, p.price, p.code, p.created_at
      FROM product p
      JOIN product_category pc ON p.id = pc.product_id
      WHERE pc.category_id = ?
    `, [categoryId]);

    for (let product of products) {
      const [images] = await db.query(`
        SELECT id, url
        FROM product_image
        WHERE product_id = ?
    `, [product.id]);

      product.images = images;
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
};
