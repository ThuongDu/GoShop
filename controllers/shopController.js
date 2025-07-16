const db = require('../config/db');

const getRegionByProvince = (provinceName) => {
  const bacProvinces = [
    'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Hưng Yên', 'Vĩnh Phúc', 'Nam Định', 'Thái Bình', 'Hà Nam',
    'Ninh Bình', 'Phú Thọ', 'Thái Nguyên', 'Bắc Giang', 'Tuyên Quang', 'Cao Bằng', 'Lạng Sơn', 'Bắc Kạn', 'Hà Giang',
    'Lào Cai', 'Yên Bái', 'Sơn La', 'Hòa Bình', 'Điện Biên', 'Lai Châu'
  ];
  const trungProvinces = [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế', 'Đà Nẵng',
    'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận',
    'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'
  ];
  const namProvinces = [
    'Hồ Chí Minh', 'Cần Thơ', 'Bình Dương', 'Đồng Nai', 'Tây Ninh', 'Bà Rịa - Vũng Tàu',
    'Long An', 'Tiền Giang', 'Bến Tre', 'Vĩnh Long', 'Trà Vinh', 'Hậu Giang',
    'An Giang', 'Kiên Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'
  ];

  const cleanProvinceName = provinceName
    .replace(/^(Tỉnh|Thành phố|Thành Phố|TP)\s*/i, '')
    .trim();

  if (bacProvinces.includes(cleanProvinceName)) return 'bac';
  if (trungProvinces.includes(cleanProvinceName)) return 'trung';
  if (namProvinces.includes(cleanProvinceName)) return 'nam';
  return 'khac';
};



// Lấy tất cả shop
exports.getAllShops = async (req, res) => {
  try {
    const [result] = await db.query('SELECT * FROM shop ORDER BY id DESC');
    res.json(result);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách shop:', err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách shop' });
  }
};

// Lấy shop theo ID
exports.getShopById = async (req, res) => {
  try {
    const [result] = await db.query('SELECT * FROM shop WHERE id = ?', [req.params.id]);
    if (result.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy shop' });
    }
    res.json(result[0]);
  } catch (err) {
    console.error('Lỗi khi lấy thông tin shop:', err);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin shop' });
  }
};

// Tạo shop mới
exports.createShop = async (req, res) => {
  try {
    const { name, phone, status, province, district, ward, address_detail } = req.body;
    if (!name || !province || !district || !ward || !address_detail) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }
    console.log('===> Province nhận được:', province);
    const region = getRegionByProvince(province); 
    console.log('===> Region tính ra:', region);
    const fullAddress = `${address_detail}, ${ward}, ${district}, ${province}`;

    const [result] = await db.query(
      `INSERT INTO shop 
      (name, address, phone, region, status, province, district, ward, address_detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, fullAddress, phone, region, status || 'active', province, district, ward, address_detail]
    );

    res.status(201).json({
      id: result.insertId,
      name, address: fullAddress, phone, region, status: status || 'active',
      province, district, ward, address_detail
    });
  } catch (err) {
    console.error('Lỗi khi tạo shop mới:', err);
    res.status(500).json({ message: 'Lỗi khi tạo shop mới' });
  }
};

// Cập nhật shop
exports.updateShop = async (req, res) => {
  try {
    const { name, phone, status, province, district, ward, address_detail } = req.body;
    if (!name || !province || !district || !ward || !address_detail) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    const region = getRegionByProvince(province); 
    const fullAddress = `${address_detail}, ${ward}, ${district}, ${province}`;

    const [result] = await db.query(
      `UPDATE shop 
       SET name = ?, address = ?, phone = ?, region = ?, status = ?,
           province = ?, district = ?, ward = ?, address_detail = ?
       WHERE id = ?`,
      [name, fullAddress, phone, region, status || 'active', province, district, ward, address_detail, req.params.id]
    );

    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Lỗi khi cập nhật shop:', err);
    res.status(500).json({ message: 'Lỗi khi cập nhật shop' });
  }
};

exports.deleteShop = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM shop WHERE id = ?', [req.params.id]);
    res.json({ message: 'Xoá thành công' });
  } catch (err) {
    console.error('Lỗi khi xoá shop:', err);
    res.status(500).json({ message: 'Lỗi khi xoá shop' });
  }
};

exports.updateShop = async (req, res) => {
  try {
    const { name, phone, status, province, district, ward, address_detail } = req.body;
    const { id } = req.params;

    if (!name || !province || !district || !ward || !address_detail) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    console.log('=== Province nhận từ client:', province);
    const region = getRegionByProvince(province);
    console.log('=== Region tính ra:', region);

    const fullAddress = `${address_detail}, ${ward}, ${district}, ${province}`;

    const [result] = await db.query(
      `UPDATE shop 
       SET name=?, phone=?, status=?, region=?, province=?, district=?, ward=?, address_detail=?, address=?
       WHERE id=?`,
      [name, phone, status || 'active', region, province, district, ward, address_detail, fullAddress, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy shop để cập nhật' });
    }

    res.json({ message: '✅ Cập nhật shop thành công' });
  } catch (err) {
    console.error('Lỗi khi cập nhật shop:', err);
    res.status(500).json({ message: '❌ Lỗi server' });
  }
};