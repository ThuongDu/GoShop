const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploads');
const productImageController = require('../controllers/imagesController');
const auth = require('../middleware/auth');

router.post('/uploads', auth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Không có file nào được tải lên' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});
router.get('/:productId', auth, productImageController.getImagesByProductId);
router.post('/', auth, productImageController.addProductImage);
router.put('/:id', auth, productImageController.updateProductImage);
router.delete('/:id', auth, productImageController.deleteProductImage);

module.exports = router;
