const jwt = require("jsonwebtoken");
const db  = require("../config/db");
require("dotenv").config();

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = decoded.id;

    const [[user]] = await db.query(
      "SELECT id, role, shop_id FROM users WHERE id = ?", [userId]
    );
    if (!user)
      return res.status(401).json({ message: "User not found" });

    req.user = {
      id      : user.id,
      role    : user.role,
      shop_id : user.shop_id       
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(403).json({ message: "Invalid token" });
  }
};
