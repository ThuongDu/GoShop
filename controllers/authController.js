const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function authController(db) {
  return {
    register: async (req, res) => {
      const { name, phone, password, role, shop_id } = req.body;

      if (!name || !phone || !password || !role) {
        return res.status(400).json({ message: "Thiếu thông tin!" });
      }

      if (role === "staff" && !shop_id) {
        return res.status(400).json({ message: "Nhân viên phải chọn cửa hàng!" });
      }

      try {
        const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing.length > 0) {
          return res.status(400).json({ message: "Số điện thoại đã được sử dụng!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const query = role === "staff"
          ? "INSERT INTO users (name, phone, password, role, shop_id) VALUES (?, ?, ?, ?, ?)"
          : "INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, ?)";

        const values = role === "staff"
          ? [name, phone, hashedPassword, role, shop_id]
          : [name, phone, hashedPassword, role];

        const [result] = await db.query(query, values);

        const userId = result.insertId;
        const userData = {
          id: userId,
          name,
          phone,
          role,
          shop_id: role === "staff" ? shop_id : null,
        };

        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.json({
          message: "Đăng ký thành công!",
          token,
          user: userData,
        });
      } catch (err) {
        console.error("Đăng ký lỗi:", err);
        res.status(500).json({ message: "Lỗi server!" });
      }
    },

    login: async (req, res) => {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ message: "Thiếu thông tin!" });
      }

      try {
        const [results] = await db.query("SELECT * FROM users WHERE phone = ? LIMIT 1", [phone]);
        if (results.length === 0) {
          return res.status(401).json({ message: "Số điện thoại không tồn tại!" });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ message: "Mật khẩu không đúng!" });
        }

        const token = jwt.sign({
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          shop_id: user.shop_id,
        }, process.env.JWT_SECRET, { expiresIn: "1d" });

        res.json({
          message: "Đăng nhập thành công!",
          token,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role,
            shop_id: user.shop_id,
          },
        });
      } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },

    forgotPassword: async (req, res) => {
      const { phone, newPassword } = req.body;
      if (!phone || !newPassword) {
        return res.status(400).json({ message: "Vui lòng nhập số điện thoại và mật khẩu mới!" });
      }

      try {
        const [results] = await db.query("SELECT id FROM users WHERE phone = ? LIMIT 1", [phone]);
        if (results.length === 0) {
          return res.status(404).json({ message: "Số điện thoại không tồn tại!" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE users SET password = ? WHERE phone = ?", [hashedPassword, phone]);

        res.json({ message: "Đặt lại mật khẩu thành công!" });
      } catch (err) {
        console.error("Lỗi quên mật khẩu:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },

    me: (req, res) => {
      res.json(req.user);
    },

    getStaffList: async (req, res) => {
      try {
        const [results] = await db.query(
          "SELECT id, name, phone, role, shop_id FROM users WHERE role = 'staff'"
        );
        res.json(results);
      } catch (err) {
        console.error("Lỗi lấy nhân viên:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },

    updateStaff: async (req, res) => {
      const { id } = req.params;
      const { name, phone, shop_id } = req.body;
      if (!name || !phone || !shop_id) {
        return res.status(400).json({ message: "Thiếu thông tin cập nhật!" });
      }

      try {
        const [result] = await db.query(
          "UPDATE users SET name = ?, phone = ?, shop_id = ? WHERE id = ? AND role = 'staff'",
          [name, phone, shop_id, id]
        );
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Không tìm thấy nhân viên!" });
        }
        res.json({ message: "Cập nhật thành công!" });
      } catch (err) {
        console.error("Lỗi cập nhật:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },

    deleteStaff: async (req, res) => {
      const { id } = req.params;
      try {
        const [result] = await db.query(
          "DELETE FROM users WHERE id = ? AND role = 'staff'",
          [id]
        );
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Không tìm thấy nhân viên!" });
        }
        res.json({ message: "Xóa nhân viên thành công!" });
      } catch (err) {
        console.error("Lỗi xóa:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },

    getAll: async (req, res) => {
      try {
        const [results] = await db.query("SELECT * FROM users ORDER BY id DESC");
        res.json(results);
      } catch (err) {
        console.error("Lỗi lấy danh sách tất cả người dùng:", err);
        res.status(500).json({ message: "Lỗi hệ thống!" });
      }
    },
  };
}

module.exports = authController;
