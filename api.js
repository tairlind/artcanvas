// API-клиент для взаимодействия с сервером магазина ArtCanvas

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api';

// Работа с JWT-токеном в localStorage
function getToken() {
    return localStorage.getItem('token');
}
function saveToken(token) {
    localStorage.setItem('token', token);
}
function removeToken() {
    localStorage.removeItem('token');
}

// Базовый метод для отправки запросов к API
async function request(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const response = await fetch(API_BASE + url, { ...options, headers: { ...headers, ...options.headers } });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Ошибка запроса');
    }
    return data;
}

// Приведение данных товара из формата БД к клиентской модели
function normalizeProduct(p) {
    return {
        id: p.Id,
        title: p.Title,
        price: p.Price,
        oldPrice: p.OldPrice || null,
        image: p.Image || 'images/placeholder.jpg',
        images: typeof p.Images === 'string' ? JSON.parse(p.Images) : p.Images,
        description: p.Description,
        features: typeof p.Features === 'string' ? JSON.parse(p.Features) : p.Features,
        rating: p.Rating,
        reviewsCount: p.ReviewsCount,
        stock: p.Stock,
        tags: typeof p.Tags === 'string' ? JSON.parse(p.Tags) : p.Tags,
        category: p.CategoryName || p.Category || ''
    };
}

// Приведение данных профиля из формата БД к клиентской модели
function normalizeProfile(p) {
    return {
        id: p.Id,
        name: p.Name,
        email: p.Email,
        phone: p.Phone,
        address: p.Address,
        bio: p.Bio,
        registrationDate: p.RegistrationDate,
        emailVerified: p.EmailVerified,
        emailNotifications: p.EmailNotifications,
        smsNotifications: p.SmsNotifications,
        role: p.Role || 'user',
        theme: p.Theme || 'light'
    };
}

// Методы API, сгруппированные по назначению
const api = {
    // Авторизация
    register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

    // Профиль
    getProfile: async () => {
        const raw = await request('/profile');
        return normalizeProfile(raw);
    },
    updateProfile: (body) => request('/profile', { method: 'PUT', body: JSON.stringify(body) }),

    // Каталог
    getCategories: () => request('/categories'),
    getCatalog: async (categoryName) => {
        const raw = await request(`/catalog/${encodeURIComponent(categoryName)}`);
        return raw.map(normalizeProduct);
    },
    getProduct: async (id) => {
        const raw = await request(`/product/${id}`);
        return normalizeProduct(raw);
    },
    search: async (q) => {
        const raw = await request(`/search?q=${encodeURIComponent(q)}`);
        return raw.map(normalizeProduct);
    },

    // Корзина
    getCart: () => request('/cart'),
    addToCart: (productId, quantity) => request('/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
    updateCartItem: (productId, quantity) => request('/cart/update', { method: 'PUT', body: JSON.stringify({ productId, quantity }) }),
    removeCartItem: (productId) => request(`/cart/remove/${productId}`, { method: 'DELETE' }),
    clearCart: () => request('/cart/clear', { method: 'DELETE' }),

    // Заказы
    createOrder: (body) => request('/orders', { method: 'POST', body: JSON.stringify(body) }),
    getOrders: () => request('/orders'),

    // Отзывы
    getReviews: (productId) => request(`/reviews/${productId}`),
    getMyReviews: () => request('/my-reviews'),
    addReview: (body) => request('/reviews', { method: 'POST', body: JSON.stringify(body) })
};