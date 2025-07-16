const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

connection.getConnection()
  .then(conn => {
    console.log('✅ Connected to MySQL DB');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Connection to MySQL DB failed:', err);
  });

module.exports = connection;
