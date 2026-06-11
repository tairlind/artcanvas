// Серверная часть интернет-магазина ArtCanvas
// Node.js + Express + SQLite

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение базы данных SQLite
const DB_PATH = process.env.DB_PATH || './artcanvas.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создание таблиц, если они ещё не существуют
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
  CREATE TABLE IF NOT EXISTS Users (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Email TEXT NOT NULL UNIQUE,
    PasswordHash TEXT NOT NULL,
    Phone TEXT,
    Address TEXT,
    Bio TEXT,
    RegistrationDate TEXT DEFAULT (datetime('now')),
    EmailVerified INTEGER DEFAULT 0,
    EmailNotifications INTEGER DEFAULT 1,
    SmsNotifications INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS Carts (
    UserId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    Quantity INTEGER DEFAULT 1,
    PRIMARY KEY (UserId, ProductId),
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(Id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS Orders (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER,
    CustomerName TEXT NOT NULL,
    CustomerEmail TEXT NOT NULL,
    CustomerPhone TEXT NOT NULL,
    DeliveryMethod TEXT NOT NULL,
    DeliveryAddress TEXT,
    PaymentMethod TEXT NOT NULL,
    Total REAL NOT NULL,
    Status TEXT DEFAULT 'В обработке',
    OrderDate TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS OrderItems (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId INTEGER NOT NULL,
    ProductId INTEGER NOT NULL,
    ProductTitle TEXT NOT NULL,
    Price REAL NOT NULL,
    Quantity INTEGER NOT NULL,
    FOREIGN KEY (OrderId) REFERENCES Orders(Id) ON DELETE CASCADE,
    FOREIGN KEY (ProductId) REFERENCES Products(Id)
  );
  CREATE TABLE IF NOT EXISTS Reviews (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ProductId INTEGER NOT NULL,
    UserId INTEGER NOT NULL,
    UserName TEXT NOT NULL,
    Rating INTEGER CHECK(Rating BETWEEN 1 AND 5) NOT NULL,
    Text TEXT,
    Date TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ProductId) REFERENCES Products(Id),
    FOREIGN KEY (UserId) REFERENCES Users(Id)
  );
`);

// Миграции: добавление новых полей в существующие таблицы
try { db.exec(`ALTER TABLE Users ADD COLUMN Theme TEXT DEFAULT 'light'`); } catch (e) { /* поле уже есть */ }
try { db.exec(`ALTER TABLE Orders ADD COLUMN CustomerBio TEXT DEFAULT ''`); } catch (e) { /* поле уже есть */ }
try { db.exec(`ALTER TABLE Users ADD COLUMN Role TEXT DEFAULT 'user'`); } catch (e) { /* поле уже есть */ }

// Автоматический импорт товаров, если база пуста
const productsCount = db.prepare('SELECT COUNT(*) AS count FROM Products').get().count;
if (productsCount === 0) {
    console.log('База пуста – выполняю импорт товаров...');
    try {
        const PRODUCTS_DATA = require('./products-data.js');
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
    } catch (err) {
        console.error('Ошибка автоматического импорта:', err.message);
    }
}

// Автоматическое создание администратора, если его нет
const adminExists = db.prepare('SELECT Id FROM Users WHERE Role = ?').get('admin');
if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'admin123';
    const adminName = 'Admin';
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO Users (Name, Email, PasswordHash, Role) VALUES (?, ?, ?, ?)').run(adminName, adminEmail, hash, 'admin');
    console.log('Администратор создан: admin@gmail.com / admin123');
}

// Middleware
app.use(cors());
app.use(express.json());

// Секретный ключ для JWT
const JWT_SECRET = 'ArtCanvasSecretKey2025!VerySecure#RandomString42';

// Генерация токена
function generateToken(user) {
    return jwt.sign({ id: user.Id, email: user.Email }, JWT_SECRET, { expiresIn: '7d' });
}

// Проверка авторизации
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Требуется авторизация' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Неверный токен' });
    }
}

// Проверка прав администратора
function authorizeAdmin(req, res, next) {
    const user = db.prepare('SELECT Role FROM Users WHERE Id = ?').get(req.userId);
    if (!user || user.Role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}

// Авторизация

// Регистрация
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Все поля обязательны' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    try {
        const existing = db.prepare('SELECT Id FROM Users WHERE Email = ?').get(email);
        if (existing) return res.status(400).json({ error: 'Email уже используется' });
        const hash = await bcrypt.hash(password, 10);
        const result = db.prepare('INSERT INTO Users (Name, Email, PasswordHash) VALUES (?, ?, ?)').run(name, email, hash);
        const user = { Id: result.lastInsertRowid, Name: name, Email: email };
        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user.Id, name: user.Name, email: user.Email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    try {
        const user = db.prepare('SELECT * FROM Users WHERE Email = ?').get(email);
        if (!user) return res.status(400).json({ error: 'Неверный email или пароль' });
        const valid = await bcrypt.compare(password, user.PasswordHash);
        if (!valid) return res.status(400).json({ error: 'Неверный email или пароль' });
        const token = generateToken(user);
        res.json({ token, user: { id: user.Id, name: user.Name, email: user.Email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Профиль

// Получение профиля
app.get('/api/profile', authenticate, (req, res) => {
    const user = db.prepare('SELECT Id, Name, Email, Phone, Address, Bio, RegistrationDate, EmailVerified, EmailNotifications, SmsNotifications, Role, Theme FROM Users WHERE Id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
});

// Обновление профиля
app.put('/api/profile', authenticate, (req, res) => {
    const { name, email, phone, address, bio, emailNotifications, smsNotifications, theme } = req.body;
    const currentUser = db.prepare('SELECT * FROM Users WHERE Id = ?').get(req.userId);
    if (!currentUser) return res.status(404).json({ error: 'Пользователь не найден' });
    
    const updatedName = name !== undefined ? name : currentUser.Name;
    const updatedEmail = email !== undefined ? email : currentUser.Email;
    const updatedPhone = phone !== undefined ? phone : currentUser.Phone;
    const updatedAddress = address !== undefined ? address : currentUser.Address;
    const updatedBio = bio !== undefined ? bio : currentUser.Bio;
    const updatedEmailNotif = emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : currentUser.EmailNotifications;
    const updatedSmsNotif = smsNotifications !== undefined ? (smsNotifications ? 1 : 0) : currentUser.SmsNotifications;
    const updatedTheme = theme !== undefined ? theme : currentUser.Theme;
    
    db.prepare(`
        UPDATE Users SET Name = ?, Email = ?, Phone = ?, Address = ?, Bio = ?,
        EmailNotifications = ?, SmsNotifications = ?, Theme = ? WHERE Id = ?
    `).run(updatedName, updatedEmail, updatedPhone, updatedAddress, updatedBio, updatedEmailNotif, updatedSmsNotif, updatedTheme, req.userId);
    
    res.json({ success: true });
});

// Мои отзывы
app.get('/api/my-reviews', authenticate, (req, res) => {
    const reviews = db.prepare(`
        SELECT Reviews.*, Products.Title AS ProductTitle
        FROM Reviews JOIN Products ON Reviews.ProductId = Products.Id
        WHERE Reviews.UserId = ? ORDER BY Reviews.Date DESC
    `).all(req.userId);
    res.json(reviews);
});

// Каталог

// Список категорий
app.get('/api/categories', (req, res) => {
    const categories = db.prepare('SELECT * FROM Categories').all();
    res.json(categories);
});

// Товары категории
app.get('/api/catalog/:categoryName', (req, res) => {
    const category = db.prepare('SELECT Id FROM Categories WHERE Name = ?').get(decodeURIComponent(req.params.categoryName));
    if (!category) return res.status(404).json({ error: 'Категория не найдена' });
    const products = db.prepare('SELECT * FROM Products WHERE CategoryId = ?').all(category.Id);
    const mapped = products.map(p => ({
        ...p,
        images: JSON.parse(p.Images),
        features: JSON.parse(p.Features),
        tags: JSON.parse(p.Tags),
        CategoryName: req.params.categoryName
    }));
    res.json(mapped);
});

// Карточка товара
app.get('/api/product/:id', (req, res) => {
    const p = db.prepare('SELECT Products.*, Categories.Name AS CategoryName FROM Products JOIN Categories ON Products.CategoryId = Categories.Id WHERE Products.Id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Товар не найден' });
    p.images = JSON.parse(p.Images);
    p.features = JSON.parse(p.Features);
    p.tags = JSON.parse(p.Tags);
    res.json(p);
});

// Поиск товаров (по названию)
app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    const words = q.split(/\s+/).filter(w => w.length > 0);
    const patterns = words.map(w => {
        if (w.length <= 3) return `%${w}%`;
        const root = w.slice(0, -1);
        return `%${root}%`;
    });
    const whereClauses = patterns.map(() => `Products.Title LIKE ?`).join(' OR ');
    const sqlQuery = `
        SELECT Products.*, Categories.Name AS CategoryName
        FROM Products JOIN Categories ON Products.CategoryId = Categories.Id
        WHERE ${whereClauses}
    `;
    const results = db.prepare(sqlQuery).all(...patterns);
    const mapped = results.map(p => ({
        ...p,
        images: JSON.parse(p.Images),
        features: JSON.parse(p.Features),
        tags: JSON.parse(p.Tags)
    }));
    res.json(mapped);
});

// Корзина

app.get('/api/cart', authenticate, (req, res) => {
    const items = db.prepare(`
        SELECT Carts.ProductId, Carts.Quantity, Products.Title, Products.Price, Products.Image
        FROM Carts JOIN Products ON Carts.ProductId = Products.Id
        WHERE Carts.UserId = ?
    `).all(req.userId);
    res.json(items);
});

app.post('/api/cart/add', authenticate, (req, res) => {
    const { productId, quantity } = req.body;
    const product = db.prepare('SELECT Stock FROM Products WHERE Id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    const finalQty = Math.min(quantity, product.Stock, 10);
    const existing = db.prepare('SELECT Quantity FROM Carts WHERE UserId = ? AND ProductId = ?').get(req.userId, productId);
    if (existing) {
        const newQty = Math.min(existing.Quantity + finalQty, 10, product.Stock);
        db.prepare('UPDATE Carts SET Quantity = ? WHERE UserId = ? AND ProductId = ?').run(newQty, req.userId, productId);
    } else {
        db.prepare('INSERT INTO Carts (UserId, ProductId, Quantity) VALUES (?, ?, ?)').run(req.userId, productId, finalQty);
    }
    res.json({ success: true });
});

app.put('/api/cart/update', authenticate, (req, res) => {
    const { productId, quantity } = req.body;
    db.prepare('UPDATE Carts SET Quantity = ? WHERE UserId = ? AND ProductId = ?').run(quantity, req.userId, productId);
    res.json({ success: true });
});

app.delete('/api/cart/remove/:productId', authenticate, (req, res) => {
    db.prepare('DELETE FROM Carts WHERE UserId = ? AND ProductId = ?').run(req.userId, req.params.productId);
    res.json({ success: true });
});

app.delete('/api/cart/clear', authenticate, (req, res) => {
    db.prepare('DELETE FROM Carts WHERE UserId = ?').run(req.userId);
    res.json({ success: true });
});

// Заказы

app.post('/api/orders', authenticate, (req, res) => {
    const { customerName, customerEmail, customerPhone, deliveryMethod, deliveryAddress, paymentMethod, items, customerBio } = req.body;
    if (!customerName || !customerEmail || !customerPhone || !deliveryMethod || !paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    const insertOrder = db.prepare(`
        INSERT INTO Orders (UserId, CustomerName, CustomerEmail, CustomerPhone, DeliveryMethod, DeliveryAddress, PaymentMethod, Total, CustomerBio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare('INSERT INTO OrderItems (OrderId, ProductId, ProductTitle, Price, Quantity) VALUES (?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE Products SET Stock = Stock - ? WHERE Id = ? AND Stock >= ?');
    const getProduct = db.prepare('SELECT Title, Price, Stock FROM Products WHERE Id = ?');

    let total = 0;
    const orderItems = [];
    for (const item of items) {
        const product = getProduct.get(item.productId);
        if (!product) return res.status(400).json({ error: `Товар с id ${item.productId} не найден` });
        if (product.Stock < item.quantity) return res.status(400).json({ error: `Недостаточно товара "${product.Title}" на складе` });
        total += product.Price * item.quantity;
        orderItems.push({ productId: item.productId, title: product.Title, price: product.Price, quantity: item.quantity });
    }

    const result = insertOrder.run(req.userId, customerName, customerEmail, customerPhone, deliveryMethod, deliveryAddress || '', paymentMethod, total, customerBio || '');
    const orderId = result.lastInsertRowid;
    for (const oi of orderItems) {
        updateStock.run(oi.quantity, oi.productId, oi.quantity);
        insertItem.run(orderId, oi.productId, oi.title, oi.price, oi.quantity);
    }
    res.json({ orderId, total, status: 'В обработке' });
});

app.get('/api/orders', authenticate, (req, res) => {
    const orders = db.prepare('SELECT * FROM Orders WHERE UserId = ? ORDER BY OrderDate DESC').all(req.userId);
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM OrderItems WHERE OrderId = ?').all(order.Id);
    }
    res.json(orders);
});

// Отзывы

app.get('/api/reviews/:productId', (req, res) => {
    const reviews = db.prepare('SELECT * FROM Reviews WHERE ProductId = ? ORDER BY Date DESC').all(req.params.productId);
    res.json(reviews);
});

app.post('/api/reviews', authenticate, (req, res) => {
    const { productId, rating, text } = req.body;
    if (!productId || !rating || !text) return res.status(400).json({ error: 'Не все поля заполнены' });
    const existing = db.prepare('SELECT Id FROM Reviews WHERE UserId = ? AND ProductId = ?').get(req.userId, productId);
    if (existing) return res.status(400).json({ error: 'Вы уже оставляли отзыв' });
    const user = db.prepare('SELECT Name FROM Users WHERE Id = ?').get(req.userId);
    db.prepare('INSERT INTO Reviews (ProductId, UserId, UserName, Rating, Text) VALUES (?, ?, ?, ?, ?)').run(productId, req.userId, user.Name, rating, text);
    const stats = db.prepare('SELECT COUNT(*) AS count, AVG(Rating) AS avgRating FROM Reviews WHERE ProductId = ?').get(productId);
    db.prepare('UPDATE Products SET Rating = ?, ReviewsCount = ? WHERE Id = ?').run(stats.avgRating || 0, stats.count, productId);
    res.status(201).json({ success: true });
});

// Админ-панель

// Товары
app.get('/api/admin/products', authenticate, authorizeAdmin, (req, res) => {
    const products = db.prepare(`
        SELECT Products.*, Categories.Name AS CategoryName
        FROM Products JOIN Categories ON Products.CategoryId = Categories.Id
        ORDER BY Products.Id
    `).all();
    const mapped = products.map(p => ({ ...p, images: JSON.parse(p.Images), features: JSON.parse(p.Features), tags: JSON.parse(p.Tags) }));
    res.json(mapped);
});

app.post('/api/admin/products', authenticate, authorizeAdmin, (req, res) => {
    const { title, price, oldPrice, categoryId, description, features, image, images, tags, stock } = req.body;
    if (!title || !price || !categoryId) return res.status(400).json({ error: 'Обязательные поля: title, price, categoryId' });
    const maxId = db.prepare('SELECT MAX(Id) AS maxId FROM Products').get().maxId || 100;
    const newId = maxId + 1;
    db.prepare(`
        INSERT INTO Products (Id, CategoryId, Title, Price, OldPrice, Image, Images, Description, Features, Rating, ReviewsCount, Stock, Tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(newId, categoryId, title, price, oldPrice || null, image || '', JSON.stringify(images || []), description || '', JSON.stringify(features || []), stock || 0, JSON.stringify(tags || []));
    res.status(201).json({ id: newId });
});

app.put('/api/admin/products/:id', authenticate, authorizeAdmin, (req, res) => {
    const { title, price, oldPrice, categoryId, description, features, image, images, tags, stock } = req.body;
    const existing = db.prepare('SELECT * FROM Products WHERE Id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });
    const updated = {
        Title: title !== undefined ? title : existing.Title,
        Price: price !== undefined ? price : existing.Price,
        OldPrice: oldPrice !== undefined ? oldPrice : existing.OldPrice,
        CategoryId: categoryId !== undefined ? categoryId : existing.CategoryId,
        Description: description !== undefined ? description : existing.Description,
        Features: features !== undefined ? JSON.stringify(features) : existing.Features,
        Image: image !== undefined ? image : existing.Image,
        Images: images !== undefined ? JSON.stringify(images) : existing.Images,
        Tags: tags !== undefined ? JSON.stringify(tags) : existing.Tags,
        Stock: stock !== undefined ? stock : existing.Stock
    };
    db.prepare(`
        UPDATE Products SET Title=?, Price=?, OldPrice=?, CategoryId=?, Description=?, Features=?, Image=?, Images=?, Tags=?, Stock=?
        WHERE Id=?
    `).run(updated.Title, updated.Price, updated.OldPrice, updated.CategoryId, updated.Description, updated.Features, updated.Image, updated.Images, updated.Tags, updated.Stock, req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', authenticate, authorizeAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM Products WHERE Id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });
    db.prepare('DELETE FROM Reviews WHERE ProductId = ?').run(req.params.id);
    db.prepare('DELETE FROM Carts WHERE ProductId = ?').run(req.params.id);
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM Products WHERE Id = ?').run(req.params.id);
    db.pragma('foreign_keys = ON');
    res.json({ success: true });
});

// Заказы
app.get('/api/admin/orders', authenticate, authorizeAdmin, (req, res) => {
    const orders = db.prepare('SELECT * FROM Orders ORDER BY OrderDate DESC').all();
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM OrderItems WHERE OrderId = ?').all(order.Id);
    }
    res.json(orders);
});

app.put('/api/admin/orders/:id', authenticate, authorizeAdmin, (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Укажите статус' });
    const order = db.prepare('SELECT * FROM Orders WHERE Id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    db.prepare('UPDATE Orders SET Status = ? WHERE Id = ?').run(status, req.params.id);
    res.json({ success: true });
});

// Раздача статических файлов (интерфейс магазина)
app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен на http://0.0.0.0:${PORT}`));