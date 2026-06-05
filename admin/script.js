const API = '/admin/api';
let editingId = null;
let galleryUrls = [];
let pickerCallback = null;
let pickerForMainImage = false;
let pickerMultiSelect = false;
let gridViewData = window.innerWidth < 768;
let gridViewOrders = window.innerWidth < 768;
let gridViewStorage = window.innerWidth < 768;
let gridViewGallery = window.innerWidth < 768;
let gridViewNews = window.innerWidth < 768;
let cachedItems = [];
let cachedOrders = [];
let cachedStorage = [];
let cachedGallery = [];
let cachedNews = [];
let storageCache = { ts: 0, data: null };
const STORAGE_CACHE_TTL = 10000;
let totalDataItems = 0;
let totalOrdersItems = 0;
let currentDataPage = 1;
let currentOrdersPage = 1;
let currentStoragePage = 1;
let currentGalleryPage = 1;
let currentNewsPage = 1;
let dataSortDir = 'desc';
let dataSearchQuery = '';
let cachedAllData = [];
const PAGE_SIZE = 20;
const STATUS_DISPLAY = { pending: 'قيد الانتظار', processing: 'قيد المعالجة', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };

const PASSWORD_RULES = { min: 8, lowercase: /[a-z]/, uppercase: /[A-Z]/, number: /\d/, symbol: /[^a-zA-Z0-9]/ };
let passwordHash = null;
let passwordChangedAt = null;

async function login(password) {
  const res = await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!res.ok) throw new Error('كلمة المرور غير صحيحة');
  return res.json();
}

async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkPasswordStatus(showPrompt) {
  try {
    const res = await fetch(`${API}/password-status`);
    if (!res.ok) return;
    const data = await res.json();
    passwordChangedAt = data.changedAt || null;
    if (!data.hasPassword && showPrompt) {
      showToast('أول تسجيل دخول — يرجى تعيين كلمة مرور جديدة', 'info');
      setTimeout(() => openChangePassword(), 500);
    }
  } catch {}
}

function showLogin() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-password').focus();
}

function hideLogin() {
  document.getElementById('login-modal').classList.add('hidden');
}

document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'جارٍ تسجيل الدخول...';
  try {
    const password = document.getElementById('login-password').value;
    passwordHash = await hashPassword(password);
    await login(password);
    hideLogin();
    showToast('تم تسجيل الدخول', 'success');
    await Promise.all([loadItems(), loadOrders()]);
    loadDashboard();
    checkPasswordStatus(true);
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
    document.getElementById('login-error').style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول';
  }
};

document.getElementById('btn-toggle-password').onclick = function() {
  const input = document.getElementById('login-password');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  this.textContent = isPassword ? 'إخفاء' : 'إظهار';
};

function esc(s) { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* --- Product Form --- */

function getFormProduct() {
  return {
    product_id: parseInt(document.getElementById('pf-product_id').value) || undefined,
    name: document.getElementById('pf-name').value.trim(),
    shortInfo: document.getElementById('pf-shortInfo').value.trim(),
    longInfo: document.getElementById('pf-longInfo').value.trim(),
    price: parseFloat(document.getElementById('pf-price').value) || 0,
    discount: parseFloat(document.getElementById('pf-discount').value) || 0,
    category: document.getElementById('pf-category').value.trim(),
    tags: document.getElementById('pf-tags').value.split(',').map(s => s.trim()).filter(Boolean),
    mainImage: document.getElementById('pf-mainImage').value.trim(),
    properties: getProperties(),
    quantity: document.getElementById('pf-quantity').checked,
    stock: document.getElementById('pf-quantity').checked ? parseInt(document.getElementById('pf-stock').value) || 0 : undefined,
    currency: document.getElementById('pf-currency').value.trim() || undefined,
    typeGroups: getTypeGroups(),
  };
}

function setFormProduct(product) {
  document.getElementById('pf-product_id').value = product.product_id ?? '';
  document.getElementById('pf-name').value = product.name || '';
  document.getElementById('pf-shortInfo').value = product.shortInfo || '';
  document.getElementById('pf-longInfo').value = product.longInfo || '';
  document.getElementById('pf-price').value = product.price ?? '';
  document.getElementById('pf-discount').value = product.discount ?? '';
  document.getElementById('pf-category').value = product.category || '';
  document.getElementById('pf-tags').value = Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || '');
  document.getElementById('pf-mainImage').value = product.mainImage || '';
  setProperties(Array.isArray(product.properties) ? product.properties : []);
  document.getElementById('pf-quantity').checked = !!product.quantity;
  document.getElementById('pf-stock').value = product.stock ?? '';
  document.getElementById('pf-stock-row').style.display = product.quantity ? '' : 'none';
  document.getElementById('pf-currency').value = product.currency || '';
  setTypeGroups(product.typeGroups || []);
}

function clearForm() {
  document.getElementById('pf-product_id').value = '';
  document.getElementById('pf-name').value = '';
  document.getElementById('pf-shortInfo').value = '';
  document.getElementById('pf-longInfo').value = '';
  document.getElementById('pf-price').value = '';
  document.getElementById('pf-discount').value = '';
  document.getElementById('pf-category').value = '';
  document.getElementById('pf-tags').value = '';
  document.getElementById('pf-mainImage').value = '';
  setProperties([]);
  document.getElementById('pf-quantity').checked = false;
  document.getElementById('pf-stock').value = '';
  document.getElementById('pf-stock-row').style.display = 'none';
  document.getElementById('pf-currency').value = '';
  clearTypeGroups();
}

/* --- Properties sub-form --- */

function getProperties() {
  return [...document.querySelectorAll('#properties-container .prop-row')].map(row => {
    const inputs = row.querySelectorAll('input');
    return { prop: inputs[0].value.trim(), value: inputs[1].value.trim() };
  }).filter(p => p.prop);
}

function setProperties(props) {
  const container = document.getElementById('properties-container');
  container.innerHTML = '';
  if (!props || props.length === 0) props = [{ prop: '', value: '' }];
  props.forEach(p => addPropertyRow(p.prop, p.value));
}

function addPropertyRow(prop, value) {
  const container = document.getElementById('properties-container');
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `
    <input type="text" placeholder="الخاصية" value="${esc(prop || '')}">
    <input type="text" placeholder="القيمة" value="${esc(value || '')}">
    <button type="button" class="btn-remove-prop">&times;</button>
  `;
  row.querySelector('.btn-remove-prop').onclick = () => row.remove();
  container.appendChild(row);
}

function getTypeGroups() {
  const container = document.getElementById('type-groups-container');
  const groups = [];
  container.querySelectorAll('.type-group').forEach(groupEl => {
    const name = groupEl.querySelector('.tg-name').value.trim();
    const options = [];
    groupEl.querySelectorAll('.tg-option').forEach(optEl => {
      const oname = optEl.querySelector('.tg-opt-name').value.trim();
      const oinfo = optEl.querySelector('.tg-opt-info').value.trim();
      const oprice = optEl.querySelector('.tg-opt-price').value.trim();
      if (oname) options.push({ name: oname, info: oinfo, price: oprice ? parseFloat(oprice) : null });
    });
    if (name) groups.push({ name, options });
  });
  return groups;
}

function setTypeGroups(groups) {
  const container = document.getElementById('type-groups-container');
  container.innerHTML = '';
  (groups || []).forEach(g => { addTypeGroup(g.name, g.options); });
}

function clearTypeGroups() {
  document.getElementById('type-groups-container').innerHTML = '';
}

function updateDiscountLabel() {
  const label = document.getElementById('pf-discount-label');
  const input = document.getElementById('pf-discount');
  input.step = '1';
  input.min = '0';
  input.max = '100';
  input.placeholder = '0';
  if (label) label.textContent = '(0% = السعر الكامل، 100% = مجاني)';
}

function addTypeGroup(name, options) {
  const container = document.getElementById('type-groups-container');
  const groupEl = document.createElement('div');
  groupEl.className = 'type-group';
  groupEl.style.cssText = 'border:1px solid #ddd;border-radius:4px;padding:0.5rem;margin-bottom:0.5rem;background:#fafafa';
  groupEl.innerHTML = `
    <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.25rem">
      <input class="tg-name" type="text" placeholder="اسم المجموعة (مثال: اللون)" value="${escHtml(name || '')}" style="flex:1">
      <button type="button" class="btn small danger tg-remove-group">حذف المجموعة</button>
    </div>
    <div class="tg-options" style="margin-left:0.5rem;display:flex;flex-direction:column;gap:0.25rem"></div>
    <button type="button" class="btn small tg-add-option" style="margin-left:0.5rem;margin-top:0.25rem">+ إضافة خيار</button>
  `;
  container.appendChild(groupEl);
  groupEl.querySelector('.tg-remove-group').onclick = () => { groupEl.remove(); updateDiscountLabel(); };
  groupEl.querySelector('.tg-add-option').onclick = () => addTypeOption(groupEl.querySelector('.tg-options'), '', '', null);
  const optsContainer = groupEl.querySelector('.tg-options');
  (options || []).forEach(opt => addTypeOption(optsContainer, opt.name, opt.info, opt.price));
  return groupEl;
}

function addTypeOption(container, name, info, price) {
  const optEl = document.createElement('div');
  optEl.className = 'tg-option';
  optEl.style.cssText = 'display:flex;gap:0.25rem;align-items:center;margin-bottom:0.15rem';
  optEl.innerHTML = `
    <input class="tg-opt-name" type="text" placeholder="اسم الخيار" value="${escHtml(name || '')}" style="flex:2">
    <input class="tg-opt-info" type="text" placeholder="الوصف" value="${escHtml(info || '')}" style="flex:3">
    <input class="tg-opt-price" type="number" step="0.01" placeholder="تعديل السعر" value="${price != null ? price : ''}" style="flex:1">
    <button type="button" class="btn small danger tg-remove-option">X</button>
  `;
  container.appendChild(optEl);
  optEl.querySelector('.tg-remove-option').onclick = () => optEl.remove();
}

async function loadAllData() {
  const res = await fetch(API);
  if (res.status === 401) { showLogin(); return; }
  const result = await res.json();
  cachedAllData = Array.isArray(result) ? result : (result.data || []);
  totalDataItems = cachedAllData.length;
  currentDataPage = 1;
  cachedItems = cachedAllData.slice(0, PAGE_SIZE);
  updateItemCount('data');
  renderDataView();
}

async function loadAllDataIfNeeded() {
  if (dataSearchQuery && cachedAllData.length > 0) await loadAllData();
}

async function loadItems(page, dir) {
  page = page || currentDataPage;
  dir = dir || dataSortDir;
  if (dataSearchQuery) {
    // When searching, work with local cache (cachedAllData is ASC from server)
    let filtered = filterData(cachedAllData, dataSearchQuery);
    if (dir === 'desc') filtered = [...filtered].reverse();
    const totalFiltered = filtered.length;
    const totalFP = Math.ceil(totalFiltered / PAGE_SIZE) || 1;
    if (page > totalFP) page = totalFP;
    const start = (page - 1) * PAGE_SIZE;
    cachedItems = filtered.slice(start, start + PAGE_SIZE);
    currentDataPage = page;
    updateItemCount('data');
    renderDataView();
    return;
  }
  // In DESC mode, flip page to show from end (page 1 = last items)
  // If totalDataItems is unknown, fetch page 1 first to get total, then re-fetch correct page
  if (dir === 'desc' && totalDataItems === 0) {
    const probe = await fetch(`${API}?page=1&limit=${PAGE_SIZE}`);
    if (probe.ok) {
      const probeData = await probe.json();
      totalDataItems = probeData.total || 0;
    }
  }
  let serverPage = page;
  if (dir === 'desc' && totalDataItems > 0) {
    const totalPages = Math.ceil(totalDataItems / PAGE_SIZE);
    serverPage = Math.max(1, totalPages - page + 1);
  }
  const url = `${API}?page=${serverPage}&limit=${PAGE_SIZE}`;
  const res = await fetch(url);
  if (res.status === 401) { showLogin(); return; }
  const result = await res.json();
  if (result.data) {
    cachedItems = result.data;
    totalDataItems = result.total;
    currentDataPage = result.page;
  } else {
    cachedItems = result;
    totalDataItems = result.length;
  }
  // For DESC mode, reverse server's ASC order to show newest first
  if (dir === 'desc') cachedItems = [...cachedItems].reverse();
  // Map server page back to UI page for display
  if (dir === 'desc' && totalDataItems > 0) {
    const totalPages = Math.ceil(totalDataItems / PAGE_SIZE);
    currentDataPage = totalPages - serverPage + 1;
  }
  updateItemCount('data');
  renderDataView();
}

function filterData(data, query) {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter(item => {
    const vals = Object.values(item).filter(v => v != null).map(v => String(v).toLowerCase());
    return vals.some(v => v.includes(q));
  });
}

function renderDataView() {
  const items = cachedItems; // already a page slice or search-filtered slice
  const totalForPagination = dataSearchQuery ? filterData(cachedAllData, dataSearchQuery).length : totalDataItems;

  const empty = document.getElementById('empty-msg');
  const tableWrap = document.getElementById('view-data-table');
  const grid = document.getElementById('view-data-grid');
  tableWrap.classList.toggle('hidden', gridViewData);
  grid.classList.toggle('hidden', !gridViewData);

  // Toggle pagination visibility based on view mode
  const topTablePg = document.getElementById('view-data-pagination-top');
  const topGridPg = document.getElementById('view-data-grid-pagination-top');
  if (topTablePg) topTablePg.style.display = gridViewData ? 'none' : '';
  if (topGridPg) topGridPg.style.display = gridViewData ? '' : 'none';

  const keys = ['product_id', 'name', 'price', 'category', 'stock'];
  const FIELD_LABELS = {
    product_id: 'رقم المنتج', name: 'الاسم', price: 'السعر', category: 'الفئة',
    description: 'الوصف', stock: 'المخزون', image_url: 'رابط الصورة',
    unit: 'الوحدة', type_group: 'مجموعة النوع', type_name: 'اسم النوع',
    colors: 'الألوان', sizes: 'المقاسات', brand: 'العلامة التجارية',
    created_at: 'تاريخ الإنشاء', updated_at: 'تاريخ التحديث',
    status: 'الحالة', notes: 'الملاحظات', quantity: 'الكمية',
    item_id: 'رقم العنصر', order_id: 'رقم الطلب', client_name: 'اسم العميل',
    client_phone: 'هاتف العميل', client_address: 'عنوان العميل',
    client_email: 'بريد العميل', city: 'المدينة', delivery_company: 'شركة التوصيل',
    payment: 'طريقة الدفع', total: 'المجموع', discount: 'الخصم'
  };
  const labelKey = k => FIELD_LABELS[k] || k;

  const pgnHtml = renderPagination(currentDataPage, totalForPagination, PAGE_SIZE, 'data');

  function setBoth(ids, html) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
  }

  if (gridViewData) {
    if (items.length === 0) { grid.innerHTML = ''; empty.style.display = ''; setBoth(['view-data-grid-pagination','view-data-grid-pagination-top'], ''); return; }
    empty.style.display = 'none';
    grid.innerHTML = items.map(item =>
      `<div class="card" data-action="edit" data-id="${item.id}">${keys.map(k => `<div class="card-key">${labelKey(k)}</div><div class="card-val">${renderCell(item[k])}</div>`).join('')}<div class="card-actions"><button class="btn small" data-action="edit" data-id="${item.id}">تعديل</button><button class="btn small" data-action="duplicate" data-id="${item.id}">نسخ</button> <button class="btn small danger" data-action="delete" data-id="${item.id}">حذف</button></div></div>`
    ).join('');
    setBoth(['view-data-grid-pagination','view-data-grid-pagination-top'], pgnHtml);
    setBoth(['view-data-pagination','view-data-pagination-top'], '');
    return;
  }

  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  thead.innerHTML = keys.map(k => `<th>${labelKey(k)}</th>`).join('') + '<th class="actions">الإجراءات</th>';

  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    setBoth(['view-data-pagination','view-data-pagination-top'], '');
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = items.map(item => `
    <tr data-action="edit" data-id="${item.id}">
      ${keys.map(k => `<td>${renderCell(item[k])}</td>`).join('')}
      <td class="actions">
        <button class="btn small" data-action="edit" data-id="${item.id}">تعديل</button>
        <button class="btn small" data-action="duplicate" data-id="${item.id}">نسخ</button>
        <button class="btn small danger" data-action="delete" data-id="${item.id}">حذف</button>
      </td>
    </tr>
  `).join('');
  setBoth(['view-data-pagination','view-data-pagination-top'], pgnHtml);
  setBoth(['view-data-grid-pagination','view-data-grid-pagination-top'], '');
}

async function saveItem(e) {
  e.preventDefault();
  const data = getFormProduct();
  if (!data.name) return showToast('اسم المنتج مطلوب', 'error');
  if (!data.product_id) data.product_id = cachedItems.reduce((max, item) => Math.max(max, item.product_id || 0), 0) + 1;
  data.gallery = galleryUrls;
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';
  try {
    const url = editingId ? `${API}/${editingId}` : API;
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); showToast(err.error || 'فشل الحفظ', 'error'); return; }
    closeModal();
    await loadAllDataIfNeeded();
    loadItems();
    showToast('تم الحفظ بنجاح', 'success');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'تحديث' : 'حفظ';
  }
}

async function deleteItem(id) {
  if (!confirm('حذف هذا العنصر؟')) return;
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) { const err = await res.json(); showToast(err.error || 'فشل الحذف', 'error'); return; }
  showToast('تم حذف العنصر', 'success');
  loadAllDataIfNeeded().then(() => loadItems());
}

async function duplicateItem(id) {
  const original = cachedItems.find(i => i.id === id);
  if (!original) { showToast('العنصر غير موجود', 'error'); return; }
  const clone = { ...original };
  delete clone.id;
  clone.name = clone.name ? clone.name + ' (نسخة)' : 'نسخة';
  clone.product_id = cachedItems.reduce((max, item) => Math.max(max, item.product_id || 0), 0) + 1;
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clone) });
  if (!res.ok) { const err = await res.json(); showToast(err.error || 'فشل النسخ', 'error'); return; }
  showToast('تم نسخ العنصر', 'success');
  loadAllDataIfNeeded().then(() => loadItems());
}

function viewItem(itemId) {
  const item = cachedItems.find(i => i.id === itemId);
  if (!item) { showToast('العنصر غير موجود', 'error'); return; }
  const rows = [];
  const addRow = (k, v) => { if (v != null && v !== '') rows.push(`<tr><td style="padding:0.35rem 0.5rem;font-weight:600;font-size:0.85rem;color:#666;vertical-align:top;white-space:nowrap">${escHtml(k)}</td><td style="padding:0.35rem 0.5rem;font-size:0.9rem">${v}</td></tr>`); };
  addRow('معرف المنتج', item.product_id);
  addRow('الاسم', item.name);
  const priceStr = item.price != null ? '$' + parseFloat(item.price).toFixed(2) : '';
  const discountStr = item.discount > 0
    ? priceStr + ' (-' + item.discount + '%)'
    : priceStr;
  addRow('السعر', discountStr);
  if (item.discount > 0) addRow('الخصم', item.discount + '%');
  addRow('الفئة', item.category);
  addRow('الوسوم', Array.isArray(item.tags) ? item.tags.join(', ') : item.tags);
  addRow('معلومات مختصرة', item.shortInfo);
  addRow('وصف طويل', item.longInfo);
  if (item.mainImage) addRow('الصورة الرئيسية', `<img src="${escHtml(item.mainImage)}" style="max-width:100%;max-height:150px;border-radius:4px;cursor:pointer" data-action="view-image" data-url="${escHtml(item.mainImage)}">`);
  if (Array.isArray(item.properties)) {
    const props = item.properties.filter(p => p.prop).map(p => `${escHtml(p.prop)}: ${escHtml(p.value)}`).join('<br>');
    if (props) addRow('الخصائص', props);
  }
  if (item.quantity) addRow('الكمية', 'مفعل' + (item.stock != null ? ' (المخزون: ' + item.stock + ')' : ''));
  if (item.currency) addRow('العملة', item.currency);
  if (item.stock != null) addRow('المخزون', item.stock);
  if (Array.isArray(item.typeGroups) && item.typeGroups.length) {
    const tgDisplay = item.typeGroups.map(g => `${escHtml(g.name)}: ${g.options.map(o => o.name + (o.info ? ' (' + o.info + ')' : '') + (o.price != null ? ' [$' + o.price + ']' : '')).join(', ')}`).join('<br>');
    addRow('مجموعات الأنواع', tgDisplay);
  }
  if (Array.isArray(item.gallery) && item.gallery.length) {
    addRow('المعرض', item.gallery.map(u => `<img src="${escHtml(u)}" style="max-height:60px;border-radius:3px;cursor:pointer;margin:2px" data-action="view-image" data-url="${escHtml(u)}">`).join(''));
  }
  document.getElementById('item-view-content').innerHTML = '<table style="width:100%;border-collapse:collapse">' + rows.join('') + '</table>';
  document.getElementById('item-view-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  resetGallery();
}

function resetGallery() {
  galleryUrls = [];
  hideGallery();
}

function editItem(id) {
  editingId = id;
  document.getElementById('modal-title').textContent = 'تعديل العنصر';
  document.getElementById('btn-save').textContent = 'تحديث';
  fetch(`${API}`).then(r => r.json()).then(items => {
    const item = items.find(i => i.id === id);
    if (item) {
      setFormProduct(item);
      galleryUrls = Array.isArray(item.gallery) ? [...item.gallery] : [];
      showGallery();
    }
  });
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(updateDiscountLabel, 50);
}

function openNew() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'عنصر جديد';
  document.getElementById('btn-save').textContent = 'حفظ';
  clearForm();
  const maxId = cachedItems.reduce((max, item) => Math.max(max, item.product_id || 0), 0);
  document.getElementById('pf-product_id').value = maxId + 1;
  galleryUrls = [];
  showGallery();
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(updateDiscountLabel, 50);
}

document.getElementById('btn-add').onclick = openNew;
document.getElementById('btn-refresh-data').onclick = () => { loadItems(); showToast('تم تحديث البيانات', 'info'); };
document.getElementById('btn-toggle-data').onclick = () => { gridViewData = !gridViewData; document.getElementById('btn-toggle-data').textContent = gridViewData ? 'عرض جدول' : 'عرض شبكي'; renderDataView(); };
document.getElementById('btn-cancel').onclick = closeModal;
document.querySelector('#modal .modal-backdrop')?.addEventListener('click', closeModal);
document.getElementById('item-form').onsubmit = saveItem;
document.getElementById('btn-add-property').onclick = () => addPropertyRow('', '');
document.getElementById('btn-add-type-group').onclick = () => { addTypeGroup('', []); updateDiscountLabel(); };
document.getElementById('btn-pf-mainImage').onclick = () => {
  pickerForMainImage = true;
  openPicker();
};

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* --- Orders --- */

async function loadOrders(page) {
  page = page || currentOrdersPage;
  const url = page ? `${API}/orders?page=${page}&limit=${PAGE_SIZE}` : API + '/orders';
  const res = await fetch(url);
  if (res.status === 401) { showLogin(); return; }
  const result = await res.json();
  if (result.data) {
    cachedOrders = result.data;
    totalOrdersItems = result.total;
    currentOrdersPage = result.page;
  } else {
    cachedOrders = result;
    totalOrdersItems = result.length;
  }
  updateItemCount('orders');
  renderOrdersView();
}

function renderOrdersView() {
  const query = (document.getElementById('order-search')?.value || '').toLowerCase().trim();
  const orders = cachedOrders.filter(o => {
    if (!query) return true;
    const d = fd(o);
    const name = (d.name || o.client_name || '').toLowerCase();
    const phone = (d.phone || '').toLowerCase();
    const email = (d.email || '').toLowerCase();
    return name.includes(query) || phone.includes(query) || email.includes(query);
  });
  const empty = document.getElementById('orders-empty');
  const tableWrap = document.getElementById('view-orders-table');
  const grid = document.getElementById('view-orders-grid');
  tableWrap.classList.toggle('hidden', gridViewOrders);
  grid.classList.toggle('hidden', !gridViewOrders);
  const topOrdersPg = document.getElementById('view-orders-pagination-top');
  const topOrdersGridPg = document.getElementById('view-orders-grid-pagination-top');
  if (topOrdersPg) topOrdersPg.style.display = gridViewOrders ? 'none' : '';
  if (topOrdersGridPg) topOrdersGridPg.style.display = gridViewOrders ? '' : 'none';

  const payLabels = { '1': 'الدفع عند الاستلام', '2': 'عبر رمز QR', '3': 'عبر رمز التطبيق' };

  function fd(o) { const d = o.item_data || {}; return d.formData || d; }

  function calcOrderTotal(o) {
    const itemData = o.item_data || {};
    if (itemData.items && Array.isArray(itemData.items) && itemData.items.length > 0) {
      return itemData.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (item.quantity || 1), 0);
    }
    if (itemData.cartTotal != null) return parseFloat(itemData.cartTotal) || 0;
    const price = parseFloat(fd(o).price) || 0;
    const qty = itemData.quantity || 1;
    return price * qty;
  }

  function renderItemColumn(o) {
    const itemData = o.item_data || {};
    if (itemData.items && Array.isArray(itemData.items) && itemData.items.length > 0) {
      return itemData.items.map(item => {
        const qty = item.quantity || 1;
        const price = parseFloat(item.price) || 0;
        const types = item.typeSelections && Object.keys(item.typeSelections).length
          ? ' (' + Object.entries(item.typeSelections).map(([k, v]) => k + ': ' + v).join(', ') + ')'
          : '';
        return `<div><a href="#" class="item-link" data-item-id="${escHtml(item.itemId)}">${escHtml(item.name || item.itemId.substring(0, 8))}</a>${types} x${qty} $${(price * qty).toFixed(2)}</div>`;
      }).join('');
    }
    const qty = itemData.quantity || 1;
    const types = itemData.typeSelections && Object.keys(itemData.typeSelections).length
      ? ' (' + Object.entries(itemData.typeSelections).map(([k, v]) => k + ': ' + v).join(', ') + ')'
      : '';
    return `<a href="#" class="item-link" data-item-id="${escHtml(o.item_id)}">${escHtml(o.item_id.substring(0, 8))}</a>${types} x${qty}`;
  }

  if (gridViewOrders) {
    if (orders.length === 0) { grid.innerHTML = ''; empty.style.display = ''; ['view-orders-grid-pagination','view-orders-grid-pagination-top'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }); return; }
    empty.style.display = 'none';
    const pgnHtml = renderPagination(currentOrdersPage, totalOrdersItems, PAGE_SIZE, 'orders');
    grid.innerHTML = orders.map(o => {
      const d = fd(o);
      const pay = payLabels[d.payment] || d.payment || '';
      const status = o.status || 'pending';
      const statusClass = ['pending','processing','shipped','delivered','cancelled'].includes(status) ? status : 'pending';
      return `<div class="card" data-action="view-order" data-id="${o.id}"><div class="card-key">العميل</div><div class="card-val">${escHtml(d.name || o.client_name || '')}</div><div class="card-key">المجموع</div><div class="card-val">$${calcOrderTotal(o).toFixed(2)}</div><div class="card-key">الحالة</div><div class="card-val"><span class="status-badge ${statusClass}">${STATUS_DISPLAY[status] || status}</span></div><div class="card-key">التاريخ</div><div class="card-val">${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</div><div class="card-actions"><button class="btn small" data-action="status-order" data-id="${o.id}">الحالة</button> <button class="btn small danger" data-action="delete-order" data-id="${o.id}">حذف</button></div></div>`;
    }).join('');
    ['view-orders-grid-pagination','view-orders-grid-pagination-top'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = pgnHtml;
    });
    return;
  }

  const tbody = document.getElementById('orders-body');
  if (orders.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    ['view-orders-pagination','view-orders-pagination-top'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    return;
  }
  empty.style.display = 'none';
  const pgnHtml = renderPagination(currentOrdersPage, totalOrdersItems, PAGE_SIZE, 'orders');
  tbody.innerHTML = orders.map(o => {
    const d = fd(o);
    const status = o.status || 'pending';
    const statusClass = ['pending','processing','shipped','delivered','cancelled'].includes(status) ? status : 'pending';
    const delivery = escHtml(d.delivery_company || d.address || d.city || '');
    return `<tr data-action="view-order" data-id="${o.id}">
      <td><a href="#" class="order-link" data-id="${o.id}">${escHtml(d.name || o.client_name || '')}</a></td>
      <td>$${calcOrderTotal(o).toFixed(2)}</td>
      <td><span class="status-badge ${statusClass}">${STATUS_DISPLAY[status] || status}</span></td>
      <td>${delivery}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</td>
      <td class="actions"><button class="btn small" data-action="status-order" data-id="${o.id}">الحالة</button> <button class="btn small danger" data-action="delete-order" data-id="${o.id}">حذف</button></td>
    </tr>`;
  }).join('');
  ['view-orders-pagination','view-orders-pagination-top'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = pgnHtml;
  });
  ['view-orders-grid-pagination','view-orders-grid-pagination-top'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = pgnHtml;
  });
}

async function deleteOrder(id) {
  if (!confirm('حذف هذا الطلب؟')) return;
  const res = await fetch(`${API}/orders/${id}`, { method: 'DELETE' });
  if (!res.ok) { const err = await res.json(); showToast(err.error || 'فشل الحذف', 'error'); return; }
  showToast('تم حذف الطلب', 'success');
  cachedOrders = cachedOrders.filter(o => o.id !== id);
  renderOrdersView();
}

function renderPagination(currentPage, totalItems, pageSize, loadFn) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return '';
  let html = '<div class="pagination" style="display:flex;gap:0.25rem;align-items:center;flex-wrap:wrap">';
  if (currentPage > 1) html += `<button class="btn small" data-page="1" data-load="${loadFn}">&laquo;</button>`;
  if (currentPage > 1) html += `<button class="btn small" data-page="${currentPage - 1}" data-load="${loadFn}">السابق</button>`;
  // Page number buttons
  const maxVisible = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  if (startPage > 1) html += '<span style="font-size:0.8rem;color:#888">…</span>';
  for (let i = startPage; i <= endPage; i++) {
    if (i === currentPage) {
      html += `<span class="page-num active" style="padding:2px 8px;border-radius:3px;background:#3498db;color:#fff;font-size:0.8rem;font-weight:600">${i}</span>`;
    } else {
      html += `<button class="btn small page-num" data-page="${i}" data-load="${loadFn}" style="min-width:28px;padding:2px 6px;font-size:0.8rem">${i}</button>`;
    }
  }
  if (endPage < totalPages) html += '<span style="font-size:0.8rem;color:#888">…</span>';
  if (currentPage < totalPages) html += `<button class="btn small" data-page="${currentPage + 1}" data-load="${loadFn}">التالي</button>`;
  if (currentPage < totalPages) html += `<button class="btn small" data-page="${totalPages}" data-load="${loadFn}">&raquo;</button>`;
  html += '</div>';
  return html;
}

document.addEventListener('click', e => {
  const pageBtn = e.target.closest('[data-page]');
  if (!pageBtn) return;
  const page = parseInt(pageBtn.dataset.page);
  const loadFn = pageBtn.dataset.load;
  if (loadFn === 'data') loadItems(page);
  else if (loadFn === 'orders') loadOrders(page);
  else if (loadFn === 'storage') { currentStoragePage = page; renderStorageView(); }
  else if (loadFn === 'gallery') { currentGalleryPage = page; renderGalleryView(); }
  else if (loadFn === 'news') { currentNewsPage = page; renderNewsView(); }
});

document.getElementById('btn-refresh-orders').onclick = () => { loadOrders(); showToast('تم تحديث الطلبات', 'info'); };
document.getElementById('btn-toggle-orders').onclick = () => { gridViewOrders = !gridViewOrders; document.getElementById('btn-toggle-orders').textContent = gridViewOrders ? 'عرض جدول' : 'عرض شبكي'; renderOrdersView(); };

/* --- Toast --- */

function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast-msg ' + (type || 'info');
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

/* --- Status Indicators --- */

async function checkStatus() {
  const res = await fetch(`${API}/status`);
  if (res.status === 401) return;
  const s = await res.json();
  const setDot = (id, cls) => { const d = document.getElementById('dot-' + id); if (d) { d.className = 'status-dot ' + cls; d.title = id + ': ' + cls; } };
  setDot('server', s.server);
  setDot('db', s.db);
  setDot('storage', s.storage);
  setDot('cache', s.cache ? 'yes' : 'no');
}

checkStatus();
setTimeout(() => showSnapshotUrl(document.querySelector('.tab.active')?.dataset?.tab || 'data'), 500);

/* --- Image Compression --- */

function compressImage(file, maxBytes) {
  return new Promise((resolve) => {
    if (file.size <= maxBytes) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      let q = 0.8;
      const tryCompress = () => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(blob => {
          if (blob.size <= maxBytes || q <= 0.1) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            q -= 0.15;
            w = Math.round(w * 0.8);
            h = Math.round(h * 0.8);
            tryCompress();
          }
        }, 'image/jpeg', q);
      };
      tryCompress();
    };
    img.src = url;
  });
}

/* --- Storage --- */

async function loadStorage(force) {
  if (!force && storageCache.data && Date.now() - storageCache.ts < STORAGE_CACHE_TTL) {
    cachedStorage = storageCache.data;
    renderStorageView();
    return;
  }
  const res = await fetch(`${API}/storage`);
  if (res.status === 401) { showLogin(); return; }
  cachedStorage = await res.json();
  storageCache = { ts: Date.now(), data: cachedStorage };
  currentStoragePage = 1;
  updateItemCount('storage');
  renderStorageView();
}

function renderStoragePagination() {
  const totalPages = Math.ceil(cachedStorage.length / PAGE_SIZE);
  if (totalPages <= 1) return '';
  let html = '<div class="pagination" style="display:flex;gap:0.25rem;align-items:center;margin-top:0.5rem">';
  if (currentStoragePage > 1) html += `<button class="btn small" data-page="${currentStoragePage - 1}" data-load="storage">السابق</button>`;
  html += `<span style="font-size:0.85rem;margin:0 0.5rem">الصفحة ${currentStoragePage} من ${totalPages}</span>`;
  if (currentStoragePage < totalPages) html += `<button class="btn small" data-page="${currentStoragePage + 1}" data-load="storage">التالي</button>`;
  html += '</div>';
  return html;
}

function renderStorageView() {
  const images = cachedStorage;
  const empty = document.getElementById('storage-empty');
  const tableWrap = document.getElementById('view-storage-table');
  const grid = document.getElementById('view-storage-grid');
  tableWrap.classList.toggle('hidden', gridViewStorage);
  grid.classList.toggle('hidden', !gridViewStorage);
  const topStoragePg = document.getElementById('view-storage-pagination-top');
  const topStorageGridPg = document.getElementById('view-storage-grid-pagination-top');
  if (topStoragePg) topStoragePg.style.display = gridViewStorage ? 'none' : '';
  if (topStorageGridPg) topStorageGridPg.style.display = gridViewStorage ? '' : 'none';

  const start = (currentStoragePage - 1) * PAGE_SIZE;
  const pageImages = images.slice(start, start + PAGE_SIZE);

  function setStorageBoth(ids, html) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
  }

  const pgnHtmlStorage = renderStoragePagination();

  if (gridViewStorage) {
    if (images.length === 0) { grid.innerHTML = ''; empty.style.display = ''; setStorageBoth(['view-storage-grid-pagination','view-storage-grid-pagination-top'], ''); return; }
    empty.style.display = 'none';
    grid.innerHTML = pageImages.map(img =>
      `<div class="card card-storage"><img src="${escHtml(img.url)}" alt="" class="card-thumb" data-action="view-image" data-url="${escHtml(img.url)}"><div class="card-key">الملف</div><div class="card-val" style="word-break:break-all;font-size:0.75rem">${escHtml(img.name)}</div><div class="card-key">الحجم</div><div class="card-val">${(img.size / 1024).toFixed(1)} KB</div><div class="card-key">مرتبط</div><div class="card-val">${img.linked ? 'نعم' : 'لا'}</div><div class="card-actions"><button class="btn small" data-action="copy-url" data-url="${escHtml(img.url)}">نسخ الرابط</button> <button class="btn small" data-action="view-image" data-url="${escHtml(img.url)}">عرض</button> <button class="btn small danger" data-action="delete-image" data-name="${escHtml(img.name)}">حذف</button></div></div>`
    ).join('');
    setStorageBoth(['view-storage-grid-pagination','view-storage-grid-pagination-top'], pgnHtmlStorage);
    setStorageBoth(['view-storage-pagination','view-storage-pagination-top'], '');
    return;
  }

  const tbody = document.getElementById('storage-body');
  if (images.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    setStorageBoth(['view-storage-pagination','view-storage-pagination-top'], '');
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = pageImages.map(img => `
    <tr>
      <td>${escHtml(img.name)}</td>
      <td>${(img.size / 1024).toFixed(1)} KB</td>
      <td>${img.linked ? 'نعم' : 'لا'}</td>
      <td>${img.created_at ? new Date(img.created_at).toLocaleString() : ''}</td>
      <td class="actions">
        <button class="btn small" data-action="copy-url" data-url="${escHtml(img.url)}">نسخ الرابط</button>
        <button class="btn small" data-action="view-image" data-url="${escHtml(img.url)}">عرض</button>
        <button class="btn small danger" data-action="delete-image" data-name="${escHtml(img.name)}">حذف</button>
      </td>
    </tr>
  `).join('');
  setStorageBoth(['view-storage-pagination','view-storage-pagination-top'], pgnHtmlStorage);
  setStorageBoth(['view-storage-grid-pagination','view-storage-grid-pagination-top'], '');
}

async function deleteStorageImage(name) {
  if (!confirm('حذف هذه الصورة من التخزين؟')) return;
  const res = await fetch(`${API}/storage/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) { const err = await res.json(); showToast(err.error || 'فشل الحذف', 'error'); return; }
  showToast('تم حذف الصورة', 'success');
  storageCache.ts = 0;
  cachedStorage = cachedStorage.filter(img => img.name !== name);
  renderStorageView();
}

document.getElementById('btn-refresh-storage').onclick = loadStorage;
document.getElementById('btn-upload-storage').onclick = () => document.getElementById('storage-file-input').click();
document.getElementById('storage-file-input').onchange = async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  storageCache.ts = 0;
  const btn = document.getElementById('btn-upload-storage');
  btn.disabled = true;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    btn.textContent = `جارٍ الضغط ${i + 1}/${files.length}...`;
    const compressed = await compressImage(file, 200 * 1024);
    btn.textContent = `جارٍ الرفع ${i + 1}/${files.length}...`;
    const fd = new FormData();
    fd.append('image', compressed);
    const res = await fetch(`${API}/upload-file`, { method: 'POST', body: fd });
    if (!res.ok) { showToast(`فشل الرفع: ${file.name}`, 'error'); continue; }
  }
  btn.disabled = false; btn.textContent = 'رفع';
  e.target.value = '';
  showToast('تم رفع جميع الصور', 'success');
  loadStorage(true);
};
document.getElementById('btn-toggle-storage').onclick = () => { gridViewStorage = !gridViewStorage; document.getElementById('btn-toggle-storage').textContent = gridViewStorage ? 'عرض جدول' : 'عرض شبكي'; renderStorageView(); };
document.getElementById('btn-toggle-gallery').onclick = () => { gridViewGallery = !gridViewGallery; document.getElementById('btn-toggle-gallery').textContent = gridViewGallery ? 'عرض جدول' : 'عرض شبكي'; renderGalleryView(); };
document.getElementById('btn-toggle-news').onclick = () => { gridViewNews = !gridViewNews; document.getElementById('btn-toggle-news').textContent = gridViewNews ? 'عرض جدول' : 'عرض شبكي'; renderNewsView(); };

/* --- Snapshot URLs --- */

const SNAPSHOT_ENDPOINTS = {
  dashboard: null,
  analytics: null,
  data: '/snapshot-url',
  storage: '/snapshot-url',
  gallery: '/snapshot-url/gallery',
  news: '/snapshot-url/news',
  about: '/snapshot-url/about',
  settings: null
};

async function showSnapshotUrl(tabName) {
  const el = document.getElementById('snapshot-url-' + tabName);
  if (!el) return;
  const endpoint = SNAPSHOT_ENDPOINTS[tabName];
  if (!endpoint) { el.style.display = 'none'; return; }
  try {
    const res = await fetch(endpoint);
    if (!res.ok) { el.style.display = 'none'; return; }
    const { url } = await res.json();
    if (url) {
      el.innerHTML = `الرابط: <a href="${escHtml(url)}" target="_blank">${escHtml(url)}</a>`;
      el.style.display = 'inline';
    } else {
      el.style.display = 'none';
    }
  } catch {
    el.style.display = 'none';
  }
}

/* --- Tabs --- */

function updateItemCount(name) {
  const el = document.getElementById('item-count');
  const counts = { dashboard: '', analytics: '', data: (dataSearchQuery ? filterData(cachedAllData, dataSearchQuery).length : totalDataItems) + ' عناصر', orders: totalOrdersItems + ' طلبات', storage: cachedStorage.length + ' صور', gallery: cachedGallery.length + ' صور', news: cachedNews.length + ' مقالات', about: '', settings: '' };
  el.textContent = counts[name] || '';
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-side-menu .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    ['dashboard','analytics','data','orders','storage','gallery','news','about','settings'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('hidden', name !== t);
    });
    updateItemCount(name);
    showSnapshotUrl(name);
    document.getElementById('order-modal')?.classList.add('hidden');
    if (name === 'dashboard') loadDashboard();
    if (name === 'analytics') loadAnalytics();
    if (name === 'orders') loadOrders();
    if (name === 'storage') loadStorage();
    if (name === 'gallery') loadGalleryAdmin();
    if (name === 'news') loadNewsAdmin();
    if (name === 'about') loadAboutAdmin();
    if (name === 'settings') loadSettingsAdmin();
  };
});

/* --- Mobile Side Menu --- */

document.getElementById('menu-toggle').onclick = function() {
  const existing = document.querySelector('.admin-side-menu');
  if (existing) { existing.classList.add('open'); document.querySelector('.admin-side-overlay').classList.add('show'); return; }
  const side = document.createElement('div');
  side.className = 'admin-side-menu';
  side.innerHTML = '<button class="admin-side-close">&times;</button><h2>القائمة</h2>';
  document.querySelectorAll('.tab').forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.classList.contains('active') ? ' active' : '');
    btn.textContent = t.textContent;
    btn.dataset.tab = t.dataset.tab;
    btn.onclick = () => {
      document.querySelector('.tab[data-tab="' + btn.dataset.tab + '"]').click();
      side.classList.remove('open');
      document.querySelector('.admin-side-overlay').classList.remove('show');
    };
    side.appendChild(btn);
  });
  document.body.appendChild(side);
  const overlay = document.createElement('div');
  overlay.className = 'admin-side-overlay show';
  overlay.onclick = () => { side.classList.remove('open'); overlay.classList.remove('show'); };
  document.body.appendChild(overlay);
  side.querySelector('.admin-side-close').onclick = () => { side.classList.remove('open'); overlay.classList.remove('show'); };
  setTimeout(() => side.classList.add('open'), 10);
};

/* --- Lightbox --- */

function openLightbox(url) {
  document.getElementById('lightbox-image').src = url;
  document.getElementById('lightbox').classList.remove('hidden');
}

document.getElementById('lightbox').onclick = (e) => {
  if (e.target === e.currentTarget) document.getElementById('lightbox').classList.add('hidden');
};

document.getElementById('btn-item-view-close').onclick = () => document.getElementById('item-view-modal').classList.add('hidden');
document.getElementById('item-view-modal').querySelector('.modal-backdrop').onclick = () => document.getElementById('item-view-modal').classList.add('hidden');
document.getElementById('item-view-content').addEventListener('click', e => {
  const img = e.target.closest('img[data-action="view-image"]');
  if (img) { e.preventDefault(); openLightbox(img.dataset.url); }
});

function isImageUrl(val) {
  return typeof val === 'string' && (val.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i) || val.includes('/storage/'));
}

function renderCell(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    const items = val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v));
    return esc(items.join(', '));
  }
  if (typeof val === 'object') return esc(JSON.stringify(val));
  const s = String(val);
  if (isImageUrl(s)) return `<a href="#" data-action="view-image" data-url="${esc(s)}">${esc(s.substring(0, 50))}</a>`;
  return esc(s);
}

/* --- Gallery --- */

function renderGallery() {
  const container = document.getElementById('gallery-thumbs');
  if (galleryUrls.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = galleryUrls.map((url, i) =>
    `<div class="gallery-thumb"><img src="${escHtml(url)}" alt="" data-action="view-image" data-url="${escHtml(url)}"><button type="button" class="btn-remove" data-index="${i}">&times;</button></div>`
  ).join('');
  container.querySelectorAll('.btn-remove').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); galleryUrls.splice(parseInt(el.dataset.index), 1); renderGallery(); };
  });
  container.querySelectorAll('img').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); openLightbox(el.dataset.url); };
  });
}

function showGallery() {
  document.getElementById('modal-gallery-section').classList.remove('hidden');
  renderGallery();
}

function hideGallery() {
  document.getElementById('modal-gallery-section').classList.add('hidden');
}

document.getElementById('btn-modal-gallery-add').onclick = () => {
  pickerCallback = (url) => { galleryUrls.push(url); renderGallery(); };
  pickerMultiSelect = true;
  openPicker();
};

document.getElementById('gallery-file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const compressed = await compressImage(file, 200 * 1024);
  const fd = new FormData();
  fd.append('image', compressed);
  const res = await fetch(`${API}/upload-file`, { method: 'POST', body: fd });
  if (!res.ok) { showToast('فشل رفع الصورة إلى المعرض', 'error'); return; }
  const { url } = await res.json();
  if (pickerMultiSelect) {
    galleryUrls.push(url);
    renderGallery();
    showToast('تمت إضافة الصورة إلى المعرض', 'success');
  } else if (pickerCallback) {
    document.getElementById('picker-modal').classList.add('hidden');
    pickerCallback(url);
  } else {
    showToast('تم رفع الصورة إلى التخزين', 'success');
  }
};

/* --- Storage Picker --- */

function openPicker() {
  const grid = document.getElementById('picker-grid');
  const empty = document.getElementById('picker-empty');
  grid.innerHTML = '<p style="text-align:center;padding:1rem;color:#999">جارٍ التحميل...</p>';
  empty.style.display = 'none';
  document.getElementById('picker-modal').classList.remove('hidden');
  const resolve = (images) => {
    const unlinked = images.filter(i => !i.linked);
    if (unlinked.length === 0) {
      grid.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    const isMainPicker = pickerForMainImage;
    pickerForMainImage = false;
    grid.innerHTML = unlinked.map(img => {
      const selected = pickerMultiSelect && galleryUrls.includes(img.url);
      return `<img src="${escHtml(img.url)}" data-url="${escHtml(img.url)}" title="${escHtml(img.name)}" class="${selected ? 'picker-selected' : ''}">`;
    }).join('');
    grid.querySelectorAll('img').forEach(el => {
      el.onclick = () => {
        if (pickerMultiSelect) {
          const url = el.dataset.url;
          const idx = galleryUrls.indexOf(url);
          if (idx === -1) {
            galleryUrls.push(url);
          } else {
            galleryUrls.splice(idx, 1);
          }
          renderGallery();
          openPicker();
          return;
        }
        if (isMainPicker) {
          document.getElementById('pf-mainImage').value = el.dataset.url;
          document.getElementById('picker-modal').classList.add('hidden');
          return;
        }
        if (pickerCallback) {
          pickerCallback(el.dataset.url);
          document.getElementById('picker-modal').classList.add('hidden');
          return;
        }
        document.getElementById('picker-modal').classList.add('hidden');
        document.getElementById('pf-mainImage').value = el.dataset.url;
      };
    });
  };
  if (storageCache.data && Date.now() - storageCache.ts < STORAGE_CACHE_TTL) {
    resolve(storageCache.data);
  } else {
    fetch(`${API}/storage`).then(r => r.json()).then(images => {
      storageCache = { ts: Date.now(), data: images };
      resolve(images);
    });
  }
}

document.getElementById('btn-picker-cancel').onclick = () => { document.getElementById('picker-modal').classList.add('hidden'); pickerCallback = null; pickerForMainImage = false; pickerMultiSelect = false; };
document.getElementById('picker-modal').querySelector('.modal-backdrop').onclick = () => { document.getElementById('picker-modal').classList.add('hidden'); pickerCallback = null; pickerForMainImage = false; pickerMultiSelect = false; };
document.getElementById('btn-picker-upload').onclick = () => {
  document.getElementById('picker-modal').classList.add('hidden');
  if (pickerCallback) {
    document.getElementById('gallery-file-input').click();
  } else {
    document.getElementById('storage-file-input').click();
  }
};

/* --- Event delegation --- */

document.getElementById('view-data-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    if (btn.dataset.action === 'edit') editItem(btn.dataset.id);
    if (btn.dataset.action === 'duplicate') duplicateItem(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteItem(btn.dataset.id);
    return;
  }
  const card = e.target.closest('.card[data-action="edit"]');
  if (card) { editItem(card.dataset.id); return; }
  const link = e.target.closest('a[data-action]');
  if (link && link.dataset.action === 'view-image') { e.preventDefault(); openLightbox(link.dataset.url); }
});

document.getElementById('view-orders-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    if (btn.dataset.action === 'delete-order') deleteOrder(btn.dataset.id);
    return;
  }
  const link = e.target.closest('a.item-link');
  if (link) { e.preventDefault(); viewItem(link.dataset.itemId); }
});

document.getElementById('view-storage-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  const link = e.target.closest('img[data-action]');
  if (btn) {
    if (btn.dataset.action === 'copy-url') { navigator.clipboard.writeText(btn.dataset.url); showToast('تم نسخ الرابط إلى الحافظة', 'success'); }
    if (btn.dataset.action === 'delete-image') deleteStorageImage(btn.dataset.name);
    if (btn.dataset.action === 'view-image') openLightbox(btn.dataset.url);
    return;
  }
  if (link && link.dataset.action === 'view-image') openLightbox(link.dataset.url);
});

document.getElementById('table-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    if (btn.dataset.action === 'edit') editItem(btn.dataset.id);
    if (btn.dataset.action === 'duplicate') duplicateItem(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteItem(btn.dataset.id);
    return;
  }
  const row = e.target.closest('tr[data-action="edit"]');
  if (row) { editItem(row.dataset.id); return; }
  const link = e.target.closest('a[data-action]');
  if (link && link.dataset.action === 'view-image') { e.preventDefault(); openLightbox(link.dataset.url); }
});

document.getElementById('orders-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    if (btn.dataset.action === 'delete-order') deleteOrder(btn.dataset.id);
    return;
  }
  const link = e.target.closest('a.item-link');
  if (link) { e.preventDefault(); viewItem(link.dataset.itemId); }
});

async function updateOrderStatus(orderId, status) {
  const res = await fetch(`${API}/orders/${orderId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  if (!res.ok) { showToast('فشل تحديث الحالة', 'error'); return; }
  showToast('تم تحديث الحالة', 'success');
  const order = cachedOrders.find(o => o.id === orderId);
  if (order) order.status = status;
}

// Status popup
let statusPopup = null;
function ensureStatusPopup() {
  if (statusPopup) return;
  statusPopup = document.createElement('div');
  statusPopup.id = 'status-popup';
  statusPopup.className = 'status-popup hidden';
  statusPopup.innerHTML = '<div class="status-popup-inner"><strong style="display:block;margin-bottom:6px">تغيير الحالة</strong><div class="status-options"></div><button class="btn small" id="status-popup-cancel">إلغاء</button></div>';
  document.body.appendChild(statusPopup);
  statusPopup.addEventListener('click', e => {
    const opt = e.target.closest('[data-sopt]');
    if (!opt) return;
    const oid = statusPopup.dataset.oid;
    const st = opt.dataset.sopt;
    statusPopup.classList.add('hidden');
    updateOrderStatus(oid, st).then(() => renderOrdersView());
  });
  document.getElementById('status-popup-cancel').onclick = () => statusPopup.classList.add('hidden');
}

document.addEventListener('click', e => {
  const viewBtn = e.target.closest('.order-link, [data-action="view-order"]');
  if (viewBtn && !e.target.closest('button')) {
    e.preventDefault();
    viewOrder(viewBtn.dataset.id);
    return;
  }
  const btn = e.target.closest('[data-action="status-order"]');
  if (!btn) {
    if (statusPopup && !statusPopup.classList.contains('hidden') && !e.target.closest('#status-popup')) {
      statusPopup.classList.add('hidden');
    }
    return;
  }
  e.stopPropagation();
  ensureStatusPopup();
  const oid = btn.dataset.id;
  const order = cachedOrders.find(o => o.id === oid);
  const currentStatus = (order && order.status) || 'pending';
  const statuses = ['pending','processing','shipped','delivered','cancelled'];
  statusPopup.dataset.oid = oid;
  statusPopup.querySelector('.status-options').innerHTML = statuses.map(s =>
    `<button class="status-opt-btn${s === currentStatus ? ' active' : ''}" data-sopt="${s}">${STATUS_DISPLAY[s] || s}</button>`
  ).join('');
  const rect = btn.getBoundingClientRect();
  statusPopup.style.left = Math.max(0, rect.left - 10) + 'px';
  statusPopup.style.top = (rect.bottom + 4) + 'px';
  statusPopup.classList.remove('hidden');
});

document.getElementById('order-search')?.addEventListener('input', renderOrdersView);

/* --- Data Sort & Search --- */
document.getElementById('btn-sort-data')?.addEventListener('click', () => {
  dataSortDir = dataSortDir === 'desc' ? 'asc' : 'desc';
  document.getElementById('btn-sort-data').textContent = dataSortDir === 'desc' ? '↓ ترتيب' : '↑ ترتيب';
  currentDataPage = 1;
  loadItems(1, dataSortDir);
});
document.getElementById('data-search')?.addEventListener('input', function() {
  dataSearchQuery = this.value.trim();
  currentDataPage = 1;
  if (dataSearchQuery && cachedAllData.length === 0) {
    loadAllData();
  } else if (dataSearchQuery) {
    loadItems(1);
  } else {
    loadItems(1);
  }
});

/* --- Order Detail Modal --- */

function viewOrder(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) { showToast('الطلب غير موجود', 'error'); return; }
  renderOrderModal(order);
  document.getElementById('order-modal').classList.remove('hidden');
}

function renderOrderModal(order) {
  const d = order.item_data || {};
  const fd = d.formData || d;
  const payLabels = { '1': 'الدفع عند الاستلام', '2': 'عبر رمز QR', '3': 'عبر رمز التطبيق' };
  const status = order.status || 'pending';
  const statuses = ['pending','processing','shipped','delivered','cancelled'];

  let itemsHtml = '';
  if (d.items && Array.isArray(d.items)) {
    itemsHtml = d.items.map(item => {
      const qty = item.quantity || 1;
      const price = parseFloat(item.price) || 0;
      const types = item.typeSelections && Object.keys(item.typeSelections).length
        ? ' (' + Object.entries(item.typeSelections).map(([k, v]) => k + ': ' + v).join(', ') + ')'
        : '';
      return `<div style="padding:0.25rem 0">${escHtml(item.name || item.itemId)}${types} x${qty} - $${(price * qty).toFixed(2)}</div>`;
    }).join('');
  } else {
    const qty = d.quantity || 1;
    const price = parseFloat(fd.price) || 0;
    const total = price * qty;
    itemsHtml = `<div>معرف العنصر: ${escHtml(order.item_id)} x${qty} - $${total.toFixed(2)}</div>`;
  }

  let total = d.cartTotal || d.items?.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.quantity || 1), 0) || 0;

  document.getElementById('order-modal-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
      <div><strong>العميل:</strong> ${escHtml(fd.name || order.client_name || 'غير متوفر')}</div>
      <div><strong>التاريخ:</strong> ${order.created_at ? new Date(order.created_at).toLocaleString() : 'غير متوفر'}</div>
      <div><strong>الهاتف:</strong> ${escHtml(fd.phone || 'غير متوفر')}</div>
      <div><strong>الحالة:</strong> <span class="status-badge ${status}">${STATUS_DISPLAY[status] || status}</span></div>
      <div><strong>البريد الإلكتروني:</strong> ${escHtml(fd.email || 'غير متوفر')}</div>
      <div><strong>الدفع:</strong> ${payLabels[fd.payment] || fd.payment || 'غير متوفر'}</div>
      <div><strong>العنوان:</strong> ${escHtml(fd.address || 'غير متوفر')}</div>
      <div><strong>المدينة:</strong> ${escHtml(fd.city || 'غير متوفر')}</div>
      <div><strong>التوصيل:</strong> ${escHtml(fd.delivery_company || 'غير متوفر')}</div>
    </div>
    <div style="margin-bottom:1rem">
      <strong>العناصر:</strong>
      <div style="margin-top:0.25rem;font-size:0.9rem">${itemsHtml}</div>
      <div style="margin-top:0.5rem;font-weight:600">المجموع: $${parseFloat(total).toFixed(2)}</div>
    </div>
    <div style="margin-bottom:1rem">
      <strong>الحالة:</strong>
      <div style="margin-top:0.25rem;display:flex;gap:0.25rem;flex-wrap:wrap">
        ${statuses.map(s => `<button class="btn small${s === status ? ' active' : ''}" onclick="changeOrderStatus('${order.id}','${s}')">${STATUS_DISPLAY[s] || s}</button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:1rem">
      <strong>ملاحظات:</strong>
      <textarea id="order-notes-input" rows="3" style="width:100%;margin-top:0.25rem;padding:0.4rem;border:1px solid #ccc;border-radius:4px;font-size:0.85rem">${escHtml(order.notes || '')}</textarea>
      <button class="btn small" style="margin-top:0.25rem" onclick="saveOrderNotes('${order.id}')">حفظ الملاحظات</button>
    </div>
  `;
}

async function changeOrderStatus(orderId, status) {
  await updateOrderStatus(orderId, status);
  renderOrderModal(cachedOrders.find(o => o.id === orderId));
}

async function saveOrderNotes(orderId) {
  const notes = document.getElementById('order-notes-input').value;
  const res = await fetch(`${API}/orders/${orderId}/notes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
  if (!res.ok) { showToast('فشل حفظ الملاحظات', 'error'); return; }
  showToast('تم حفظ الملاحظات', 'success');
  const order = cachedOrders.find(o => o.id === orderId);
  if (order) order.notes = notes;
}

document.getElementById('btn-order-modal-close').onclick = () => document.getElementById('order-modal').classList.add('hidden');
document.getElementById('order-modal').querySelector('.modal-backdrop').onclick = () => document.getElementById('order-modal').classList.add('hidden');

/* --- Dashboard --- */

async function loadDashboard() {
  if (cachedItems.length === 0) await loadItems();
  if (cachedOrders.length === 0) await loadOrders();
  renderDashboard();
}

function renderDashboard() {
  const totalProducts = totalDataItems;
  const totalOrders = cachedOrders.length;
  const totalRevenue = cachedOrders.reduce((sum, o) => {
    const itemData = o.item_data || {};
    if (itemData.cartTotal != null) return sum + parseFloat(itemData.cartTotal) || 0;
    if (itemData.items && Array.isArray(itemData.items)) return sum + itemData.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.quantity || 1), 0);
    return sum;
  }, 0);
  const lowStockItems = cachedItems.filter(i => i.quantity && i.stock != null && i.stock <= 5);

  const container = document.getElementById('dashboard-cards');
  container.innerHTML = `
    <div class="dashboard-card"><div class="card-value">${totalProducts}</div><div class="card-label">المنتجات</div></div>
    <div class="dashboard-card"><div class="card-value">${totalOrders}</div><div class="card-label">الطلبات</div></div>
    <div class="dashboard-card"><div class="card-value">$${totalRevenue.toFixed(2)}</div><div class="card-label">الإيرادات</div></div>
    <div class="dashboard-card ${lowStockItems.length > 0 ? 'card-warning' : ''}"><div class="card-value">${lowStockItems.length}</div><div class="card-label">مخزون منخفض</div></div>
  `;

  const recent = document.getElementById('dashboard-recent-list');
  const recentOrders = [...cachedOrders].slice(0, 10);
  if (recentOrders.length === 0) {
    recent.innerHTML = '<p class="empty">لا توجد طلبات بعد.</p>';
    return;
  }
  recent.innerHTML = recentOrders.map(o => {
    const d = o.item_data || {};
    const fd = d.formData || d;
    const total = d.cartTotal != null ? parseFloat(d.cartTotal) || 0 : 0;
    return `<div class="recent-order"><span class="ro-customer">${escHtml(fd.name || o.client_name || 'غير معروف')}</span><span class="ro-total">$${total.toFixed(2)}</span><span class="ro-date">${o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</span></div>`;
  }).join('');
}

document.getElementById('btn-refresh-dashboard').onclick = () => { loadDashboard(); showToast('تم تحديث لوحة التحكم', 'info'); };

/* --- Analytics --- */

async function loadAnalytics() {
  const res = await fetch(`${API}/analytics`);
  if (!res.ok) return;
  const data = await res.json();
  renderAnalytics(data);
}

function renderAnalytics(data) {
  const days = Object.keys(data.dailyRevenue).sort();
  const maxRev = Math.max(...Object.values(data.dailyRevenue), 1);

  let dailyHtml = days.map(day => {
    const rev = data.dailyRevenue[day];
    const pct = (rev / maxRev) * 100;
    return `<div style="display:flex;align-items:center;margin-bottom:0.2rem;font-size:0.8rem">
      <span style="width:100px;flex-shrink:0">${day}</span>
      <div style="flex:1;height:20px;background:#eee;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:#3498db;border-radius:3px"></div>
      </div>
      <span style="width:80px;text-align:right;flex-shrink:0">$${rev.toFixed(2)}</span>
    </div>`;
  }).join('');

  let topHtml = data.topProducts.map(([id, p]) =>
    `<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.2rem 0;border-bottom:1px solid #eee">
      <span>${escHtml(p.name.substring(0, 40))}</span>
      <span>${p.qty} مباع - $${p.revenue.toFixed(2)}</span>
    </div>`
  ).join('');

  const total = data.totalOrders || 1;
  const statusLabels = { pending: 'قيد الانتظار', processing: 'قيد المعالجة', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  const statusColors = { pending: '#f39c12', processing: '#3498db', shipped: '#9b59b6', delivered: '#2ecc71', cancelled: '#e74c3c' };
  let statusHtml = Object.entries(data.statusCounts).map(([s, count]) => {
    const pct = (count / total) * 100;
    if (count === 0) return '';
    return `<div style="display:flex;align-items:center;margin-bottom:0.2rem;font-size:0.8rem">
      <span style="width:90px;flex-shrink:0">${statusLabels[s]}</span>
      <div style="flex:1;height:20px;background:#eee;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${statusColors[s]};border-radius:3px"></div>
      </div>
      <span style="width:60px;text-align:right;flex-shrink:0">${count}</span>
    </div>`;
  }).join('');

  document.getElementById('analytics-content').innerHTML = `
    <div class="dashboard-cards" style="margin-bottom:1rem">
      <div class="dashboard-card"><div class="card-value">${data.totalOrders}</div><div class="card-label">إجمالي الطلبات</div></div>
      <div class="dashboard-card"><div class="card-value">$${data.totalRevenue.toFixed(2)}</div><div class="card-label">إجمالي الإيرادات</div></div>
      <div class="dashboard-card"><div class="card-value">${data.topProducts.length > 0 ? data.topProducts[0][1].name.substring(0, 20) : 'غير متوفر'}</div><div class="card-label">أفضل منتج</div></div>
    </div>
    <div class="dashboard-section">
      <h3>الإيرادات اليومية</h3>
      <div style="margin-top:0.5rem">${dailyHtml || '<p class="empty">No data</p>'}</div>
    </div>
    <div class="dashboard-section" style="margin-top:1rem">
      <h3>أفضل المنتجات</h3>
      <div style="margin-top:0.5rem">${topHtml || '<p class="empty">No data</p>'}</div>
    </div>
    <div class="dashboard-section" style="margin-top:1rem">
      <h3>توزيع حالات الطلبات</h3>
      <div style="margin-top:0.5rem">${statusHtml || '<p class="empty">No data</p>'}</div>
    </div>
  `;
}

document.getElementById('btn-refresh-analytics').onclick = () => { loadAnalytics(); showToast('تم تحديث الإحصائيات', 'info'); };

document.getElementById('btn-regenerate-snapshots').onclick = async () => {
  const btn = document.getElementById('btn-regenerate-snapshots');
  btn.disabled = true;
  btn.textContent = 'جارٍ إعادة الإنشاء...';
  try {
    const res = await fetch(`${API}/regenerate-snapshots`, { method: 'POST' });
    if (!res.ok) throw new Error();
    showToast('تم إعادة إنشاء جميع اللقطات', 'success');
  } catch { showToast('فشل إعادة إنشاء اللقطات', 'error'); }
  btn.disabled = false;
  btn.textContent = 'إعادة إنشاء اللقطات';
};

/* --- Data Export --- */

function exportCSV(items, filename) {
  if (!items.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const keys = [...new Set(items.flatMap(i => Object.keys(i)))].filter(k => k !== 'id');
  const rows = [keys.join(',')];
  items.forEach(item => {
    rows.push(keys.map(k => {
      const val = item[k];
      if (val == null) return '';
      const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function exportJSON(items, filename) {
  if (!items.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
  const clean = items.map(({ id, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

document.getElementById('btn-export-csv').onclick = () => exportCSV(cachedItems, 'products.csv');
document.getElementById('btn-export-json').onclick = () => exportJSON(cachedItems, 'products.json');
document.getElementById('btn-export-orders-csv').onclick = () => exportCSV(cachedOrders, 'orders.csv');
document.getElementById('btn-export-orders-json').onclick = () => exportJSON(cachedOrders, 'orders.json');

/* --- Quantity checkbox toggle stock field --- */

document.getElementById('pf-quantity').onchange = function() {
  const row = document.getElementById('pf-stock-row');
  row.style.display = this.checked ? '' : 'none';
  if (!this.checked) document.getElementById('pf-stock').value = '';
};

document.getElementById('storage-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'copy-url') { navigator.clipboard.writeText(btn.dataset.url); showToast('تم نسخ الرابط إلى الحافظة', 'success'); }
  if (btn.dataset.action === 'delete-image') deleteStorageImage(btn.dataset.name);
  if (btn.dataset.action === 'view-image') openLightbox(btn.dataset.url);
});

/* --- Gallery Admin --- */

async function loadGalleryAdmin() {
  const res = await fetch(`${API}/gallery`);
  if (res.status === 401) { showLogin(); return; }
  cachedGallery = await res.json();
  currentGalleryPage = 1;
  updateItemCount('gallery');
  renderGalleryView();
}

function renderGalleryPagination() {
  return renderPagination(currentGalleryPage, cachedGallery.length, PAGE_SIZE, 'gallery');
}

function renderGalleryView() {
  const tableWrap = document.getElementById('view-gallery-table');
  const grid = document.getElementById('view-gallery-grid');
  tableWrap.classList.toggle('hidden', gridViewGallery);
  grid.classList.toggle('hidden', !gridViewGallery);
  const topGalleryPg = document.getElementById('view-gallery-pagination-top');
  const topGalleryGridPg = document.getElementById('view-gallery-grid-pagination-top');
  if (topGalleryPg) topGalleryPg.style.display = gridViewGallery ? 'none' : '';
  if (topGalleryGridPg) topGalleryGridPg.style.display = gridViewGallery ? '' : 'none';

  const items = cachedGallery;
  const start = (currentGalleryPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const pgnHtml = renderGalleryPagination();

  function setGalleryBoth(ids, h) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = h; });
  }

  if (gridViewGallery) {
    if (items.length === 0) { grid.innerHTML = ''; setGalleryBoth(['view-gallery-grid-pagination','view-gallery-grid-pagination-top'], ''); return; }
    grid.innerHTML = pageItems.map(item =>
      `<div class="card card-storage"><img class="card-thumb" src="${escHtml(item.url)}" data-action="view-image" data-url="${escHtml(item.url)}"><div class="card-key">الرابط</div><div class="card-val" style="font-size:0.75rem;word-break:break-all">${escHtml(item.url)}</div><div class="card-key">تاريخ الإضافة</div><div class="card-val" style="font-size:0.75rem">${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</div><div class="card-actions"><button class="btn small danger" data-action="delete-gallery" data-id="${item.id}">حذف</button></div></div>`
    ).join('');
    setGalleryBoth(['view-gallery-grid-pagination','view-gallery-grid-pagination-top'], pgnHtml);
    setGalleryBoth(['view-gallery-pagination','view-gallery-pagination-top'], '');
    return;
  }

  const tbody = document.getElementById('gallery-body');
  const empty = document.getElementById('gallery-empty');
  if (items.length === 0) { tbody.innerHTML = ''; empty.style.display = ''; setGalleryBoth(['view-gallery-pagination','view-gallery-pagination-top'], ''); return; }
  empty.style.display = 'none';
  tbody.innerHTML = pageItems.map(item => `
    <tr>
      <td><img src="${escHtml(item.url)}" alt="" style="max-height:50px;border-radius:4px;cursor:pointer" data-action="view-image" data-url="${escHtml(item.url)}"></td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(item.url)}</td>
      <td>${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</td>
      <td class="actions"><button class="btn small danger" data-action="delete-gallery" data-id="${item.id}">حذف</button></td>
    </tr>
  `).join('');
  setGalleryBoth(['view-gallery-pagination','view-gallery-pagination-top'], pgnHtml);
  setGalleryBoth(['view-gallery-grid-pagination','view-gallery-grid-pagination-top'], '');
}

document.getElementById('btn-gallery-add').onclick = () => {
  pickerCallback = (url) => {
    fetch(`${API}/gallery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => { showToast('تمت إضافة الصورة إلى المعرض', 'success'); loadGalleryAdmin(); })
      .catch(() => showToast('فشل إضافة الصورة', 'error'));
  };
  openPicker();
};
document.getElementById('btn-refresh-gallery').onclick = loadGalleryAdmin;
document.getElementById('gallery-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete-gallery') {
    if (!confirm('إزالة هذه الصورة من المعرض؟')) return;
    fetch(`${API}/gallery/${btn.dataset.id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(); showToast('تمت إزالة الصورة', 'success'); loadGalleryAdmin(); })
      .catch(() => showToast('فشل إزالة الصورة', 'error'));
  }
});
document.getElementById('view-gallery-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete-gallery') {
    if (!confirm('إزالة هذه الصورة من المعرض؟')) return;
    fetch(`${API}/gallery/${btn.dataset.id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(); showToast('تمت إزالة الصورة', 'success'); loadGalleryAdmin(); })
      .catch(() => showToast('فشل إزالة الصورة', 'error'));
  }
});

/* --- News Admin --- */

let editingNewsId = null;

async function loadNewsAdmin() {
  const res = await fetch(`${API}/news`);
  if (res.status === 401) { showLogin(); return; }
  cachedNews = await res.json();
  currentNewsPage = 1;
  updateItemCount('news');
  renderNewsView();
}

function renderNewsPagination() {
  return renderPagination(currentNewsPage, cachedNews.length, PAGE_SIZE, 'news');
}

function renderNewsView() {
  const tableWrap = document.getElementById('view-news-table');
  const grid = document.getElementById('view-news-grid');
  tableWrap.classList.toggle('hidden', gridViewNews);
  grid.classList.toggle('hidden', !gridViewNews);
  const topNewsPg = document.getElementById('view-news-pagination-top');
  const topNewsGridPg = document.getElementById('view-news-grid-pagination-top');
  if (topNewsPg) topNewsPg.style.display = gridViewNews ? 'none' : '';
  if (topNewsGridPg) topNewsGridPg.style.display = gridViewNews ? '' : 'none';

  const items = cachedNews;
  const start = (currentNewsPage - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const pgnHtml = renderNewsPagination();

  function setNewsBoth(ids, h) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = h; });
  }

  if (gridViewNews) {
    if (items.length === 0) { grid.innerHTML = ''; setNewsBoth(['view-news-grid-pagination','view-news-grid-pagination-top'], ''); return; }
    grid.innerHTML = pageItems.map(item => {
      const preview = item.content ? item.content.split(/\s+/).slice(0, 8).join(' ') + (item.content.split(/\s+/).length > 8 ? '…' : '') : '';
      return `<div class="card"><div class="card-key">العنوان</div><div class="card-val" style="font-weight:600">${escHtml(item.title)}</div><div class="card-key">المحتوى</div><div class="card-val" style="font-size:0.8rem;color:#666">${escHtml(preview)}</div><div class="card-key">التاريخ</div><div class="card-val" style="font-size:0.75rem">${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</div><div class="card-actions"><button class="btn small" data-action="edit-news" data-id="${item.id}">تعديل</button> <button class="btn small danger" data-action="delete-news" data-id="${item.id}">حذف</button></div></div>`;
    }).join('');
    setNewsBoth(['view-news-grid-pagination','view-news-grid-pagination-top'], pgnHtml);
    setNewsBoth(['view-news-pagination','view-news-pagination-top'], '');
    return;
  }

  const tbody = document.getElementById('news-body');
  const empty = document.getElementById('news-empty');
  if (items.length === 0) { tbody.innerHTML = ''; empty.style.display = ''; setNewsBoth(['view-news-pagination','view-news-pagination-top'], ''); return; }
  empty.style.display = 'none';
  tbody.innerHTML = pageItems.map(item => {
    const preview = item.content ? item.content.split(/\s+/).slice(0, 5).join(' ') + (item.content.split(/\s+/).length > 5 ? '…' : '') : '';
    return `
    <tr>
      <td>${escHtml(item.title)}</td>
      <td style="max-width:200px;white-space:normal;word-break:break-word;font-size:0.8rem;color:#666">${escHtml(preview)}</td>
      <td>${item.image_url ? `<img src="${escHtml(item.image_url)}" alt="" style="max-height:50px;border-radius:4px;cursor:pointer" data-action="view-image" data-url="${escHtml(item.image_url)}">` : ''}</td>
      <td>${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</td>
      <td class="actions"><button class="btn small" data-action="edit-news" data-id="${item.id}">تعديل</button> <button class="btn small danger" data-action="delete-news" data-id="${item.id}">حذف</button></td>
    </tr>`;
  }).join('');
  setNewsBoth(['view-news-pagination','view-news-pagination-top'], pgnHtml);
  setNewsBoth(['view-news-grid-pagination','view-news-grid-pagination-top'], '');
}

function clearNewsForm() {
  document.getElementById('nf-title').value = '';
  document.getElementById('nf-image').value = '';
  document.getElementById('nf-content').value = '';
}

function openNewsModal(item) {
  editingNewsId = item ? item.id : null;
  document.getElementById('news-modal-title').textContent = item ? 'تعديل المقال' : 'مقال جديد';
  document.getElementById('btn-news-save').textContent = item ? 'تحديث' : 'حفظ';
  clearNewsForm();
  if (item) {
    document.getElementById('nf-title').value = item.title || '';
    document.getElementById('nf-image').value = item.image_url || '';
    document.getElementById('nf-content').value = item.content || '';
  }
  document.getElementById('news-modal').classList.remove('hidden');
}

function closeNewsModal() { document.getElementById('news-modal').classList.add('hidden'); editingNewsId = null; }

document.getElementById('btn-news-add').onclick = () => openNewsModal(null);
document.getElementById('btn-refresh-news').onclick = loadNewsAdmin;
document.getElementById('btn-news-cancel').onclick = closeNewsModal;
document.getElementById('news-modal').querySelector('.modal-backdrop').onclick = closeNewsModal;
document.getElementById('news-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = {
    title: document.getElementById('nf-title').value.trim(),
    image_url: document.getElementById('nf-image').value.trim(),
    content: document.getElementById('nf-content').value.trim()
  };
  if (!data.title || !data.content) return showToast('العنوان والمحتوى مطلوبان', 'error');
  const url = editingNewsId ? `${API}/news/${editingNewsId}` : `${API}/news`;
  const method = editingNewsId ? 'PUT' : 'POST';
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error();
    showToast(editingNewsId ? 'تم تحديث المقال' : 'تم إنشاء المقال', 'success');
    closeNewsModal();
    loadNewsAdmin();
  } catch { showToast('فشل حفظ المقال', 'error'); }
};
document.getElementById('btn-nf-image').onclick = () => {
  pickerCallback = (url) => { document.getElementById('nf-image').value = url; };
  openPicker();
};
document.getElementById('news-body').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-news') {
    const row = btn.closest('tr');
    const cells = row.querySelectorAll('td');
    openNewsModal({ id: btn.dataset.id, title: cells[0].textContent, image_url: cells[1].querySelector('img')?.dataset.url || '', content: '' });
    fetch(`${API}/news/${btn.dataset.id}`).then(r => r.json()).then(item => {
      document.getElementById('nf-content').value = item.content || '';
    }).catch(() => {});
    return;
  }
  if (btn.dataset.action === 'delete-news') {
    if (!confirm('حذف هذا المقال؟')) return;
    fetch(`${API}/news/${btn.dataset.id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(); showToast('تم حذف المقال', 'success'); loadNewsAdmin(); })
      .catch(() => showToast('فشل حذف المقال', 'error'));
  }
});
document.getElementById('view-news-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-news') {
    openNewsModal({ id: btn.dataset.id });
    fetch(`${API}/news/${btn.dataset.id}`).then(r => r.json()).then(item => {
      document.getElementById('nf-title').value = item.title || '';
      document.getElementById('nf-image').value = item.image_url || '';
      document.getElementById('nf-content').value = item.content || '';
    }).catch(() => {});
    return;
  }
  if (btn.dataset.action === 'delete-news') {
    if (!confirm('حذف هذا المقال؟')) return;
    fetch(`${API}/news/${btn.dataset.id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(); showToast('تم حذف المقال', 'success'); loadNewsAdmin(); })
      .catch(() => showToast('فشل حذف المقال', 'error'));
  }
});

/* --- About Admin --- */

async function loadAboutAdmin() {
  try {
    const res = await fetch(`${API}/about`);
    const data = await res.json();
    document.getElementById('about-logo').value = data.logo || '';
    document.getElementById('about-title').value = data.title || '';
    document.getElementById('about-subtitle').value = data.subtitle || '';
    document.getElementById('about-description').value = data.description || '';
    document.getElementById('about-address').value = data.address || '';
    document.getElementById('about-phones').value = Array.isArray(data.phones) ? data.phones.join(', ') : (data.phones || '');
    document.getElementById('about-instagram').value = (data.social && data.social.instagram) || '';
    document.getElementById('about-facebook').value = (data.social && data.social.facebook) || '';
    document.getElementById('about-whatsapp').value = (data.social && data.social.whatsapp) || '';
  } catch { showToast('فشل تحميل بيانات صفحة حول', 'error'); }
}

document.getElementById('about-form').onsubmit = async (e) => {
  e.preventDefault();
  const data = {
    logo: document.getElementById('about-logo').value.trim(),
    title: document.getElementById('about-title').value.trim(),
    subtitle: document.getElementById('about-subtitle').value.trim(),
    description: document.getElementById('about-description').value.trim(),
    address: document.getElementById('about-address').value.trim(),
    phones: document.getElementById('about-phones').value.split(',').map(s => s.trim()).filter(Boolean),
    social: {
      instagram: document.getElementById('about-instagram').value.trim(),
      facebook: document.getElementById('about-facebook').value.trim(),
      whatsapp: document.getElementById('about-whatsapp').value.trim()
    }
  };
  try {
    const res = await fetch(`${API}/about`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.error || 'فشل حفظ صفحة حول', 'error'); return; }
    showToast('تم حفظ صفحة حول', 'success');
  } catch (e) { showToast('فشل حفظ صفحة حول', 'error'); console.error(e); }
};
document.getElementById('btn-about-logo').onclick = () => {
  pickerCallback = (url) => { document.getElementById('about-logo').value = url; };
  openPicker();
};

/* --- Settings / Password --- */

function openChangePassword() {
  document.getElementById('cp-title').textContent = 'تغيير كلمة المرور';
  document.getElementById('cp-current-row').style.display = '';
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-strength').className = 'cp-strength';
  document.getElementById('cp-strength').textContent = '';
  document.getElementById('cp-error').style.display = 'none';
  document.getElementById('change-password-modal').classList.remove('hidden');
  document.getElementById('cp-current').focus();
}

function closeChangePassword() {
  document.getElementById('change-password-modal').classList.add('hidden');
}

function evaluatePasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (PASSWORD_RULES.lowercase.test(pw)) score++;
  if (PASSWORD_RULES.uppercase.test(pw)) score++;
  if (PASSWORD_RULES.number.test(pw)) score++;
  if (PASSWORD_RULES.symbol.test(pw)) score++;
  return score;
}

function updatePasswordStrength() {
  const pw = document.getElementById('cp-new').value;
  const el = document.getElementById('cp-strength');
  const score = evaluatePasswordStrength(pw);
  const labels = ['', 'ضعيفة', 'ضعيفة', 'متوسطة', 'متوسطة', 'قوية'];
  const classes = ['', 'cp-weak', 'cp-weak', 'cp-fair', 'cp-fair', 'cp-strong'];
  el.className = 'cp-strength ' + (score > 0 ? classes[score] : '');
  el.textContent = score > 0 ? labels[score] : '';
}

document.getElementById('cp-new').addEventListener('input', updatePasswordStrength);

document.getElementById('cp-form').onsubmit = async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('cp-current').value;
  const newPassword = document.getElementById('cp-new').value;
  const confirmPassword = document.getElementById('cp-confirm').value;
  const errEl = document.getElementById('cp-error');
  errEl.style.display = 'none';
  if (!currentPassword) { errEl.textContent = 'كلمة المرور الحالية مطلوبة'; errEl.style.display = ''; return; }
  if (!newPassword || newPassword.length < 8) { errEl.textContent = 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'; errEl.style.display = ''; return; }
  if (!PASSWORD_RULES.lowercase.test(newPassword)) { errEl.textContent = 'يجب أن تحتوي على حرف صغير'; errEl.style.display = ''; return; }
  if (!PASSWORD_RULES.uppercase.test(newPassword)) { errEl.textContent = 'يجب أن تحتوي على حرف كبير'; errEl.style.display = ''; return; }
  if (!PASSWORD_RULES.number.test(newPassword)) { errEl.textContent = 'يجب أن تحتوي على رقم'; errEl.style.display = ''; return; }
  if (!PASSWORD_RULES.symbol.test(newPassword)) { errEl.textContent = 'يجب أن تحتوي على رمز'; errEl.style.display = ''; return; }
  if (newPassword !== confirmPassword) { errEl.textContent = 'كلمتا المرور غير متطابقتين'; errEl.style.display = ''; return; }
  try {
    const cpw = currentPassword;
    const res = await fetch(`${API}/change-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cpw, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      const errMap = {
        'currentPassword and newPassword required': 'كلمة المرور الحالية وكلمة المرور الجديدة مطلوبتان',
        'Password must be at least 8 characters': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',
        'Current password is incorrect': 'كلمة المرور الحالية غير صحيحة'
      };
      const tmpl = data.error || '';
      const match = Object.keys(errMap).find(k => tmpl.includes(k));
      errEl.textContent = match ? errMap[match] : (errMap[tmpl] || tmpl || 'فشل تغيير كلمة المرور');
      errEl.style.display = '';
      return;
    }
    passwordHash = await hashPassword(newPassword);
    passwordChangedAt = new Date().toISOString();
    showToast('تم تغيير كلمة المرور بنجاح', 'success');
    closeChangePassword();
    loadSettingsAdmin();
  } catch { errEl.textContent = 'خطأ في الشبكة'; errEl.style.display = ''; }
};

document.getElementById('cp-cancel').onclick = closeChangePassword;
document.getElementById('change-password-modal').querySelector('.modal-backdrop').onclick = closeChangePassword;

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return '0';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let sz = bytes;
  while (sz >= 1024 && i < units.length - 1) { sz /= 1024; i++; }
  return sz.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

let _cachedResources = null;

function renderSettings(pwData, r) {
  const changedStr = pwData.changedAt ? new Date(pwData.changedAt).toLocaleString() : 'أبداً';
  const hasPw = pwData.hasPassword;
  const st = r ? r.storage : null;
  const rc = r ? r.rowCounts : {};
  const dbBytes = r ? r.dbSizeBytes : 0;
  const dbLimit = 500 * 1024 * 1024;
  const storageLimit = 1024 * 1024 * 1024;
  const stPct = st ? Math.min(100, (st.totalBytes / storageLimit) * 100) : 0;
  const dbPct = dbBytes ? Math.min(100, (dbBytes / dbLimit) * 100) : 0;
  const dbBar = dbBytes ? `<div style="background:#eee;border-radius:3px;height:10px;margin:0.25rem 0 0.25rem;overflow:hidden"><div style="width:${dbPct}%;background:${dbPct > 80 ? '#e74c3c' : '#3498db'};height:10px;border-radius:3px"></div></div>` : '';
  const stBar = st ? `<div style="background:#eee;border-radius:3px;height:10px;margin:0.25rem 0 0.25rem;overflow:hidden"><div style="width:${stPct}%;background:${stPct > 80 ? '#e74c3c' : '#3498db'};height:10px;border-radius:3px"></div></div>` : '';
  const rowHtml = Object.keys(rc).length ? '<table style="width:100%;border-collapse:collapse;font-size:0.8rem"><tr style="background:#f5f5f5"><th style="padding:4px 6px;text-align:right">الجدول</th><th style="padding:4px 6px;text-align:right">عدد السجلات</th></tr>' + Object.entries(rc).map(([t, c]) => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee">${t}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${c != null ? c : '—'}</td></tr>`).join('') + '</table>' : '';
  document.getElementById('settings-content').innerHTML = `
    <div class="dashboard-section">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>كلمة المرور</h3>
      </div>
      <p style="margin-bottom:0.5rem;font-size:0.9rem;color:#555">
        الحالة: <strong>${hasPw ? 'تم تعيين كلمة مرور مخصصة' : 'استخدام كلمة المرور الافتراضية'}</strong><br>
        آخر تغيير: <strong>${changedStr}</strong>
      </p>
      <button class="btn primary" id="btn-change-pw">تغيير كلمة المرور</button>
      <div style="margin-top:0.75rem;font-size:0.8rem;color:#888">
        القواعد: 8 أحرف على الأقل، يجب أن تحتوي على حرف صغير وكبير ورقم ورمز.<br>
        يمكن تغيير كلمة المرور مرة واحدة كل 48 ساعة.
      </div>
    </div>
    <div class="dashboard-section" style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>قاعدة البيانات</h3>
        <button class="btn secondary" style="font-size:0.75rem;padding:2px 8px" id="btn-refresh-db">تحديث</button>
      </div>
      <p style="font-size:0.85rem;color:#555;margin-bottom:0.25rem">
        الحجم: <strong>${fmtSize(dbBytes)}</strong> / 500 MB
      </p>
      ${dbBar}
      ${rowHtml}
    </div>
    <div class="dashboard-section" style="margin-top:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>التخزين</h3>
        <button class="btn secondary" style="font-size:0.75rem;padding:2px 8px" id="btn-refresh-st">تحديث</button>
      </div>
      <p style="font-size:0.85rem;color:#555;margin-bottom:0.25rem">
        الملفات: <strong>${st ? st.totalFiles : '—'}</strong><br>
        الحجم: <strong>${st ? fmtSize(st.totalBytes) : '—'}</strong> / 1 GB
      </p>
      ${stBar}
    </div>
  `;
  document.getElementById('btn-change-pw').onclick = openChangePassword;
  document.getElementById('btn-refresh-db').onclick = refreshSettings;
  document.getElementById('btn-refresh-st').onclick = refreshSettings;
}

async function loadSettingsAdmin(force) {
  const container = document.getElementById('settings-content');
  if (!force && _cachedResources) return renderSettings(_cachedResources.pw, _cachedResources.res);
  container.innerHTML = '<p class="empty">جارٍ تحميل الإعدادات...</p>';
  try {
    const [pwRes, resRes] = await Promise.all([
      fetch(`${API}/password-status`),
      fetch(`${API}/resources`).catch(() => null)
    ]);
    const pwData = pwRes.ok ? await pwRes.json() : {};
    const r = resRes && resRes.ok ? await resRes.json() : null;
    _cachedResources = { pw: pwData, res: r };
    renderSettings(pwData, r);
  } catch { container.innerHTML = '<p class="empty">فشل تحميل الإعدادات.</p>'; }
}

function refreshSettings() {
  _cachedResources = null;
  loadSettingsAdmin(true);
}

document.getElementById('btn-toggle-data').textContent = gridViewData ? 'عرض جدول' : 'عرض شبكي';
document.getElementById('btn-toggle-orders').textContent = gridViewOrders ? 'عرض جدول' : 'عرض شبكي';
document.getElementById('btn-toggle-storage').textContent = gridViewStorage ? 'عرض جدول' : 'عرض شبكي';
document.getElementById('btn-toggle-gallery').textContent = gridViewGallery ? 'عرض جدول' : 'عرض شبكي';
document.getElementById('btn-toggle-news').textContent = gridViewNews ? 'عرض جدول' : 'عرض شبكي';
const sortBtn = document.getElementById('btn-sort-data');
if (sortBtn) sortBtn.textContent = dataSortDir === 'desc' ? '↓ ترتيب' : '↑ ترتيب';

loadItems();