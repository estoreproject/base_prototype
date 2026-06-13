const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const crypto = require('crypto');
const store = require('../store');
const logger = require('../logger');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getAdminSettings() {
  const client = getSupabase();
  if (!client) return null;
  const { data: rows } = await client.from('admin_settings').select('*').eq('id', 1).limit(1);
  return rows?.[0] || null;
}

async function upsertAdminSettings(data) {
  const client = getSupabase();
  if (!client) return null;
  const { data: rows } = await client.from('admin_settings').upsert({ id: 1, ...data }, { onConflict: 'id' }).select();
  return rows?.[0] || null;
}

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || null;
  const limit = parseInt(req.query.limit) || 20;
  if (page) {
    const result = await store.getPage('items', page, limit);
    return res.json(result);
  }
  res.json(await store.getAll());
});

router.post('/', async (req, res) => {
  const { body } = req;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }
  if (Object.keys(body).length > 50) {
    return res.status(400).json({ error: 'Maximum 50 fields allowed' });
  }
  const item = { id: uuidv4(), ...body };
  const created = await store.create(item);
  if (!created) return res.status(500).json({ error: 'Failed to create item' });
  res.status(201).json(created);
});

/* --- Specific routes before parameterized routes --- */

/* Gallery */
router.get('/gallery', async (req, res) => {
  res.json(await store.getGallery());
});

router.post('/gallery', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  const item = await store.addGallery(url);
  if (!item) return res.status(500).json({ error: 'Failed to add gallery image' });
  res.status(201).json(item);
});

router.delete('/gallery/:id', async (req, res) => {
  const ok = await store.removeGallery(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

/* News */
router.get('/news', async (req, res) => {
  res.json(await store.getNews());
});

router.get('/news/:id', async (req, res) => {
  const item = await store.getNewsById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.post('/news', async (req, res) => {
  const { title, content, image_url } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const item = await store.createNews({ title, content, image_url: image_url || '' });
  if (!item) return res.status(500).json({ error: 'Failed to create news' });
  res.status(201).json(item);
});

router.put('/news/:id', async (req, res) => {
  const { title, content, image_url } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const item = await store.updateNews(req.params.id, { title, content, image_url: image_url || '' });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.delete('/news/:id', async (req, res) => {
  const ok = await store.removeNews(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

/* About */
router.get('/about', async (req, res) => {
  res.json(await store.getAbout());
});

router.put('/about', async (req, res) => {
  try {
    const ok = await store.saveAbout(req.body || {});
    if (!ok) return res.status(500).json({ error: 'Failed to save about' });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'about put error');
    res.status(500).json({ error: err.message });
  }
});

/* Orders */
router.get('/orders', async (req, res) => {
  const page = parseInt(req.query.page) || null;
  const limit = parseInt(req.query.limit) || 20;
  if (page) {
    const result = await store.getPage('orders', page, limit);
    return res.json(result);
  }
  res.json(await store.getAllOrders());
});

router.delete('/orders/:id', async (req, res) => {
  const removed = await store.removeOrder(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Order not found' });
  res.status(204).end();
});

/* Order status update */
router.put('/orders/:id/status', async (req, res) => {
  const { status } = req.body || {};
  logger.info({ id: req.params.id, status, body: req.body }, 'PUT /orders/:id/status hit');
  if (!status) return res.status(400).json({ error: 'status is required' });
  const valid = ['pending','processing','shipped','delivered','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const order = await store.updateOrderStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/* Order notes */
router.put('/orders/:id/notes', async (req, res) => {
  const { notes } = req.body || {};
  if (notes === undefined) return res.status(400).json({ error: 'notes is required' });
  const ok = await store.updateOrderNotes(req.params.id, notes);
  if (!ok) return res.status(500).json({ error: 'Failed to update notes' });
  res.json({ ok: true });
});

/* Analytics */
router.get('/analytics', async (req, res) => {
  const orders = await store.getAllOrders();
  const items = await store.getAll();

  const activeOrders = orders.filter(o => o.status !== 'cancelled');

  const dailyRevenue = {};
  activeOrders.forEach(o => {
    if (!o.created_at) return;
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    const d = o.item_data || {};
    let total = d.cartTotal || d.total || 0;
    if (d.items && Array.isArray(d.items)) {
      total = d.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.quantity || 1), 0);
    }
    if (!dailyRevenue[day]) dailyRevenue[day] = 0;
    dailyRevenue[day] += total;
  });

  const productSales = {};
  activeOrders.forEach(o => {
    const d = o.item_data || {};
    if (d.items && Array.isArray(d.items)) {
      d.items.forEach(item => {
        const id = item.itemId || 'unknown';
        if (!productSales[id]) productSales[id] = { name: item.name || id, qty: 0, revenue: 0 };
        productSales[id].qty += item.quantity || 1;
        productSales[id].revenue += (parseFloat(item.price) || 0) * (item.quantity || 1);
      });
    } else if (o.item_id) {
      const qty = d.quantity || 1;
      const price = parseFloat(d.price || d.formData?.price) || 0;
      if (!productSales[o.item_id]) productSales[o.item_id] = { name: o.item_id, qty: 0, revenue: 0 };
      productSales[o.item_id].qty += qty;
      productSales[o.item_id].revenue += price * qty;
    }
  });

  const statusCounts = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  orders.forEach(o => { const s = o.status || 'pending'; if (statusCounts[s] !== undefined) statusCounts[s]++; });

  res.json({
    dailyRevenue,
    topProducts: Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10),
    statusCounts,
    totalOrders: activeOrders.length,
    totalRevenue: Object.values(dailyRevenue).reduce((s, v) => s + v, 0)
  });
});

/* Regenerate all snapshots */
router.post('/regenerate-snapshots', async (req, res) => {
  await store.regenerateAllSnapshots();
  res.json({ ok: true });
});

/* Storage */
router.get('/storage', async (req, res) => {
  const [images, items] = await Promise.all([store.listImages(), store.getAll()]);
  const linked = new Set();
  items.forEach(i => {
    if (i.image_url) linked.add(i.image_url);
    if (Array.isArray(i.gallery)) i.gallery.forEach(u => linked.add(u));
  });
  res.json(images.map(img => ({ ...img, linked: linked.has(img.url) })));
});

router.delete('/storage/:name', async (req, res) => {
  const removed = await store.deleteImage(req.params.name);
  if (!removed) return res.status(404).json({ error: 'Image not found' });
  res.status(204).end();
});

router.get('/status', async (req, res) => {
  res.json(await store.checkStatus());
});

/* Parameterized routes last */
router.put('/:id', async (req, res) => {
  const { body } = req;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }
  const updated = await store.replaceItem(req.params.id, body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const removed = await store.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

router.post('/upload/:id', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const fileName = `item_${req.params.id}_${Date.now()}.${req.file.mimetype.split('/')[1] || 'jpg'}`;
  const imageUrl = await store.uploadImage(req.file.buffer, fileName, req.file.mimetype);
  if (!imageUrl) return res.status(500).json({ error: 'Upload to storage failed' });
  const updated = await store.update(req.params.id, { image_url: imageUrl });
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  res.json({ image_url: imageUrl, item: updated });
});

router.post('/upload-file', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const ext = req.file.mimetype.split('/')[1] || 'jpg';
  const fileName = `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = await store.uploadImage(req.file.buffer, fileName, req.file.mimetype);
  if (!url) return res.status(500).json({ error: 'Upload failed' });
  res.json({ url });
});

/* Password */
router.get('/password-status', async (req, res) => {
  try {
    const settings = await getAdminSettings();
    res.json({
      hasPassword: !!(settings?.password_hash),
      changedAt: settings?.password_changed_at || null
    });
  } catch (err) {
    logger.error(err, 'password-status error');
    res.status(500).json({ error: 'Failed to check password status' });
  }
});

router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const envHash = process.env.ADMIN_PASSWORD
    ? crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest('hex')
    : null;
  const settings = await getAdminSettings();
  const storedHash = settings?.password_hash || envHash;
  const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
  if (!storedHash || currentHash !== storedHash) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (settings?.password_changed_at) {
    const changed = new Date(settings.password_changed_at).getTime();
    const hoursSince = (Date.now() - changed) / 3600000;
    if (hoursSince < 48) {
      const remaining = Math.ceil(48 - hoursSince);
      return res.status(429).json({ error: `Password can only be changed once every 48 hours. ${remaining}h remaining.` });
    }
  }
  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
  await upsertAdminSettings({ password_hash: newHash, password_changed_at: new Date().toISOString() });
  logger.info({ ip: req.ip }, 'password changed successfully');
  res.json({ ok: true, message: 'Password changed successfully' });
});

/* Resources (storage + DB stats) */
router.get('/resources', async (req, res) => {
  try {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    const result = { storage: { totalFiles: 0, totalBytes: 0 }, rowCounts: {}, dbSizeBytes: 0 };
    if (supabaseUrl && supabaseKey) {
      const { createClient } = require('@supabase/supabase-js');
      const client = createClient(supabaseUrl, supabaseKey);
      const { data: stStats, error: stErr } = await client.rpc('get_storage_stats');
      if (!stErr && stStats) {
        result.storage.totalFiles = stStats.totalFiles || 0;
        result.storage.totalBytes = stStats.totalBytes || 0;
      }
      const tables = ['items', 'orders', 'gallery', 'news', 'about_data', 'admin_settings'];
      for (const table of tables) {
        const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
        if (!error) result.rowCounts[table] = count;
      }
      const { data: dbSize } = await client.rpc('get_db_size');
      if (dbSize) result.dbSizeBytes = dbSize;
    }
    res.json(result);
  } catch (err) {
    logger.error(err, 'resources error');
    res.status(500).json({ error: 'Failed to get resources' });
  }
});

module.exports = router;
