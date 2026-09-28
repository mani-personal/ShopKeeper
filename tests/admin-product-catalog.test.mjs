import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './pg-helper.mjs';
import { migrate } from '../server/db.mjs';
import { bootstrap } from '../server/bootstrap.mjs';
import { createApp } from '../server/app.mjs';

test('admin can consolidate unique catalogues and import selected products into a new vendor or wholesale shop', async () => {
  const db = await testDatabase();
  await migrate(db);
  await bootstrap(db, { email: 'owner@example.test', password: 'Owner-test-password-123', seedDemo: false });
  const server = createApp(db, { appOrigin: 'http://shop.test', frontend: 'missing' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, body, session) {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: 'http://shop.test', 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(email, password, portal) {
    const r = await call('/api/auth/login', { email, password, portal });
    assert.equal(r.status, 200);
    return { cookie: r.cookie, csrf: r.data.csrf };
  }
  try {
    const owner = await login('owner@example.test', 'Owner-test-password-123', 'super-admin');
    const source = await call('/api/admin/businesses', { kind: 'vendor', name: 'Source Store', owner: 'Source Owner', category: 'General store', phone: '', email: 'source@example.test', password: 'Vendor-password-123' }, owner);
    assert.equal(source.status, 200);
    const sourceRow = await db.prepare('SELECT data FROM vendors WHERE id=?').get(source.data.id);
    const sourceState = JSON.parse(sourceRow.data);
    sourceState.products.push(
      { id: 'p1', name: 'Rice 1 kg', barcode: '890000000001', category: 'Grocery', subcategory: 'Rice', weight: '1 kg', unit: 'pack', mrp: 80, price: 65, cost: 55, stock: 20, min: 10 },
      { id: 'p2', name: 'Rice 1 kg Duplicate', barcode: '890000000001', category: 'Grocery', subcategory: 'Rice', weight: '1 kg', unit: 'pack', mrp: 82, price: 66, cost: 56, stock: 4, min: 10 },
      { id: 'p3', name: 'Soap Bar', barcode: '890000000002', category: 'Personal care', subcategory: 'Bath', weight: '100 g', unit: 'piece', mrp: 50, price: 42, cost: 35, stock: 5, min: 10 },
    );
    await db.prepare('UPDATE vendors SET data=? WHERE id=?').run(JSON.stringify(sourceState), source.data.id);

    const catalog = await call('/api/admin/product-catalog?kind=vendor', undefined, owner);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.data.items.length, 2);
    assert.equal(catalog.data.items.find(x => x.barcode === '890000000001').mrp, 80);
    assert.equal(catalog.data.items.find(x => x.barcode === '890000000001').name, 'Rice 1 kg');

    const target = await call('/api/admin/businesses', { kind: 'vendor', name: 'Target Store', owner: 'Target Owner', category: 'General store', phone: '', email: 'target@example.test', password: 'Vendor-password-123' }, owner);
    assert.equal(target.status, 200);
    const imported = await call('/api/admin/businesses/vendor/' + target.data.id + '/catalog-import', {
      items: [
        { name: 'Rice 1 kg', mrp: 80, category: 'Grocery', subcategory: 'Rice', barcode: '890000000001', weight: '1 kg', unit: 'pack', costPrice: 55, sellingPrice: 70 },
        { name: 'Soap Bar', mrp: 50, category: 'Personal care', subcategory: 'Bath', barcode: '890000000002', weight: '100 g', unit: 'piece', costPrice: 35, sellingPrice: 42 },
      ],
    }, owner);
    assert.equal(imported.status, 200);
    assert.equal(imported.data.imported, 2);
    const targetRow = await db.prepare('SELECT data FROM vendors WHERE id=?').get(target.data.id);
    const targetState = JSON.parse(targetRow.data);
    assert.equal(targetState.products.length, 2);
    assert.equal(targetState.products[0].stock, 0);
    assert.equal(targetState.products[0].cost, 55);
    assert.equal(targetState.products[0].price, 70);

    const wholesaleTarget = await call('/api/admin/businesses', { kind: 'wholesale', name: 'Wholesale Target', owner: 'Target Wholesale', category: 'General store', phone: '', email: 'wholesale-target@example.test', password: 'Wholesale-password-123' }, owner);
    assert.equal(wholesaleTarget.status, 200);
    const wholesaleCatalog = await call('/api/admin/product-catalog?kind=wholesale', undefined, owner);
    assert.equal(wholesaleCatalog.status, 200);
    assert.equal(wholesaleCatalog.data.source, 'vendors');
    assert.equal(wholesaleCatalog.data.items.length, 2);
    const wholesaleImported = await call('/api/admin/businesses/wholesale/' + wholesaleTarget.data.id + '/catalog-import', { items: [{ name: 'Rice 1 kg', mrp: 80, category: 'Grocery', subcategory: 'Rice', barcode: '890000000001', weight: '1 kg', unit: 'pack', costPrice: 55, sellingPrice: 70 }] }, owner);
    assert.equal(wholesaleImported.status, 200);
    assert.equal(wholesaleImported.data.imported, 1);
    const wholesaleProduct = await db.prepare('SELECT name,sku,price,stock,category,subcategory,weight FROM wholesale_products WHERE wholesaler_id=?').get(wholesaleTarget.data.id);
    assert.equal(wholesaleProduct.name, 'Rice 1 kg');
    assert.equal(wholesaleProduct.sku, '890000000001');
    assert.equal(Number(wholesaleProduct.price), 70);
    assert.equal(wholesaleProduct.stock, 0);
    assert.equal(wholesaleProduct.category, 'Grocery');
    assert.equal(wholesaleProduct.subcategory, 'Rice');
    assert.equal(wholesaleProduct.weight, '1 kg');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  }
});
