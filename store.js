const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

let supabase = null;
const itemCache = new Map();
const IMG_CACHE_TTL = 10000;
const ITEM_CACHE_TTL = 5000;
let imgListCache = { ts: 0, data: null };

function invalidate() { itemCache.clear(); }

function invalidateImg() { imgListCache.ts = 0; }

function getClient() {
  if (supabase) return supabase;
  if (!supabaseUrl || !supabaseKey) {
    logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) env vars required');
    return null;
  }
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    logger.error({ err: err.message }, 'failed to create Supabase client');
    supabase = null;
  }
  return supabase;
}

function load() {
  getClient();
  logger.info('store initialized');
}

async function getAll() {
  const cached = itemCache.get('items');
  if (cached && Date.now() - cached.ts < ITEM_CACHE_TTL) return cached.data;
  const client = getClient();
  if (!client) return [];
  const { data: rows, error } = await client.from('items').select('id, data').order('id', { ascending: true });
  if (error) { logger.error(error, 'getAll failed'); return []; }
  const data = rows.map(r => ({ id: r.id, ...r.data })).sort((a, b) => (a.product_id || 0) - (b.product_id || 0));
  itemCache.set('items', { ts: Date.now(), data });
  return data;
}

async function getById(id) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('items').select('id, data').eq('id', id).limit(1);
  if (error) { logger.error(error, 'getById failed'); return null; }
  if (!rows || rows.length === 0) return null;
  return { id: rows[0].id, ...rows[0].data };
}

async function create(item) {
  invalidate();
  const client = getClient();
  if (!client) return null;
  const { id, ...data } = item;
  const { error } = await client.from('items').insert({ id, data });
  if (error) { logger.error(error, 'create failed'); return null; }
  generateSnapshot();
  return item;
}

async function update(id, updates) {
  invalidate();
  const client = getClient();
  if (!client) return null;
  const { id: _, ...newData } = updates;
  const { data: existing, error: fetchErr } = await client.from('items').select('data').eq('id', id).limit(1);
  if (fetchErr) { logger.error(fetchErr, 'update failed'); return null; }
  if (!existing || existing.length === 0) return null;
  const merged = { ...existing[0].data, ...newData };
  const { data: rows, error } = await client.from('items').update({ data: merged }).eq('id', id).select('id, data');
  if (error) { logger.error(error, 'update failed'); return null; }
  generateSnapshot();
  return { id: rows[0].id, ...rows[0].data };
}

async function remove(id) {
  invalidate();
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('items').delete().eq('id', id);
  if (error) { logger.error(error, 'delete failed'); return false; }
  generateSnapshot();
  return true;
}

async function getAllOrders() {
  const client = getClient();
  if (!client) return [];
  const { data: rows, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
  if (error) { logger.error(error, 'getAllOrders failed'); return []; }
  return rows || [];
}

async function createOrder(itemId, itemData, clientOrigin, clientName) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('orders').insert({
    item_id: itemId, item_data: itemData, client_origin: clientOrigin || '', client_name: clientName || ''
  }).select();
  if (error) { logger.error(error, 'createOrder failed'); return null; }
  return rows?.[0] || null;
}

async function createCartOrder(items, formData, clientOrigin, clientName) {
  const client = getClient();
  if (!client) return null;
  const firstItemId = items[0]?.itemId || '';
  const itemData = { formData, items, cartTotal: items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.quantity || 1), 0) };
  const { data: rows, error } = await client.from('orders').insert({
    item_id: firstItemId, item_data: itemData, client_origin: clientOrigin || '', client_name: clientName || ''
  }).select();
  if (error) { logger.error(error, 'createCartOrder failed'); return null; }
  return rows?.[0] || null;
}

async function removeOrder(id) {
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('orders').delete().eq('id', id);
  if (error) { logger.error(error, 'removeOrder failed'); return false; }
  return true;
}

async function getPage(table, page = 1, limit = 20) {
  const client = getClient();
  if (!client) return { data: [], total: 0, page, limit };
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  if (table === 'items') {
    const allItems = await getAll();
    const total = allItems.length;
    const pageItems = allItems.slice(from, to + 1);
    return { data: pageItems, total, page, limit };
  }
  const { data: rows, error, count } = await client.from('orders').select('*', { count: 'exact' }).range(from, to).order('created_at', { ascending: false });
  if (error) { logger.error(error, 'getPage failed'); return { data: [], total: 0, page, limit }; }
  return { data: rows || [], total: count, page, limit };
}

async function updateOrderNotes(id, notes) {
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('orders').update({ notes }).eq('id', id);
  if (error) { logger.error(error, 'updateOrderNotes failed'); return false; }
  return true;
}

async function updateOrderStatus(id, status) {
  const client = getClient();
  if (!client) return null;
  logger.info({ id, status }, 'updateOrderStatus called');

  // Fetch current order to check old status
  const { data: current, error: getErr } = await client.from('orders').select('*').eq('id', id).limit(1);
  if (getErr || !current || current.length === 0) {
    if (getErr) logger.error(getErr, 'updateOrderStatus: fetch failed');
    return null;
  }
  const order = current[0];

  // Update status first — must succeed before touching stock
  const { data, error } = await client.from('orders').update({ status }).eq('id', id).select();
  if (error) { logger.error(error, 'updateOrderStatus failed'); return null; }
  if (!data || !data.length) return null;
  const updated = data[0];

  // Deduct stock when marking as "delivered" (only once)
  if (status === 'delivered' && order.status !== 'delivered') {
    const itemData = order.item_data || {};
    let itemsToDeduct = [];

    if (itemData.items && Array.isArray(itemData.items) && itemData.items.length > 0) {
      itemsToDeduct = itemData.items.map(i => ({ id: i.itemId, qty: i.quantity || 1 }));
    } else if (order.item_id) {
      itemsToDeduct = [{ id: order.item_id, qty: itemData.quantity || 1 }];
    }

    for (const { id: prodId, qty } of itemsToDeduct) {
      if (!prodId) continue;
      try {
        const product = await getById(prodId);
        if (!product || product.stock == null) continue;
        const newStock = Math.max(0, parseInt(product.stock) - qty);
        const updateData = { ...product };
        delete updateData.id;
        updateData.stock = newStock;
        await replaceItem(prodId, updateData);
      } catch (e) {
        logger.error({ err: e.message }, 'deductStock failed for ' + prodId);
      }
    }
  }

  return updated;
}

async function regenerateAllSnapshots() {
  await Promise.all([
    generateSnapshot(),
    generateGallerySnapshot(),
    generateNewsSnapshot(),
    generateAboutSnapshot()
  ]);
}

async function uploadImage(buffer, fileName, mimeType) {
  invalidate();
  invalidateImg();
  const client = getClient();
  if (!client) return null;
  const { error } = await client.storage.from('images').upload(fileName, buffer, { contentType: mimeType, upsert: true, cacheControl: 'public, max-age=31536000, immutable' });
  if (error) { logger.error(error, 'uploadImage failed'); return null; }
  const { data: { publicUrl } } = client.storage.from('images').getPublicUrl(fileName);
  generateSnapshot();
  return publicUrl;
}

async function generateSnapshot() {
  const client = getClient();
  if (!client) return;
  const items = await getAll();
  const json = JSON.stringify(items);
  const { error } = await client.storage.from('cache').upload('data.json', json, {
    contentType: 'application/json', upsert: true, cacheControl: 'public, max-age=60'
  });
  if (error) logger.error(error, 'generateSnapshot failed');
}

function getSnapshotUrl() {
  const client = getClient();
  if (!client) return '';
  return client.storage.from('cache').getPublicUrl('data.json').data.publicUrl;
}

async function generateGallerySnapshot() {
  const client = getClient();
  if (!client) return;
  const items = await getGallery();
  const json = JSON.stringify(items);
  const { error } = await client.storage.from('cache').upload('gallery.json', json, {
    contentType: 'application/json', upsert: true, cacheControl: 'public, max-age=60'
  });
  if (error) logger.error(error, 'generateGallerySnapshot failed');
}

function getGallerySnapshotUrl() {
  const client = getClient();
  if (!client) return '';
  return client.storage.from('cache').getPublicUrl('gallery.json').data.publicUrl;
}

async function generateNewsSnapshot() {
  const client = getClient();
  if (!client) return;
  const items = await getNews();
  const json = JSON.stringify(items);
  const { error } = await client.storage.from('cache').upload('news.json', json, {
    contentType: 'application/json', upsert: true, cacheControl: 'public, max-age=60'
  });
  if (error) logger.error(error, 'generateNewsSnapshot failed');
}

function getNewsSnapshotUrl() {
  const client = getClient();
  if (!client) return '';
  return client.storage.from('cache').getPublicUrl('news.json').data.publicUrl;
}

async function generateAboutSnapshot() {
  const client = getClient();
  if (!client) return;
  const data = await getAbout();
  const json = JSON.stringify(data);
  const { error } = await client.storage.from('cache').upload('about.json', json, {
    contentType: 'application/json', upsert: true, cacheControl: 'public, max-age=60'
  });
  if (error) logger.error(error, 'generateAboutSnapshot failed');
}

function getAboutSnapshotUrl() {
  const client = getClient();
  if (!client) return '';
  return client.storage.from('cache').getPublicUrl('about.json').data.publicUrl;
}

async function listImages() {
  if (imgListCache.data && Date.now() - imgListCache.ts < IMG_CACHE_TTL) return imgListCache.data;
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client.storage.from('images').list();
  if (error) { logger.error(error, 'listImages failed'); return []; }
  const result = (data || []).map(f => ({
    name: f.name,
    url: client.storage.from('images').getPublicUrl(f.name).data.publicUrl,
    size: f.metadata?.size || 0,
    created_at: f.created_at,
  }));
  imgListCache = { ts: Date.now(), data: result };
  return result;
}

async function deleteImage(fileName) {
  invalidateImg();
  const client = getClient();
  if (!client) return false;
  const { error } = await client.storage.from('images').remove([fileName]);
  if (error) { logger.error(error, 'deleteImage failed'); return false; }
  return true;
}

async function getLinkedItems(imageUrl) {
  const all = await getAll();
  return all.filter(item =>
    item.image_url === imageUrl || (Array.isArray(item.gallery) && item.gallery.includes(imageUrl))
  ).map(i => i.id);
}

async function replaceItem(id, data) {
  invalidate();
  const client = getClient();
  if (!client) return null;
  if (data && data.stock !== undefined) {
    logger.info({ id, stock: data.stock }, 'replaceItem: stock being set');
  }
  if (data && data.stock !== undefined) {
    logger.info({ id, stock: data.stock }, 'replaceItem: stock being set');
  }
  const { data: rows, error } = await client.from('items').update({ data }).eq('id', id).select('id, data');
  if (error) { logger.error(error, 'replaceItem failed'); return null; }
  if (!rows || !rows.length) return null;
  generateSnapshot();
  return { id: rows[0].id, ...rows[0].data };
}

async function checkStatus() {
  const client = getClient();
  if (!client) return { server: 'ok', db: 'error', storage: 'error', cache: false };

  const { error: dbErr } = await client.from('items').select('id').limit(1);
  let storageOk = false, cacheExists = false;
  const { error: storageErr } = await client.storage.from('images').list('', { limit: 1 });
  storageOk = !storageErr;
  const { data: cacheList } = await client.storage.from('cache').list();
  cacheExists = cacheList && (cacheList.some(f => f.name === 'data.json') || cacheList.some(f => f.name === 'gallery.json') || cacheList.some(f => f.name === 'news.json') || cacheList.some(f => f.name === 'about.json'));

  return { server: 'ok', db: dbErr ? 'error' : 'ok', storage: storageOk ? 'ok' : 'error', cache: cacheExists };
}

/* --- Gallery --- */

async function getGallery() {
  const client = getClient();
  if (!client) return [];
  const { data: rows, error } = await client.from('gallery').select('*').order('created_at', { ascending: false });
  if (error) { logger.error(error, 'getGallery failed'); return []; }
  return rows || [];
}

async function addGallery(url) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('gallery').insert({ url }).select();
  if (error) { logger.error(error, 'addGallery failed'); return null; }
  generateGallerySnapshot();
  return rows?.[0] || null;
}

async function removeGallery(id) {
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('gallery').delete().eq('id', id);
  if (error) { logger.error(error, 'removeGallery failed'); return false; }
  generateGallerySnapshot();
  return true;
}

/* --- News --- */

async function getNews() {
  const client = getClient();
  if (!client) return [];
  const { data: rows, error } = await client.from('news').select('*').order('created_at', { ascending: false });
  if (error) { logger.error(error, 'getNews failed'); return []; }
  return rows || [];
}

async function getNewsById(id) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('news').select('*').eq('id', id).limit(1);
  if (error) { logger.error(error, 'getNewsById failed'); return null; }
  return rows?.[0] || null;
}

async function createNews(data) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('news').insert(data).select();
  if (error) { logger.error(error, 'createNews failed'); return null; }
  generateNewsSnapshot();
  return rows?.[0] || null;
}

async function updateNews(id, data) {
  const client = getClient();
  if (!client) return null;
  const { data: rows, error } = await client.from('news').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select();
  if (error) { logger.error(error, 'updateNews failed'); return null; }
  generateNewsSnapshot();
  return rows?.[0] || null;
}

async function removeNews(id) {
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('news').delete().eq('id', id);
  if (error) { logger.error(error, 'removeNews failed'); return false; }
  generateNewsSnapshot();
  return true;
}

/* --- About --- */

const ABOUT_ID = 1;

async function getAbout() {
  const client = getClient();
  if (!client) return {};
  const { data: rows, error } = await client.from('about_data').select('data').eq('id', ABOUT_ID).limit(1);
  if (error) { logger.error(error, 'getAbout failed'); return {}; }
  if (!rows || rows.length === 0) return {};
  return typeof rows[0].data === 'object' ? rows[0].data : {};
}

async function saveAbout(content) {
  const client = getClient();
  if (!client) return false;
  const { error } = await client.from('about_data').upsert({ id: ABOUT_ID, data: content }, { onConflict: 'id' }).select();
  if (error) { logger.error(error, 'saveAbout failed'); return false; }
  generateAboutSnapshot();
  return true;
}

module.exports = { load, getAll, getById, create, update, replaceItem, remove, getAllOrders, createOrder, createCartOrder, removeOrder, updateOrderStatus, updateOrderNotes, regenerateAllSnapshots, uploadImage, listImages, deleteImage, getLinkedItems, generateSnapshot, getSnapshotUrl, generateGallerySnapshot, getGallerySnapshotUrl, generateNewsSnapshot, getNewsSnapshotUrl, generateAboutSnapshot, getAboutSnapshotUrl, checkStatus, invalidate, getPage,
  getGallery, addGallery, removeGallery, getNews, getNewsById, createNews, updateNews, removeNews, getAbout, saveAbout };