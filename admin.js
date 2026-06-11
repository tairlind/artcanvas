// Админ-панель магазина ArtCanvas

// Защита от XSS
function escapeHTML(str) {
    return String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// API-методы администратора
const adminAPI = {
    getProducts: () => request('/admin/products'),
    createProduct: (data) => request('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
    getOrders: () => request('/admin/orders'),
    updateOrderStatus: (id, status) => request(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
};

// Если нет токена — редирект на главную
if (!getToken()) window.location.href = '/index.html';

// Проверка роли администратора
async function checkAdmin() {
    try {
        const profile = await api.getProfile();
        if (!profile || profile.role !== 'admin') {
            alert('Доступ запрещён');
            window.location.href = '/index.html';
        }
    } catch (e) {
        console.error('Ошибка проверки прав:', e);
        window.location.href = '/index.html';
    }
}

// Инициализация после загрузки страницы
document.addEventListener('DOMContentLoaded', async () => {
    console.log('admin.js загружен, начинаю инициализацию');
    await checkAdmin();
    loadProducts();
    setupTabs();
    document.getElementById('addProductBtn')?.addEventListener('click', showAddProductForm);
    document.getElementById('logoutAdminBtn')?.addEventListener('click', () => {
        removeToken();
        window.location.href = '/index.html';
    });
    document.getElementById('closeModalBtn')?.addEventListener('click', closeProductModal);
});

// Переключение вкладок «Товары» / «Заказы»
function setupTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const panel = tab.dataset.tab;
            document.getElementById('productsPanel').style.display = panel === 'products' ? 'block' : 'none';
            document.getElementById('ordersPanel').style.display = panel === 'orders' ? 'block' : 'none';
            if (panel === 'orders') loadOrders();
        });
    });
}

// Товары

async function loadProducts() {
    console.log('Загружаю товары...');
    try {
        const products = await adminAPI.getProducts();
        console.log('Получено товаров:', products.length);
        const tbody = document.querySelector('#productsTable tbody');
        tbody.innerHTML = products.map(p => `
            <tr>
                <td>${p.Id}</td>
                <td>${p.Title}</td>
                <td>${p.Price} ₽</td>
                <td>${p.CategoryName}</td>
                <td>
                    <button class="btn btn-secondary btn-sm edit-product-btn" data-id="${p.Id}">Изменить</button>
                    <button class="btn btn-outline btn-sm delete-product-btn" data-id="${p.Id}">Удалить</button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.edit-product-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                console.log('Клик по "Изменить", id:', btn.dataset.id);
                editProduct(parseInt(btn.dataset.id));
            });
        });
        tbody.querySelectorAll('.delete-product-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                console.log('Клик по "Удалить", id:', id);
                if (confirm('Удалить товар?')) {
                    adminAPI.deleteProduct(id).then(loadProducts).catch(e => alert(e.message));
                }
            });
        });
    } catch (e) {
        console.error('Ошибка в loadProducts:', e);
        alert('Ошибка загрузки товаров');
    }
}

function showAddProductForm() {
    console.log('Открываю форму добавления');
    const container = document.getElementById('productFormContainer');
    container.innerHTML = buildProductForm();
    loadCategorySelect();
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('productModal').classList.add('active');
    bindSaveButton();
}

async function editProduct(id) {
    console.log('Редактирую товар, id:', id);
    try {
        const products = await adminAPI.getProducts();
        const product = products.find(p => p.Id === id);
        console.log('Найден товар:', product ? product.Title : 'НЕ НАЙДЕН');
        if (!product) {
            alert('Товар не найден');
            return;
        }
        const container = document.getElementById('productFormContainer');
        container.innerHTML = buildProductForm(product);
        loadCategorySelect(product.CategoryId);
        document.getElementById('productModal').style.display = 'flex';
        document.getElementById('productModal').classList.add('active');
        bindSaveButton();
    } catch (e) {
        console.error('Ошибка в editProduct:', e);
        alert(e.message);
    }
}

function buildProductForm(product = null) {
    const isEdit = product !== null;
    return `
        <form id="productForm">
            <div class="form-group"><label>Название</label><input name="title" value="${escapeHTML(product?.Title || '')}" required></div>
            <div class="form-group"><label>Цена</label><input name="price" type="number" step="0.01" value="${product?.Price || ''}" required></div>
            <div class="form-group"><label>Старая цена</label><input name="oldPrice" type="number" step="0.01" value="${product?.OldPrice || ''}"></div>
            <div class="form-group"><label>Категория</label><select name="categoryId"></select></div>
            <div class="form-group"><label>Описание</label><textarea name="description">${escapeHTML(product?.Description || '')}</textarea></div>
            <div class="form-group"><label>Ссылка на изображение</label><input name="image" value="${escapeHTML(product?.Image || '')}"></div>
            <div class="form-group"><label>Количество на складе</label><input name="stock" type="number" value="${product?.Stock || 1}"></div>
            <button type="button" class="btn btn-primary" id="saveProductBtn" data-id="${isEdit ? product.Id : ''}">Сохранить</button>
        </form>
    `;
}

function bindSaveButton() {
    const saveBtn = document.getElementById('saveProductBtn');
    if (!saveBtn) return;
    saveBtn.onclick = async () => {
        console.log('Клик по "Сохранить", id:', saveBtn.dataset.id);
        const id = saveBtn.dataset.id;
        const form = document.getElementById('productForm');
        const data = Object.fromEntries(new FormData(form));
        data.price = parseFloat(data.price);
        data.oldPrice = data.oldPrice ? parseFloat(data.oldPrice) : null;
        data.categoryId = parseInt(data.categoryId);
        data.stock = parseInt(data.stock) || 0;
        data.images = [data.image || 'images/placeholder.jpg'];
        data.features = [];
        data.tags = [];
        try {
            if (id) {
                await adminAPI.updateProduct(id, data);
            } else {
                await adminAPI.createProduct(data);
            }
            closeProductModal();
            loadProducts();
        } catch (e) {
            console.error('Ошибка при сохранении:', e);
            alert(e.message);
        }
    };
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    document.getElementById('productModal').classList.remove('active');
}

async function loadCategorySelect(selectedId) {
    try {
        const categories = await api.getCategories();
        const select = document.querySelector('select[name="categoryId"]');
        if (!select) return;
        select.innerHTML = categories.map(c => `<option value="${c.Id}" ${c.Id === selectedId ? 'selected' : ''}>${c.Name}</option>`).join('');
    } catch (e) {
        console.error('Ошибка загрузки категорий:', e);
    }
}

// Заказы

async function loadOrders() {
    console.log('Загружаю заказы...');
    try {
        const orders = await adminAPI.getOrders();
        const tbody = document.querySelector('#ordersTable tbody');
        tbody.innerHTML = orders.map(order => {
            const deliveryCost = order.DeliveryMethod === 'Курьер' 
                ? (order.Total >= 3000 ? 0 : 300) 
                : order.DeliveryMethod === 'Почта России' ? 200 : 0;
            const totalWithDelivery = order.Total + deliveryCost;
            
            return `
            <tr class="order-row" data-order-id="${order.Id}">
                <td>#${order.Id}</td>
                <td>${order.CustomerName} (${order.CustomerEmail})</td>
                <td>${new Date(order.OrderDate).toLocaleDateString()}</td>
                <td>${totalWithDelivery} ₽</td>
                <td>
                    <select class="statusSelect" id="status-${order.Id}">
                        <option value="В обработке" ${order.Status === 'В обработке' ? 'selected' : ''}>В обработке</option>
                        <option value="Отправлен" ${order.Status === 'Отправлен' ? 'selected' : ''}>Отправлен</option>
                        <option value="Доставлен" ${order.Status === 'Доставлен' ? 'selected' : ''}>Доставлен</option>
                        <option value="Отменён" ${order.Status === 'Отменён' ? 'selected' : ''}>Отменён</option>
                    </select>
                </td>
                <td>
                    <button class="btn btn-primary btn-sm update-status-btn" data-id="${order.Id}">Обновить</button>
                    <button class="btn btn-outline btn-sm order-detail-btn" data-id="${order.Id}">Подробнее</button>
                </td>
            </tr>
            <tr class="order-detail" id="detail-${order.Id}" style="display: none;">
                <td colspan="6">
                    <div style="padding: 15px; background: var(--light); border-radius: var(--radius-sm); line-height: 1.6;">
                        <strong>Покупатель:</strong> ${order.CustomerName}<br>
                        <strong>Email:</strong> ${order.CustomerEmail}<br>
                        <strong>Телефон:</strong> ${order.CustomerPhone}<br>
                        <strong>Дата заказа:</strong> ${new Date(order.OrderDate).toLocaleString()}<br>
                        <strong>Текущий статус:</strong> ${order.Status}<br>
                        <strong>Доставка:</strong> ${order.DeliveryMethod}<br>
                        <strong>Адрес доставки:</strong> ${order.DeliveryAddress || 'не указан'}<br>
                        <strong>Оплата:</strong> ${order.PaymentMethod}<br>
                        <strong>О себе:</strong> ${order.CustomerBio || 'не указано'}<br>
                        <strong>Товары:</strong><br>
                        <ul style="margin-left: 20px; margin-top: 5px;">
                            ${order.items?.map(i => `<li>${i.ProductTitle} × ${i.Quantity} = ${i.Price * i.Quantity} ₽</li>`).join('')}
                        </ul>
                        ${deliveryCost > 0 ? `<strong>Стоимость доставки:</strong> ${deliveryCost} ₽<br>` : ''}
                        <strong>Итого:</strong> ${totalWithDelivery} ₽
                    </div>
                </td>
            </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.update-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const select = document.getElementById(`status-${id}`);
                if (select) {
                    adminAPI.updateOrderStatus(id, select.value)
                        .then(loadOrders)
                        .catch(e => alert(e.message));
                }
            });
        });

        tbody.querySelectorAll('.order-detail-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const detailRow = document.getElementById(`detail-${id}`);
                if (detailRow) {
                    detailRow.style.display = detailRow.style.display === 'none' ? 'table-row' : 'none';
                }
            });
        });
    } catch (e) {
        console.error('Ошибка в loadOrders:', e);
        alert('Ошибка загрузки заказов');
    }
}