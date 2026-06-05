# واجهة API المتجر الإلكتروني — النسخة الاولى (prototype)

نظام خلفي خفيف للتجارة الإلكترونية مع لوحة تحكم إدارية ومتجر من صفحتين.
مبني على **Node.js + Express 5 + Supabase (Postgres + تخزين)**.

**الإصدار:** المنتجات + الطلبات فقط | **اللغة:** العربية | **السلة:** ✗ | **المتغيرات:** ✗

---

## الهيكل

```
prototype/
├── server.js          نقطة الدخول — تشغيل Express
├── app.js             تطبيق Express — الوسائط، المصادقة، المسارات
├── store.js           طبقة البيانات — عمليات Supabase للمنتجات والطلبات
├── logger.js          مسجل Pino
├── package.json
│
├── api/
│   └── route.js       واجهة API العامة — 3 نقاط نهاية
│
├── admin/
│   ├── index.html     لوحة تحكم SPA — 5 أقسام
│   ├── style.css      أنماط لوحة التحكم
│   └── script.js      جافا سكريبت لوحة التحكم
│
└── client/
    ├── index.html     صفحة المتجر — شبكة منتجات، بحث، تصفية
    ├── details.html   تفاصيل المنتج + نموذج الطلب
    ├── script.js      جميع جافا سكريبت العميل
    ├── styles.css     أنماط المتجر — متجاوبة، وضع ليلي
    └── icon/          أيقونات PNG
```

## الإعداد السريع

```bash
cd prototype
npm install
# تعيين متغيرات البيئة
# إنشاء الجداول في Supabase SQL Editor
npm start
```

## الجداول المطلوبة

```sql
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT, item_data JSONB,
  client_origin TEXT DEFAULT '', client_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  password_hash TEXT DEFAULT '',
  password_changed_at TIMESTAMPTZ DEFAULT NULL
);
INSERT INTO admin_settings (id, password_hash) VALUES (1, '') ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE FUNCTION get_db_size()
RETURNS BIGINT LANGUAGE SQL AS $$ SELECT pg_database_size(current_database()); $$;
CREATE OR REPLACE FUNCTION get_storage_stats()
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT jsonb_build_object('totalFiles', COUNT(*), 'totalBytes', COALESCE(SUM(COALESCE((metadata->>'size')::bigint, 0)), 0)) FROM storage.objects;
$$;
```

## نقاط النهاية

### العامة (`/api/`)
- `GET /api/data` — قائمة المنتجات
- `GET /api/data/:id` — منتج محدد
- `POST /api/order` — إنشاء طلب

### الإدارة (`/admin/api/`)
- CRUD المنتجات، إدارة الطلبات، إدارة التخزين
- حالة كلمة المرور، تغيير كلمة المرور
- إحصائيات الموارد (حجم DB، التخزين)
- حالة النظام

## الترخيص

خاص وجميع الحقوق محفوظة 2026
