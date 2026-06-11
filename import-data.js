const Database = require('better-sqlite3');
const PRODUCTS_DATA = require('./products-data.js');

const db = new Database('./artcanvas.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS Categories (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS Products (
    Id INTEGER PRIMARY KEY,
    CategoryId INTEGER NOT NULL,
    Title TEXT NOT NULL,
    Price REAL NOT NULL,
    OldPrice REAL,
    Image TEXT,
    Images TEXT,
    Description TEXT,
    Features TEXT,
    Rating REAL DEFAULT 0,
    ReviewsCount INTEGER DEFAULT 0,
    Stock INTEGER DEFAULT 0,
    Tags TEXT,
    FOREIGN KEY (CategoryId) REFERENCES Categories(Id)
  );
`);

// Очистим таблицы и заполним заново
db.exec('DELETE FROM Products; DELETE FROM Categories;');

const insertCategory = db.prepare('INSERT INTO Categories (Name) VALUES (?)');
const insertProduct = db.prepare(`
  INSERT INTO Products (Id, CategoryId, Title, Price, OldPrice, Image, Images, Description, Features, Rating, ReviewsCount, Stock, Tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const [categoryName, products] of Object.entries(PRODUCTS_DATA)) {
    const catInfo = insertCategory.run(categoryName);
    const categoryId = catInfo.lastInsertRowid;
    for (const product of products) {
        insertProduct.run(
            product.id, categoryId, product.title, product.price, product.oldPrice || null,
            product.image, JSON.stringify(product.images), product.description,
            JSON.stringify(product.features || []), product.rating || 0,
            product.reviewsCount || 0, product.stock || 0, JSON.stringify(product.tags || [])
        );
    }
    console.log(`Категория "${categoryName}" загружена.`);
}
console.log('Импорт завершён.');