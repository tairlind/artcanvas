// Основной скрипт интернет-магазина ArtCanvas

// Состояние приложения
let allProducts = [];
let user = null;
let currentProductView = null;
let checkoutStep = 1;
let currentReviews = [];
let selectedDelivery = 'courier';
let selectedPayment = 'cash';
let checkoutData = {
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryAddress: ''
};
let lastCreatedOrder = null;
const MAX_QTY_PER_ITEM = 10;

// Корзина (хранится в localStorage)
let cart = JSON.parse(localStorage.getItem('cart')) || [];
function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

// DOM-элементы
const main = document.getElementById('mainContent');
const cartSidebar = document.getElementById('cartSidebar');
const overlay = document.getElementById('overlay');
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const cartCounter = document.getElementById('cartCounter');
const authModal = document.getElementById('authModal');
const themeToggle = document.getElementById('themeToggle');
const loadingOverlay = document.getElementById('loadingOverlay');
const navProfile = document.getElementById('nav-profile');

// Изображения категорий по умолчанию
const categoryImages = {
    "Мольберты": "images/m1.jpg",
    "Краски": "images/kr1.jpg",
    "Кисти": "images/ks1.jpg",
    "Холсты и поверхности": "images/h1.jpg",
    "Аксессуары": "images/a1.jpg",
    "Детские художественные наборы": "images/d1.jpg"
};

// Генерация звёзд рейтинга через Font Awesome
function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    let html = '';
    for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
    if (half) html += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < empty; i++) html += '<i class="far fa-star"></i>';
    return html;
}

// Утилиты
function escapeHTML(str) {
    return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function closeAll() {
    closeMobileMenu();
    closeCart();
    authModal.classList.remove('active');
    overlay.classList.remove('active');
}

function closeMobileMenu() {
    navLinks.classList.remove('active');
    overlay.classList.remove('active');
}

// Роутер
const routes = {
    '/home': showHome,
    '/about': showAbout,
    '/contacts': showContacts,
    '/delivery': showDelivery,
    '/return': showReturn,
    '/checkout': showCheckout,
    '/profile': showProfilePage,
    '/catalog': () => showCategory('Мольберты')
};

function resolveRoute(path) {
    if (path.startsWith('/catalog/')) {
        const catName = decodeURIComponent(path.replace('/catalog/', ''));
        return () => showCategory(catName);
    }
    if (path.startsWith('/product/')) {
        const id = parseInt(path.replace('/product/', ''), 10);
        return () => showProduct(id);
    }
    if (path.startsWith('/search?')) {
        const params = new URLSearchParams(path.split('?')[1]);
        const q = params.get('q') || '';
        return () => showSearchResults(q);
    }
    return showHome;
}

function navigate(path, replace = false) {
    if (replace) {
        window.history.replaceState(null, '', '#' + path);
    } else {
        window.history.pushState(null, '', '#' + path);
    }
    handleRoute(path);
}

function handleRoute(path) {
    if (path.startsWith('#')) path = path.substring(1);
    if (!path) path = '/home';
    closeMobileMenu();
    const handler = routes[path] || resolveRoute(path);
    if (handler) handler();
    else main.innerHTML = `<div class="text-center"><h1>Страница не найдена</h1><button class="btn btn-primary" onclick="navigate('/home')">На главную</button></div>`;
    window.scrollTo(0, 0);
}

// Делегирование кликов (навигация и управление корзиной)
document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#/"]');
    if (link) { e.preventDefault(); navigate(link.getAttribute('href').substring(1)); return; }
    const routeEl = e.target.closest('[data-route]');
    if (routeEl) { e.preventDefault(); navigate(routeEl.dataset.route); return; }
    if (e.target.classList.contains('increase-qty') || e.target.closest('.increase-qty')) {
        const btn = e.target.closest('.increase-qty');
        if (btn) updateCartQuantity(parseInt(btn.dataset.id), 1);
    }
    if (e.target.classList.contains('decrease-qty') || e.target.closest('.decrease-qty')) {
        const btn = e.target.closest('.decrease-qty');
        if (btn) updateCartQuantity(parseInt(btn.dataset.id), -1);
    }
    if (e.target.classList.contains('remove-item') || e.target.closest('.remove-item')) {
        const btn = e.target.closest('.remove-item');
        if (btn) removeFromCart(parseInt(btn.dataset.id));
    }
});

window.addEventListener('hashchange', () => handleRoute(window.location.hash.substring(1)));
overlay.addEventListener('click', closeAll);

// Привязка обработчиков к статическим элементам
document.getElementById('searchBtn')?.addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
});
document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
    }
});
document.getElementById('cartIcon')?.addEventListener('click', toggleCart);
document.getElementById('closeCartBtn')?.addEventListener('click', toggleCart);
document.getElementById('btnLogin')?.addEventListener('click', toggleAuthModal);
document.getElementById('closeAuthModal')?.addEventListener('click', () => {
    authModal.classList.remove('active');
    overlay.classList.remove('active');
});
document.getElementById('loginBtn')?.addEventListener('click', login);
document.getElementById('registerBtn')?.addEventListener('click', register);
document.getElementById('showRegisterLink')?.addEventListener('click', e => { e.preventDefault(); showRegisterForm(); });
document.getElementById('showLoginLink')?.addEventListener('click', e => { e.preventDefault(); showLoginForm(); });
themeToggle.addEventListener('click', toggleTheme);
menuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    overlay.classList.toggle('active');
});

// Тема оформления
function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    if (saved === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

async function changeProfileTheme(value) {
    if (value === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
    localStorage.setItem('theme', value);
    try {
        await api.updateProfile({ theme: value });
        user.theme = value;
    } catch (err) {
        showToast('Ошибка сохранения темы', 'error');
    }
}

// Авторизация
async function checkUserSession() {
    if (!getToken()) {
        user = null;
        updateUserUI();
        return;
    }
    try {
        const profile = await api.getProfile();
        user = profile;
        applyUserTheme();
    } catch (e) {
        removeToken();
        user = null;
    }
    updateUserUI();
}

function updateUserUI() {
    const btnLogin = document.getElementById('btnLogin');
    if (user) {
        btnLogin.innerHTML = '<i class="fas fa-user-circle"></i>';
        navProfile.style.display = 'block';
        // Ссылка на админку для администратора
        if (user.role === 'admin') {
            let adminLi = document.getElementById('nav-admin');
            if (!adminLi) {
                adminLi = document.createElement('li');
                adminLi.id = 'nav-admin';
                adminLi.innerHTML = '<a href="/admin.html"><i class="fas fa-cog"></i> Админ-панель</a>';
                navLinks.appendChild(adminLi);
            }
        } else {
            const adminLi = document.getElementById('nav-admin');
            if (adminLi) adminLi.remove();
        }
    } else {
        btnLogin.innerHTML = '<i class="fas fa-user"></i>';
        navProfile.style.display = 'none';
        const adminLi = document.getElementById('nav-admin');
        if (adminLi) adminLi.remove();
    }
}

function toggleAuthModal() {
    if (user) navigate('/profile');
    else {
        showLoginForm();
        authModal.classList.add('active');
        overlay.classList.add('active');
    }
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('authModalTitle').textContent = 'Вход в аккаунт';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('authModalTitle').textContent = 'Регистрация';
}

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!email || !password) return showToast('Заполните все поля', 'error');
    try {
        const data = await api.login({ email, password });
        saveToken(data.token);
        const profile = await api.getProfile();
        user = profile;
        applyUserTheme();
        updateUserUI();
        authModal.classList.remove('active');
        overlay.classList.remove('active');
        showToast('Вход выполнен успешно');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function register() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const confirm = document.getElementById('registerConfirm').value.trim();
    if (!name || !email || !password || !confirm) return showToast('Заполните все поля', 'error');
    if (password !== confirm) return showToast('Пароли не совпадают', 'error');
    if (password.length < 6) return showToast('Пароль минимум 6 символов', 'error');
    try {
        const data = await api.register({ name, email, password });
        saveToken(data.token);
        const profile = await api.getProfile();
        user = profile;
        applyUserTheme();
        updateUserUI();
        authModal.classList.remove('active');
        overlay.classList.remove('active');
        showToast('Регистрация успешна!');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function logout() {
    removeToken();
    user = null;
    updateUserUI();
    showToast('Вы вышли из аккаунта');
    navigate('/home');
}

function applyUserTheme() {
    if (user && user.theme) {
        const isDark = user.theme === 'dark';
        document.body.classList.toggle('dark-theme', isDark);
        localStorage.setItem('theme', user.theme);
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

// Корзина (локальная)
function addToCart(productId, quantity = 1) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return showToast('Товар не найден в текущем каталоге', 'error');

    const available = Math.min(product.stock, MAX_QTY_PER_ITEM);
    let qty = Math.min(quantity, available);
    if (qty <= 0) return showToast('Товара нет в наличии', 'error');

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        const newTotal = existing.quantity + qty;
        existing.quantity = Math.min(newTotal, available);
        if (newTotal > available) {
            showToast(`Максимальное количество: ${available} шт.`, 'warning');
        }
    } else {
        cart.push({
            id: product.id, title: product.title,
            price: product.price, image: product.image,
            quantity: qty
        });
    }
    saveCart();
    updateCartCounter();
    showToast(`"${product.title}" добавлен в корзину`);
    if (cartSidebar.classList.contains('open')) renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    updateCartCounter();
    renderCart();
    showToast('Товар удалён из корзины');
}

function updateCartQuantity(id, change) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    const product = allProducts.find(p => p.id === id);
    if (!product) return;
    const maxAvailable = Math.min(product.stock, MAX_QTY_PER_ITEM);
    let newQty = item.quantity + change;
    newQty = Math.max(1, Math.min(newQty, maxAvailable));
    item.quantity = newQty;
    saveCart();
    updateCartCounter();
    renderCart();
}

function updateCartCounter() {
    const total = cart.reduce((s, i) => s + i.quantity, 0);
    cartCounter.textContent = total;
    cartCounter.style.display = total > 0 ? 'flex' : 'none';

    const mobileCounter = document.getElementById('mobileCartCounter');
    if (mobileCounter) {
        mobileCounter.textContent = total;
        mobileCounter.style.display = total > 0 ? 'flex' : 'none';
    }
}

function toggleCart() {
    cartSidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    if (cartSidebar.classList.contains('open')) renderCart();
}

function closeCart() {
    cartSidebar.classList.remove('open');
    overlay.classList.remove('active');
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Ваша корзина пуста</p>
                <button class="btn-primary" id="startShoppingBtn">Начать покупки</button>
            </div>`;
        document.getElementById('startShoppingBtn')?.addEventListener('click', () => { toggleCart(); navigate('/catalog/Мольберты'); });
        updateTotals();
        return;
    }
    let html = '';
    cart.forEach(item => {
        const total = item.price * item.quantity;
        html += `
            <div class="cart-item">
                <div class="cart-item-image"><img src="${item.image}" alt="${escapeHTML(item.title)}"></div>
                <div class="cart-item-details">
                    <div class="cart-item-title">${escapeHTML(item.title)}</div>
                    <div class="cart-item-price">${item.price} ₽ × ${item.quantity} = ${total} ₽</div>
                    <div class="cart-item-controls">
                        <div class="quantity-control">
                            <button class="qty-btn decrease-qty" data-id="${item.id}">-</button>
                            <span class="qty-value">${item.quantity}</span>
                            <button class="qty-btn increase-qty" data-id="${item.id}">+</button>
                        </div>
                        <button class="remove-item" data-id="${item.id}"><i class="fas fa-trash"></i> Удалить</button>
                    </div>
                </div>
            </div>`;
    });
    cartItems.innerHTML = html;
    updateTotals();
}

function updateTotals() {
    const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    document.getElementById('cartQuantity').textContent = totalQty;
    document.getElementById('cartTotalPrice').textContent = totalPrice;
}

function clearCart() {
    if (cart.length === 0) return;
    cart = [];
    saveCart();
    updateCartCounter();
    renderCart();
    showToast('Корзина очищена');
}

function bindDynamicCartButtons() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const startShoppingBtn = document.getElementById('startShoppingBtn');

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            toggleCart();
            navigate('/checkout');
        });
    }

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', clearCart);
    }

    if (startShoppingBtn) {
        startShoppingBtn.addEventListener('click', () => {
            toggleCart();
            navigate('/catalog/Мольберты');
        });
    }
}

// Страницы
function renderProductCard(product) {
    return `
        <div class="product-card">
            <div class="product-image">
                <img src="${product.image}" alt="${escapeHTML(product.title)}">
                ${product.oldPrice ? `<div class="product-badge">-${Math.round((1 - product.price/product.oldPrice)*100)}%</div>` : ''}
                ${product.tags?.includes('хит') ? `<div class="product-badge" style="top:45px;background:var(--accent);">Хит</div>` : ''}
            </div>
            <div class="product-info">
                <div class="product-title">${escapeHTML(product.title)}</div>
                <div class="product-price">
                    ${product.oldPrice ? `<span class="product-old-price">${product.oldPrice} ₽</span>` : ''}
                    ${product.price} ₽
                </div>
                <div class="product-rating">
                    <div class="stars">${renderStars(product.rating)}</div>
                    <span class="rating-count">(${product.reviewsCount})</span>
                </div>
                <div class="product-actions">
                    <button class="btn btn-secondary" onclick="navigate('/product/${product.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-primary" onclick="addToCart(${product.id})"><i class="fas fa-cart-plus"></i> В корзину</button>
                </div>
            </div>
        </div>`;
}

async function showHome() {
    let categories = [];
    let bestsellers = [];
    try {
        categories = await api.getCategories();
        const products = await api.getCatalog('Мольберты');
        bestsellers = products.slice(0, 8);
        allProducts = products;
    } catch (e) {
        console.error(e);
    }
    main.innerHTML = `
        <div class="hero">
            <div class="hero-content">
                <h1>Творчество начинается здесь</h1>
                <p>Все для художников: от первых красок до профессионального оборудования. Качественные материалы по доступным ценам.</p>
                <button class="btn btn-primary btn-lg" onclick="navigate('/catalog/Мольберты')"><i class="fas fa-paint-brush"></i> Начать покупки</button>
            </div>
        </div>
        <h2 class="section-title">Популярные категории</h2>
        <div class="category-grid">
            ${categories.map(cat => `
                <div class="category-card" onclick="navigate('/catalog/${encodeURIComponent(cat.Name)}')">
                    <img src="${categoryImages[cat.Name] || 'images/m1.jpg'}" alt="${cat.Name}">
                    <div class="category-overlay"><h3>${cat.Name}</h3></div>
                </div>
            `).join('')}
        </div>
        <div class="features">
            <div class="feature"><i class="fas fa-shipping-fast"></i><h4>Быстрая доставка</h4><p>По Москве - 1-2 дня, по России - от 3 дней</p></div>
            <div class="feature"><i class="fas fa-shield-alt"></i><h4>Гарантия качества</h4><p>Все товары проверяются перед отправкой</p></div>
            <div class="feature"><i class="fas fa-headset"></i><h4>Поддержка 24/7</h4><p>Помощь в выборе и консультации</p></div>
            <div class="feature"><i class="fas fa-undo"></i><h4>Возврат 14 дней</h4><p>Легкий возврат и обмен товаров</p></div>
        </div>
        <h2 class="section-title">Хиты продаж</h2>
        <div class="product-grid">${bestsellers.map(p => renderProductCard(p)).join('')}</div>`;
}

// Статические страницы
function showAbout() {
    main.innerHTML = `
        <h1 class="section-title">О компании ArtCanvas</h1>
        <div class="about-hero">
            <div class="about-hero-content">
                <h2>Творчество без границ</h2>
                <p>С 2020 года мы вдохновляем художников по всей России</p>
            </div>
        </div>
        <div class="about-content">
            <div class="about-section">
                <h3>Наша история</h3>
                <p>ArtCanvas начал свой путь в 2020 году как небольшой магазин для художников. Сегодня мы - одна из крупнейших компаний по продаже художественных материалов в России. За эти годы мы помогли тысячам художников найти качественные материалы для своих работ.</p>
            </div>
            <div class="about-section">
                <h3>Наша миссия</h3>
                <p>Мы верим, что искусство должно быть доступно каждому. Наша цель — предоставить художникам качественные материалы по справедливым ценам, чтобы творчество не знало границ. Мы постоянно совершенствуем сервис, расширяем ассортимент и поддерживаем художественные сообщества.</p>
            </div>
            <div class="about-section">
                <h3>Наша команда</h3>
                <p>Наша команда состоит из профессиональных художников и энтузиастов, которые помогут вам выбрать подходящие материалы и поделиться своим опытом. Каждый сотрудник проходит обучение в сфере искусства, чтобы давать грамотные консультации.</p>
            </div>
            <div class="about-section">
                <h3>Наши ценности</h3>
                <ul>
                    <li><strong>Качество</strong> — мы тщательно отбираем каждого поставщика и тестируем все товары</li>
                    <li><strong>Доступность</strong> — искусство должно быть доступно всем, независимо от уровня подготовки</li>
                    <li><strong>Поддержка</strong> — мы всегда готовы помочь советом и консультацией</li>
                    <li><strong>Развитие</strong> — мы постоянно расширяем ассортимент и улучшаем сервис</li>
                </ul>
            </div>
        </div>
        <div class="features mt-5">
            <div class="feature"><i class="fas fa-users"></i><h4>50,000+ клиентов</h4><p>Довольных художников по всей России</p></div>
            <div class="feature"><i class="fas fa-box"></i><h4>5,000+ товаров</h4><p>В нашем каталоге представлено более 5000 наименований</p></div>
            <div class="feature"><i class="fas fa-truck"></i><h4>Доставка по РФ</h4><p>Быстрая и надежная доставка в любой город России</p></div>
            <div class="feature"><i class="fas fa-award"></i><h4>Премиум качество</h4><p>Все товары проходят строгий контроль качества</p></div>
        </div>
        <div class="about-section mt-5">
            <h3>Присоединяйтесь к нашему сообществу</h3>
            <p>Следите за нами в социальных сетях, участвуйте в мастер-классах и конкурсах, делитесь своими работами с хэштегом #ArtCanvasRussia</p>
        </div>`;
}

function showContacts() {
    main.innerHTML = `
        <h1 class="section-title">Контакты</h1>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; margin-top: 40px;">
            <div class="product-description">
                <h3><i class="fas fa-map-marker-alt"></i> Адрес магазина</h3>
                <p>г. Москва, ул. Творческая, д. 15</p>
                <p class="mt-2"><strong>Метро:</strong> Третьяковская</p>
                <p><strong>Режим работы:</strong> 10:00 - 20:00 (ежедневно)</p>
            </div>
            <div class="product-description">
                <h3><i class="fas fa-phone"></i> Контактная информация</h3>
                <p><strong>Телефон:</strong> +7 (999) 999-99-99</p>
                <p><strong>Email:</strong> info@artcanvas.ru</p>
                <p><strong>Для оптовых заказов:</strong> wholesale@artcanvas.ru</p>
                <p class="mt-2"><strong>Техническая поддержка:</strong> support@artcanvas.ru</p>
            </div>
            <div class="product-description">
                <h3><i class="fas fa-clock"></i> Режим работы</h3>
                <p><strong>Магазин:</strong> 10:00 - 20:00 (ежедневно)</p>
                <p><strong>Служба доставки:</strong> 9:00 - 21:00</p>
                <p><strong>Онлайн-консультации:</strong> 24/7</p>
                <p><strong>Обработка заказов:</strong> круглосуточно</p>
            </div>
        </div>
        <div class="product-description mt-4">
            <h3>Как добраться</h3>
            <p>Наш магазин находится в центре Москвы, в 5 минутах ходьбы от метро Третьяковская. Рядом есть парковка для автомобилей.</p>
        </div>
        <div class="action-buttons mt-4" style="max-width: 400px; margin: 0 auto;">
            <button class="btn btn-primary" onclick="navigate('/delivery')"><i class="fas fa-truck"></i> Условия доставки</button>
            <button class="btn btn-secondary" onclick="navigate('/return')"><i class="fas fa-undo"></i> Возврат товара</button>
        </div>`;
}

function showDelivery() {
    main.innerHTML = `
        <h1 class="section-title">Доставка и оплата</h1>
        <div class="product-description">
            <h2>Способы доставки</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0;">
                <div class="feature">
                    <i class="fas fa-truck"></i>
                    <h4>Курьерская доставка</h4>
                    <p>По Москве в пределах МКАД: 300 ₽ (бесплатно от 3000 ₽)</p>
                    <p>Срок: 1-2 рабочих дня</p>
                </div>
                <div class="feature">
                    <i class="fas fa-store"></i>
                    <h4>Самовывоз</h4>
                    <p>г. Москва, ул. Творческая, д. 15</p>
                    <p>Бесплатно, в течение 1 часа после подтверждения заказа</p>
                </div>
                <div class="feature">
                    <i class="fas fa-shipping-fast"></i>
                    <h4>Доставка по России</h4>
                    <p>Транспортными компаниями: СДЭК, Boxberry, Почта России</p>
                    <p>Срок: 3-14 дней, стоимость рассчитывается при оформлении</p>
                </div>
            </div>
            <h2 class="mt-4">Способы оплаты</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0;">
                <div class="feature">
                    <i class="fas fa-credit-card"></i>
                    <h4>Банковской картой</h4>
                    <p>Visa, MasterCard, Мир</p>
                    <p>Безопасная оплата онлайн</p>
                </div>
                <div class="feature">
                    <i class="fas fa-money-bill-wave"></i>
                    <h4>Наличными</h4>
                    <p>При получении заказа</p>
                    <p>Курьеру или в пункте выдачи</p>
                </div>
                <div class="feature">
                    <i class="fas fa-university"></i>
                    <h4>Банковский перевод</h4>
                    <p>Для юридических лиц</p>
                    <p>По счету с НДС</p>
                </div>
            </div>
            <h2 class="mt-4">Гарантии</h2>
            <ul>
                <li>Все товары проходят проверку перед отправкой</li>
                <li>Гарантия на товары от производителя</li>
                <li>Возврат в течение 14 дней</li>
                <li>Консультация по подбору материалов</li>
            </ul>
        </div>`;
}

function showReturn() {
    main.innerHTML = `
        <h1 class="section-title">Возврат и обмен</h1>
        <div class="product-description">
            <h2>Условия возврата</h2>
            <p>Вы можете вернуть товар в течение 14 дней с момента получения, если:</p>
            <ul>
                <li>Товар не был в употреблении</li>
                <li>Сохранен товарный вид и упаковка</li>
                <li>Имеются все ярлыки и этикетки</li>
                <li>Сохранен чек или иное подтверждение покупки</li>
            </ul>
            <h2 class="mt-4">Процедура возврата</h2>
            <ol>
                <li>Свяжитесь с нами по телефону или email</li>
                <li>Заполните заявление на возврат</li>
                <li>Отправьте товар нам (при возврате брака мы компенсируем стоимость доставки)</li>
                <li>Получите денежные средства в течение 10 рабочих дней</li>
            </ol>
            <h2 class="mt-4">Товары, не подлежащие возврату</h2>
            <p>Согласно законодательству РФ, не подлежат возврату товары, упаковка которых повреждена или вскрыта:</p>
            <ul>
                <li>Краски, лаки, растворители</li>
                <li>Кисти и другие расходные материалы</li>
                <li>Товары, изготовленные по индивидуальному заказу</li>
            </ul>
            <h2 class="mt-4">Контакты для возврата</h2>
            <p><strong>Телефон:</strong> +7 (999) 999-99-99</p>
            <p><strong>Email:</strong> returns@artcanvas.ru</p>
            <p><strong>Адрес для возврата:</strong> г. Москва, ул. Творческая, д. 15</p>
        </div>`;
}

// Каталог и товар
let currentCategoryProducts = [];
let currentSort = 'price-asc';
let currentPriceMin = 0;
let currentPriceMax = 10000;

async function showCategory(catName) {
    try {
        const products = await api.getCatalog(catName);
        currentCategoryProducts = products;
        allProducts = products;
        renderFilteredProducts();
    } catch (err) {
        main.innerHTML = `<div class="text-center">Ошибка загрузки категории</div>`;
    }
}

function applyFiltersAndSort() {
    let filtered = [...currentCategoryProducts];
    filtered = filtered.filter(p => p.price >= currentPriceMin && p.price <= currentPriceMax);
    if (currentSort === 'price-asc') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (currentSort === 'price-desc') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (currentSort === 'rating') {
        filtered.sort((a, b) => b.rating - a.rating);
    }
    return filtered;
}

function renderFilteredProducts() {
    const filtered = applyFiltersAndSort();
    const catName = currentCategoryProducts[0]?.category || '';
    const html = `
        <div class="breadcrumbs">
            <a href="#/home" data-route="/home">Главная</a> / <span>${catName}</span>
        </div>
        <h1>${catName}</h1>
        <div class="filter-panel">
            <div class="sort-buttons">
                <span class="sort-label">Сортировать:</span>
                <button class="sort-chip ${currentSort === 'price-asc' ? 'active' : ''}" data-sort="price-asc">
                    <i class="fas fa-arrow-up"></i> По возрастанию цены
                </button>
                <button class="sort-chip ${currentSort === 'price-desc' ? 'active' : ''}" data-sort="price-desc">
                    <i class="fas fa-arrow-down"></i> По убыванию цены
                </button>
                <button class="sort-chip ${currentSort === 'rating' ? 'active' : ''}" data-sort="rating">
                    <i class="fas fa-star"></i> По рейтингу
                </button>
            </div>
            <div class="price-filter">
                <i class="fas fa-tag"></i>
                <input type="number" id="priceMin" value="${currentPriceMin}" placeholder="0" min="0">
                <span class="price-divider">–</span>
                <input type="number" id="priceMax" value="${currentPriceMax}" placeholder="10000" min="0">
                <button id="applyPriceFilter" class="btn btn-sm btn-primary">Применить</button>
            </div>
            <button id="clearFilters" class="btn btn-sm btn-outline">
                <i class="fas fa-times"></i> Сбросить
            </button>
        </div>
        <div class="product-grid" id="productGrid">
            ${filtered.length > 0 ? filtered.map(p => renderProductCard(p)).join('') : '<p class="text-center">Товары не найдены.</p>'}
        </div>
    `;
    main.innerHTML = html;

    document.querySelectorAll('.sort-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            currentSort = btn.dataset.sort;
            renderFilteredProducts();
        });
    });
    document.getElementById('applyPriceFilter')?.addEventListener('click', () => {
        const minVal = Number(document.getElementById('priceMin').value) || 0;
        const maxVal = Number(document.getElementById('priceMax').value) || 10000;
        currentPriceMin = minVal;
        currentPriceMax = maxVal;
        renderFilteredProducts();
    });
    document.getElementById('clearFilters')?.addEventListener('click', () => {
        currentSort = 'price-asc';
        currentPriceMin = 0;
        currentPriceMax = 10000;
        renderFilteredProducts();
    });
}

function updateProductGrid() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const filtered = applyFiltersAndSort();
    grid.innerHTML = filtered.length > 0
        ? filtered.map(p => renderProductCard(p)).join('')
        : '<p>Товары не найдены.</p>';
}

async function showProduct(id) {
    try {
        const product = await api.getProduct(id);
        if (!product) { navigate('/home'); return; }
        currentProductView = product;
        const reviews = await api.getReviews(id);
        currentReviews = reviews;
        const userHasReviewed = user && reviews.some(r => r.UserId === user.id);

        const html = `
            <div class="breadcrumbs">
                <a href="#/home" data-route="/home">Главная</a> /
                <a href="#/catalog/${encodeURIComponent(product.category)}" data-route="/catalog/${encodeURIComponent(product.category)}">${product.category}</a> /
                <span>${escapeHTML(product.title)}</span>
            </div>
            <div class="product-page">
                <div class="product-gallery">
                    <div class="main-image" id="mainImage"><img src="${product.image}" alt="${escapeHTML(product.title)}"></div>
                    <div class="thumbnail-grid">
                        ${(product.images || []).map((img, i) => `
                            <div class="thumbnail ${i === 0 ? 'active' : ''}" onclick="changeProductImage('${img}', this)">
                                <img src="${img}" alt="">
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="product-details">
                    <h1>${escapeHTML(product.title)}</h1>
                    <div class="product-rating">
                        <div class="stars">${renderStars(product.rating)}</div>
                        <span>${product.rating} (${reviews.length} отзывов)</span>
                    </div>
                    <div class="product-price-large">
                        ${product.oldPrice ? `<span style="text-decoration:line-through;color:var(--gray);margin-right:10px;">${product.oldPrice} ₽</span>` : ''}
                        ${product.price} ₽
                    </div>
                    <div class="quantity-selector">
                        <button class="quantity-btn" onclick="updateProductQuantity(-1)">-</button>
                        <input type="number" class="quantity-input" id="productQuantity" value="1" min="1" max="${Math.min(product.stock, MAX_QTY_PER_ITEM)}">
                        <button class="quantity-btn" onclick="updateProductQuantity(1)">+</button>
                        <span style="font-size: 14px; color: var(--gray); margin-left: 10px;">Макс. ${MAX_QTY_PER_ITEM} шт.</span>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-lg" onclick="addToCart(${product.id}, parseInt(document.getElementById('productQuantity').value))">
                            <i class="fas fa-cart-plus"></i> В корзину
                        </button>
                        <button class="btn btn-secondary" onclick="addToCart(${product.id}, parseInt(document.getElementById('productQuantity').value)); navigate('/checkout')">
                            <i class="fas fa-bolt"></i> Купить сейчас
                        </button>
                    </div>
                    <div class="product-description">
                        <h3>Описание</h3>
                        <p>${product.description}</p>
                        ${product.features && product.features.length ? '<h4>Характеристики</h4><ul>' + product.features.map(f => `<li>${f}</li>`).join('') + '</ul>' : ''}
                    </div>
                    <div class="reviews-section">
                        <div class="reviews-header">
                            <h3>Отзывы (${reviews.length})</h3>
                            <div class="reviews-controls">
                                <select id="reviewsSortSelect">
                                    <option value="date-desc">Сначала новые</option>
                                    <option value="date-asc">Сначала старые</option>
                                    <option value="rating-desc">Высокий рейтинг</option>
                                    <option value="rating-asc">Низкий рейтинг</option>
                                </select>
                                ${user && !userHasReviewed ? '<button class="btn btn-secondary" onclick="toggleReviewForm()"><i class="fas fa-edit"></i> Написать отзыв</button>' :
                                  user && userHasReviewed ? '<button class="btn btn-outline" disabled>Вы уже оставили отзыв</button>' :
                                  '<button class="btn btn-outline" onclick="toggleAuthModal()">Войдите, чтобы оставить отзыв</button>'}
                            </div>
                        </div>
                        ${user && !userHasReviewed ? `
                        <div class="review-form" id="reviewForm" style="display:none;">
                            <h4>Ваш отзыв</h4>
                            <div class="review-stars" id="reviewStars">
                                ${[1,2,3,4,5].map(n => `<span class="star" data-rating="${n}"><i class="far fa-star"></i></span>`).join('')}
                            </div>
                            <div class="rating-hint"></div>
                            <textarea id="reviewText" placeholder="Поделитесь впечатлениями..." rows="4"></textarea>
                            <button class="btn btn-primary" onclick="submitReview(${product.id})">Отправить</button>
                        </div>` : ''}
                        <div class="review-list" id="reviewList">
                            ${renderSortedReviews(reviews, 'date-desc')}
                        </div>
                    </div>
                </div>
            </div>`;

        main.innerHTML = html;
        document.getElementById('reviewsSortSelect')?.addEventListener('change', (e) => {
            document.getElementById('reviewList').innerHTML = renderSortedReviews(currentReviews, e.target.value);
        });
        initReviewStars();
    } catch (err) {
        console.error('Ошибка загрузки товара:', err);
        main.innerHTML = `<div class="text-center">Ошибка: ${escapeHTML(err.message)}</div>`;
    }
}

// Отзывы
function renderReviews(reviews) {
    if (!reviews || !reviews.length) return '<p>Пока нет отзывов. Будьте первым!</p>';
    return reviews.map(r => `
        <div class="review-item">
            <div class="review-header"><strong>${escapeHTML(r.UserName)}</strong><span>${new Date(r.Date).toLocaleDateString()}</span></div>
            <div class="stars">${renderStars(product.rating)}</div>
            <p>${escapeHTML(r.Text)}</p>
        </div>
    `).join('');
}

function toggleReviewForm() {
    const form = document.getElementById('reviewForm');
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        if (form.style.display === 'block') {
            form.classList.add('review-form-enter');
        }
    }
}

async function submitReview(productId) {
    const rating = parseInt(document.getElementById('reviewForm').dataset.selectedRating || '0');
    const text = document.getElementById('reviewText').value.trim();
    if (!rating) return showToast('Поставьте оценку', 'error');
    if (!text) return showToast('Напишите отзыв', 'error');
    try {
        await api.addReview({ productId, rating, text });
        showToast('Отзыв добавлен');
        navigate(`/product/${productId}`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderSortedReviews(reviews, sortType) {
    let sorted = [...reviews];
    switch (sortType) {
        case 'date-desc': sorted.sort((a, b) => new Date(b.Date) - new Date(a.Date)); break;
        case 'date-asc': sorted.sort((a, b) => new Date(a.Date) - new Date(b.Date)); break;
        case 'rating-desc': sorted.sort((a, b) => b.Rating - a.Rating); break;
        case 'rating-asc': sorted.sort((a, b) => a.Rating - b.Rating); break;
    }
    return sorted.map(r => `
        <div class="review-item">
            <div class="review-header">
                <div class="review-user">
                    <div class="avatar-small"><i class="fas fa-user"></i></div>
                    <strong>${escapeHTML(r.UserName)}</strong>
                </div>
                <span class="review-date">${new Date(r.Date).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div class="review-rating">${renderStars(r.Rating)}</div>
            <p class="review-text">${escapeHTML(r.Text)}</p>
        </div>
    `).join('');
}

function initReviewStars() {
    const stars = document.querySelectorAll('#reviewStars .star');
    const hint = document.createElement('div');
    hint.className = 'rating-hint';
    document.getElementById('reviewStars')?.after(hint);
    const labels = ['Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];

    stars.forEach(s => {
        s.addEventListener('mouseenter', () => {
            const rating = parseInt(s.dataset.rating);
            updateStarDisplay(stars, rating, 'hover');
            hint.textContent = labels[rating - 1];
        });
        s.addEventListener('mouseleave', () => {
            const currentRating = parseInt(document.getElementById('reviewForm').dataset.selectedRating || 0);
            updateStarDisplay(stars, currentRating, 'selected');
            hint.textContent = currentRating ? labels[currentRating - 1] : '';
        });
        s.addEventListener('click', () => {
            const rating = parseInt(s.dataset.rating);
            document.getElementById('reviewForm').dataset.selectedRating = rating;
            updateStarDisplay(stars, rating, 'selected');
            hint.textContent = labels[rating - 1];
        });
    });
}

function updateStarDisplay(stars, rating, className) {
    stars.forEach(star => {
        const icon = star.querySelector('i');
        if (parseInt(star.dataset.rating) <= rating) {
            icon.className = 'fas fa-star';
            star.classList.add(className);
        } else {
            icon.className = 'far fa-star';
            star.classList.remove(className);
        }
    });
}

// Изображения товара
function changeProductImage(src, element) {
    document.querySelector('#mainImage img').src = src;
    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
}

function updateProductQuantity(change) {
    const input = document.getElementById('productQuantity');
    if (!input) return;
    let val = parseInt(input.value) + change;
    const maxAvailable = Math.min(currentProductView.stock || 0, MAX_QTY_PER_ITEM);
    val = Math.max(1, Math.min(val, maxAvailable));
    input.value = val;
}

// Профиль
async function showProfilePage() {
    if (!user) {
        showToast('Необходимо войти в аккаунт', 'error');
        toggleAuthModal();
        return;
    }
    try {
        const profile = await api.getProfile();
        user = profile;
    } catch (e) {
        showToast('Ошибка загрузки профиля', 'error');
    }
    main.innerHTML = `
        <h1 class="section-title">Мой профиль</h1>
        <div class="profile-page">
            <div class="profile-sidebar">
                <div class="profile-avatar">
                    <div class="avatar"><i class="fas fa-user-circle"></i></div>
                    <h3>${escapeHTML(user.name)}</h3>
                    <p>${escapeHTML(user.email)}</p>
                </div>
                <div class="profile-menu">
                    <ul>
                        <li><a href="javascript:void(0)" class="active" onclick="switchProfileSection('info', this)"><i class="fas fa-user"></i> Личная информация</a></li>
                        <li><a href="javascript:void(0)" onclick="switchProfileSection('orders', this)"><i class="fas fa-history"></i> История заказов</a></li>
                        <li><a href="javascript:void(0)" onclick="switchProfileSection('reviews', this)"><i class="fas fa-star"></i> Мои отзывы</a></li>
                        <li><a href="javascript:void(0)" onclick="switchProfileSection('settings', this)"><i class="fas fa-cog"></i> Настройки</a></li>
                        <li><a href="javascript:void(0)" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Выйти</a></li>
                    </ul>
                </div>
            </div>
            <div class="profile-content">
                <div class="profile-section active" id="profileInfo">
                    <form id="profileInfoForm">
                        <div class="form-group"><label>Имя</label><input id="profileNameInput" value="${escapeHTML(user.name)}"></div>
                        <div class="form-group"><label>Email</label><input id="profileEmailInput" value="${escapeHTML(user.email)}"></div>
                        <div class="form-group"><label>Телефон</label><input id="profilePhoneInput" value="${escapeHTML(user.phone || '')}"></div>
                        <div class="form-group"><label>Адрес</label><input id="profileAddressInput" value="${escapeHTML(user.address || '')}"></div>
                        <div class="form-group"><label>О себе</label><textarea id="profileBioInput">${escapeHTML(user.bio || '')}</textarea></div>
                        <button type="button" class="btn-primary" onclick="saveProfileInfo()">Сохранить</button>
                    </form>
                </div>
                <div class="profile-section" id="profileOrders">${await renderUserOrders()}</div>
                <div class="profile-section" id="profileReviews">${await renderUserReviews()}</div>
                <div class="profile-section" id="profileSettings">
                    <form>
                        <div class="form-group">
                            <label>Тема по умолчанию</label>
                            <select id="themeSelect" onchange="changeProfileTheme(this.value)">
                                <option value="light" ${user.theme === 'light' ? 'selected' : ''}>Светлая</option>
                                <option value="dark" ${user.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Уведомления</label>
                            <div class="checkbox-label"><input type="checkbox" id="emailNotifications" ${user.emailNotifications !== false ? 'checked' : ''}> Email</div>
                            <div class="checkbox-label"><input type="checkbox" id="smsNotifications" ${user.smsNotifications ? 'checked' : ''}> SMS</div>
                        </div>
                        <button type="button" class="btn-primary" onclick="saveProfileSettings()">Сохранить настройки</button>
                    </form>
                </div>
            </div>
        </div>`;
}

function switchProfileSection(sectionId, link) {
    document.querySelectorAll('.profile-menu a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.profile-section').forEach(s => s.classList.remove('active'));
    document.getElementById('profile' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1)).classList.add('active');
}

async function saveProfileInfo() {
    const name = document.getElementById('profileNameInput').value.trim();
    const email = document.getElementById('profileEmailInput').value.trim();
    const phone = document.getElementById('profilePhoneInput').value.trim();
    const address = document.getElementById('profileAddressInput').value.trim();
    const bio = document.getElementById('profileBioInput').value.trim();
    if (!name || !email) return showToast('Имя и email обязательны', 'error');
    try {
        await api.updateProfile({ name, email, phone, address, bio });
        const updatedProfile = await api.getProfile();
        user = updatedProfile;
        updateUserUI();
        showToast('Данные сохранены');
        navigate('/profile');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function renderUserOrders() {
    if (!user) return '<p>Войдите в аккаунт</p>';
    try {
        const orders = await api.getOrders();
        if (!orders.length) return '<div class="text-center"><i class="fas fa-box-open" style="font-size:48px;color:var(--gray);"></i><h4>Нет заказов</h4></div>';
        return orders.map(order => {
            const total = order.Total;
            const deliveryCost = order.DeliveryMethod === 'Курьер' ? (total >= 3000 ? 0 : 300) : order.DeliveryMethod === 'Почта России' ? 200 : 0;
            const totalWithDelivery = total + deliveryCost;
            return `
                <div class="order-summary" style="margin-bottom:20px;">
                    <h4>Заказ #${order.Id} <span class="tag">${order.Status}</span></h4>
                    <p>${new Date(order.OrderDate).toLocaleDateString()}</p>
                    <div>${order.items.map(i => `<span>${escapeHTML(i.ProductTitle)} x${i.Quantity} = ${i.Price * i.Quantity} ₽</span>`).join('<br>')}</div>
                    ${deliveryCost > 0 ? `<p>Доставка: ${deliveryCost} ₽</p>` : ''}
                    <strong>Итого: ${totalWithDelivery} ₽</strong>
                    <div style="margin-top: 10px;">
                        <button class="btn btn-outline btn-sm" onclick="printUserOrder(${order.Id})"><i class="fas fa-print"></i> Распечатать</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        return '<p>Ошибка загрузки заказов</p>';
    }
}

async function renderUserReviews() {
    if (!user) return '<p>Войдите в аккаунт</p>';
    try {
        const reviews = await api.getMyReviews();
        if (!reviews.length) return '<p>Нет отзывов</p>';
        return reviews.map(r => `
            <div class="review-item">
                <strong>${escapeHTML(r.ProductTitle)}</strong>
                <div>${renderStars(r.Rating)}</div>
                <p>${escapeHTML(r.Text)}</p>
                <small>${new Date(r.Date).toLocaleDateString()}</small>
            </div>
        `).join('');
    } catch (e) {
        return '<p>Ошибка загрузки отзывов</p>';
    }
}

async function saveProfileSettings() {
    try {
        const emailNotifications = document.getElementById('emailNotifications').checked;
        const smsNotifications = document.getElementById('smsNotifications').checked;
        await api.updateProfile({ emailNotifications, smsNotifications });
        user.emailNotifications = emailNotifications;
        user.smsNotifications = smsNotifications;
        showToast('Настройки сохранены');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Поиск
async function showSearchResults(query) {
    if (!query) return navigate('/home');
    try {
        const results = await api.search(query);
        allProducts = results;
        main.innerHTML = `
            <h1>Результаты поиска: "${escapeHTML(query)}"</h1>
            <p>Найдено товаров: ${results.length}</p>
            <div class="product-grid">
                ${results.map(p => renderProductCard(p)).join('')}
            </div>`;
    } catch (err) {
        main.innerHTML = `<div class="text-center">Ошибка поиска</div>`;
    }
}

// Оформление заказа
function showCheckout() {
    if (cart.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }
    checkoutStep = 1;
    main.innerHTML = `
        <h1 class="section-title">Оформление заказа</h1>
        <div class="checkout-steps">
            <div class="checkout-step active"><div class="step-number">1</div><div class="step-title">Данные покупателя</div></div>
            <div class="checkout-step"><div class="step-number">2</div><div class="step-title">Доставка</div></div>
            <div class="checkout-step"><div class="step-number">3</div><div class="step-title">Оплата</div></div>
            <div class="checkout-step"><div class="step-number">4</div><div class="step-title">Подтверждение</div></div>
        </div>
        <div class="checkout-content" id="checkoutContent">${renderCheckoutStep(1)}</div>`;
}

function renderCheckoutStep(step) {
    if (step === 1) {
        return `
            <h2>Данные покупателя</h2>
            <div class="form-group"><label>ФИО *</label><input id="custName" placeholder="Иванов Иван Иванович" value="${escapeHTML(checkoutData.customerName || (user?.name || ''))}"></div>
            <div class="form-group"><label>Email *</label><input type="email" id="custEmail" placeholder="example@mail.ru" value="${escapeHTML(checkoutData.customerEmail || (user?.email || ''))}"></div>
            <div class="form-group"><label>Телефон *</label><input type="tel" id="custPhone" placeholder="+7 (999) 999-99-99" value="${escapeHTML(checkoutData.customerPhone || (user?.phone || ''))}"></div>
            <button class="btn btn-primary" onclick="saveCustomerData()">Продолжить</button>`;
    }
    if (step === 2) {
        const orderTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const delCostCourier = orderTotal >= 3000 ? 0 : 300;
        const delCostPost = 200;
        return `
            <h2>Способ доставки</h2>
            <div id="deliveryMethods" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                <div class="payment-method ${selectedDelivery === 'courier' ? 'active' : ''}" onclick="selectDelivery('courier')">
                    <i class="fas fa-truck"></i>
                    <div><h4>Курьер</h4><p>1-2 дня, ${delCostCourier} ₽ (бесплатно от 3000 ₽)</p></div>
                </div>
                <div class="payment-method ${selectedDelivery === 'pickup' ? 'active' : ''}" onclick="selectDelivery('pickup')">
                    <i class="fas fa-store"></i>
                    <div><h4>Самовывоз</h4><p>Москва, ул. Творческая, д. 15</p></div>
                </div>
                <div class="payment-method ${selectedDelivery === 'post' ? 'active' : ''}" onclick="selectDelivery('post')">
                    <i class="fas fa-mail-bulk"></i>
                    <div><h4>Почта России</h4><p>5-14 дней, от ${delCostPost} ₽</p></div>
                </div>
            </div>
            <div class="form-group">
                <label>Адрес доставки</label>
                <input id="delivAddress" placeholder="Город, улица, дом, квартира" value="${escapeHTML(checkoutData.deliveryAddress || (user?.address || ''))}" ${selectedDelivery === 'pickup' ? 'disabled' : ''}>
            </div>
            <div class="action-buttons mt-4">
                <button class="btn btn-outline" onclick="goToStep(1)">Назад</button>
                <button class="btn btn-primary" onclick="saveDeliveryData()">Продолжить</button>
            </div>`;
    }
    if (step === 3) {
        const orderTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const delCost = selectedDelivery === 'courier' ? (orderTotal >= 3000 ? 0 : 300) : selectedDelivery === 'post' ? 200 : 0;
        const total = orderTotal + delCost;
        return `
            <h2>Способ оплаты</h2>
            <div id="paymentMethods" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                <div class="payment-method ${selectedPayment === 'cash' ? 'active' : ''}" onclick="selectPayment('cash')">
                    <i class="fas fa-money-bill-wave"></i>
                    <div><h4>Наличные при получении</h4></div>
                </div>
                <div class="payment-method ${selectedPayment === 'transfer' ? 'active' : ''}" onclick="selectPayment('transfer')">
                    <i class="fas fa-university"></i>
                    <div><h4>Банковский перевод</h4></div>
                </div>
            </div>
            <div class="order-summary">
                <h3>Ваш заказ</h3>
                <div>${cart.map(i => `<div class="order-item"><span>${escapeHTML(i.title)} x${i.quantity}</span><span>${i.price * i.quantity} ₽</span></div>`).join('')}</div>
                <div class="order-item"><span>Доставка</span><span>${delCost} ₽</span></div>
                <div class="order-total"><span>Итого:</span><span>${total} ₽</span></div>
            </div>
            <div class="action-buttons mt-4">
                <button class="btn btn-outline" onclick="goToStep(2)">Назад</button>
                <button class="btn btn-primary" onclick="savePaymentData()">Продолжить</button>
            </div>`;
    }
    if (step === 4) {
        const orderTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const delCost = selectedDelivery === 'courier' ? (orderTotal >= 3000 ? 0 : 300) : selectedDelivery === 'post' ? 200 : 0;
        const total = orderTotal + delCost;
        return `
            <h2>Подтверждение заказа</h2>
            <div class="order-summary">
                <p><strong>Имя:</strong> ${escapeHTML(checkoutData.customerName)}</p>
                <p><strong>Email:</strong> ${escapeHTML(checkoutData.customerEmail)}</p>
                <p><strong>Телефон:</strong> ${escapeHTML(checkoutData.customerPhone)}</p>
                <p><strong>Доставка:</strong> ${selectedDelivery === 'courier' ? 'Курьер' : selectedDelivery === 'pickup' ? 'Самовывоз' : 'Почта России'}</p>
                <p><strong>Адрес:</strong> ${escapeHTML(checkoutData.deliveryAddress)}</p>
                <p><strong>Оплата:</strong> ${selectedPayment === 'cash' ? 'Наличные' : 'Банковский перевод'}</p>
                <h3>Товары</h3>
                ${cart.map(i => `<p>${escapeHTML(i.title)} x${i.quantity} = ${i.price * i.quantity} ₽</p>`).join('')}
                <p>Доставка: ${delCost} ₽</p>
                <h3>Итого: ${total} ₽</h3>
            </div>
            <div class="action-buttons mt-4">
                <button class="btn btn-outline" onclick="goToStep(3)">Назад</button>
                <button class="btn btn-primary" onclick="confirmOrder()">Подтвердить заказ</button>
            </div>`;
    }
}

function goToStep(step) {
    checkoutStep = step;
    document.querySelectorAll('.checkout-step').forEach((el, index) => {
        el.classList.remove('active', 'completed');
        if (index + 1 === step) el.classList.add('active');
        else if (index + 1 < step) el.classList.add('completed');
    });
    document.getElementById('checkoutContent').innerHTML = renderCheckoutStep(step);
}

function saveCustomerData() {
    const name = document.getElementById('custName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    if (!name || !email || !phone) return showToast('Заполните все поля', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Некорректный email', 'error');
    checkoutData = {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        deliveryAddress: checkoutData.deliveryAddress
    };
    goToStep(2);
}

function selectDelivery(type) {
    selectedDelivery = type;
    const addressInput = document.getElementById('delivAddress');
    if (addressInput) {
        if (type === 'pickup') {
            addressInput.disabled = true;
            addressInput.value = 'г. Москва, ул. Творческая, д. 15';
        } else {
            addressInput.disabled = false;
            addressInput.value = checkoutData.deliveryAddress || (user?.address || '');
        }
    }
    document.querySelectorAll('#deliveryMethods .payment-method').forEach(el => el.classList.remove('active'));
    const idx = type === 'courier' ? 0 : type === 'pickup' ? 1 : 2;
    document.querySelector(`#deliveryMethods .payment-method:nth-child(${idx+1})`).classList.add('active');
}

function saveDeliveryData() {
    if (selectedDelivery !== 'pickup') {
        const address = document.getElementById('delivAddress').value.trim();
        if (!address) return showToast('Введите адрес доставки', 'error');
        checkoutData.deliveryAddress = address;
    } else {
        checkoutData.deliveryAddress = 'г. Москва, ул. Творческая, д. 15 (самовывоз)';
    }
    goToStep(3);
}

function selectPayment(type) {
    if (type === 'card') return;
    selectedPayment = type;
    document.querySelectorAll('#paymentMethods .payment-method').forEach(el => el.classList.remove('active'));
    const idx = type === 'cash' ? 0 : 1;
    document.querySelector(`#paymentMethods .payment-method:nth-child(${idx+1})`).classList.add('active');
    if (checkoutStep === 3) {
        document.getElementById('checkoutContent').innerHTML = renderCheckoutStep(3);
    }
}

function savePaymentData() {
    goToStep(4);
}

async function confirmOrder() {
    if (!getToken()) {
        showToast('Для оформления заказа необходимо войти', 'error');
        toggleAuthModal();
        return;
    }

    const orderItems = cart.map(item => ({
        productId: item.id,
        quantity: item.quantity
    }));

    try {
        const order = await api.createOrder({
            customerName: checkoutData.customerName,
            customerEmail: checkoutData.customerEmail,
            customerPhone: checkoutData.customerPhone,
            deliveryMethod: selectedDelivery === 'courier' ? 'Курьер' : selectedDelivery === 'pickup' ? 'Самовывоз' : 'Почта России',
            deliveryAddress: checkoutData.deliveryAddress,
            paymentMethod: selectedPayment === 'card' ? 'Банковская карта' : selectedPayment === 'cash' ? 'Наличные' : 'Банковский перевод',
            items: orderItems,
            customerBio: user?.bio || ''
        });

        const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const deliveryCost = selectedDelivery === 'courier' ? (cartTotal >= 3000 ? 0 : 300) : selectedDelivery === 'post' ? 200 : 0;

        lastCreatedOrder = {
            id: order.orderId,
            date: new Date().toISOString(),
            items: cart.map(i => ({ ...i })),
            total: order.total,
            status: order.status,
            deliveryCost: deliveryCost
        };

        cart = [];
        saveCart();
        updateCartCounter();

        const totalWithDelivery = order.total + deliveryCost;

        main.innerHTML = `
            <div class="text-center">
                <div style="font-size:72px; color:var(--success); margin-bottom:20px;"><i class="fas fa-check-circle"></i></div>
                <h2>Спасибо за заказ!</h2>
                <p>Ваш заказ успешно оформлен.</p>
                <div class="order-summary">
                    <p><strong>Номер заказа:</strong> #${order.orderId}</p>
                    <p><strong>Дата:</strong> ${new Date().toLocaleDateString()}</p>
                    <p><strong>Сумма:</strong> ${totalWithDelivery} ₽</p>
                    <p><strong>Статус:</strong> ${order.status || 'В обработке'}</p>
                </div>
                <div class="action-buttons" style="max-width:400px; margin:20px auto;">
                    <button class="btn btn-primary" onclick="printOrder()"><i class="fas fa-print"></i> Распечатать заказ</button>
                    <button class="btn btn-secondary" onclick="navigate('/home')"><i class="fas fa-home"></i> На главную</button>
                </div>
            </div>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function printOrder() {
    if (!lastCreatedOrder) return;
    const order = lastCreatedOrder;
    const totalWithDelivery = order.total + (order.deliveryCost || 0);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Заказ #${order.id}</title></head><body>
        <h1>ArtCanvas</h1><h2>Заказ #${order.id}</h2>
        <p>Дата: ${new Date(order.date).toLocaleDateString()}</p>
        <p>Статус: ${order.status}</p>
        <p>Покупатель: ${checkoutData.customerName}, ${checkoutData.customerEmail}, ${checkoutData.customerPhone}</p>
        <p>Доставка: ${selectedDelivery === 'courier' ? 'Курьер' : selectedDelivery === 'pickup' ? 'Самовывоз' : 'Почта России'}</p>
        <p>Адрес: ${checkoutData.deliveryAddress}</p>
        <p>Оплата: ${selectedPayment === 'card' ? 'Банковская карта' : selectedPayment === 'cash' ? 'Наличные' : 'Банковский перевод'}</p>
        <table border="1" cellpadding="5" cellspacing="0">
            <tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>
            ${order.items.map(i => `<tr><td>${i.title}</td><td>${i.quantity}</td><td>${i.price} ₽</td><td>${i.price * i.quantity} ₽</td></tr>`).join('')}
        </table>
        <h3>Стоимость доставки: ${order.deliveryCost} ₽</h3>
        <h2>Итого: ${totalWithDelivery} ₽</h2>
        <script>window.print()<\/script>
        </body></html>
    `);
    printWindow.document.close();
}

async function printUserOrder(orderId) {
    try {
        const orders = await api.getOrders();
        const order = orders.find(o => o.Id === orderId);
        if (!order) {
            showToast('Заказ не найден', 'error');
            return;
        }

        const total = order.Total;
        const deliveryCost = order.DeliveryMethod === 'Курьер' ? (total >= 3000 ? 0 : 300) : order.DeliveryMethod === 'Почта России' ? 200 : 0;
        const totalWithDelivery = total + deliveryCost;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html><html><head><title>Заказ #${order.Id}</title></head><body>
            <h1>ArtCanvas</h1><h2>Заказ #${order.Id}</h2>
            <p>Дата: ${new Date(order.OrderDate).toLocaleDateString()}</p>
            <p>Статус: ${order.Status}</p>
            <p>Покупатель: ${order.CustomerName}, ${order.CustomerEmail}, ${order.CustomerPhone}</p>
            <p>Доставка: ${order.DeliveryMethod}</p>
            <p>Адрес: ${order.DeliveryAddress || 'не указан'}</p>
            <p>Оплата: ${order.PaymentMethod}</p>
            <table border="1" cellpadding="5" cellspacing="0">
                <tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>
                ${order.items.map(i => `<tr><td>${i.ProductTitle}</td><td>${i.Quantity}</td><td>${i.Price} ₽</td><td>${i.Price * i.Quantity} ₽</td></tr>`).join('')}
            </table>
            ${deliveryCost > 0 ? `<p>Стоимость доставки: ${deliveryCost} ₽</p>` : ''}
            <h3>Итого: ${totalWithDelivery} ₽</h3>
            <script>window.print()<\/script>
            </body></html>
        `);
        printWindow.document.close();
    } catch (e) {
        showToast('Ошибка при подготовке печати', 'error');
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    function setActiveMobileNav() {
        const hash = window.location.hash.substring(1) || '/home';
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            const route = item.dataset.route;
            item.classList.remove('active');
            if (route && hash.startsWith(route.replace(/\/$/, ''))) {
                item.classList.add('active');
            }
        });
        if (hash === '/checkout' || cartSidebar.classList.contains('open')) {
            document.getElementById('mobileCartBtn')?.classList.add('active');
        }
    }

    document.getElementById('mobileCartBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleCart();
    });

    window.addEventListener('hashchange', setActiveMobileNav);
    setActiveMobileNav();
    initTheme();
    try {
        await checkUserSession();
    } catch (e) {
        // Пользователь не авторизован — это нормально
    }
    updateCartCounter();
    bindDynamicCartButtons();
    setTimeout(() => loadingOverlay.classList.add('hidden'), 800);
    const hash = window.location.hash.substring(1);
    handleRoute(hash || '/home');
});