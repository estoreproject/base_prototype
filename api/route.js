const { Router } = require('express');
const logger = require('../logger');
const store = require('../store');

const router = Router();

const clientApiKey = (process.env.CLIENT_API_KEY || '').trim();

function requireClientKey(req, res, next) {
  if (!clientApiKey) return next();
  if (req.headers['x-api-key'] === clientApiKey) return next();
  logger.warn({ ip: req.ip, url: req.originalUrl }, 'invalid client API key');
  res.status(401).json({ error: 'Invalid API key' });
}

router.get('/data', async (req, res) => {
  res.json(await store.getAll());
});

router.get('/data/:id', async (req, res) => {
  const item = await store.getById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.post('/order', requireClientKey, async (req, res) => {
  const { itemId, name, formData } = req.body || {};
  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'itemId is required' });
  }
  const item = await store.getById(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const order = await store.createOrder(itemId, formData || null, req.headers.origin || '', name || '');
  if (!order) return res.status(500).json({ error: 'Failed to create order' });
  res.status(201).json({ ok: true, orderId: order.id });
});

module.exports = router;
