export function initial() { return { products: [], sales: [], purchases: [], customers: [], suppliers: [], expenses: [], settings: { name: 'My General Store', phone: '', address: '' }, demo: false }; }
export function demoProducts() { return [['Aashirvaad Atta', 'Staples', 275, 240, 42, '5 kg'], ['Tata Salt', 'Staples', 28, 23, 8, '1 kg'], ['Amul Taaza Milk', 'Dairy', 28, 25, 24, '500 ml'], ['Fortune Sunflower Oil', 'Staples', 145, 125, 6, '1 L'], ['Maggi 2-Minute Noodles', 'Snacks', 14, 11, 72, '70 g'], ['Britannia Good Day', 'Snacks', 30, 24, 48, '120 g'], ['Surf Excel Easy Wash', 'Household', 135, 115, 4, '1 kg'], ['Colgate Strong Teeth', 'Personal care', 110, 92, 18, '200 g'], ['Tata Tea Premium', 'Beverages', 140, 118, 22, '250 g'], ['Parle-G Biscuits', 'Snacks', 10, 8, 96, '80 g'], ['Dove Beauty Bar', 'Personal care', 62, 50, 14, '100 g'], ['Dettol Handwash', 'Household', 99, 82, 0, '200 ml']].map((p, i) => ({ id: 'sample-' + i, name: p[0], category: p[1], price: p[2], cost: p[3], stock: p[4], unit: p[5], min: 10, barcode: String(8901000000000 + i) })); }
export const stockTarget = (p) => p.target ?? Math.max(p.stock, p.min * 5, 1);
export const stockThreshold = (p, s) => Math.floor(stockTarget(p) * (s.settings.lowPercent ?? 20) / 100);
export const isLow = (p, s) => p.stock <= stockThreshold(p, s);
export const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
export function mutate(s, a) {
    const id = () => crypto.randomUUID();
    const num = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000000;
    const txt = (x) => typeof x === 'string' && x.trim().length > 0 && x.length < 200;
    switch (a.type) {
        case 'demo':
            if (s.products.length || s.sales.length)
                throw Error('Sample items can only be loaded into an empty store.');
            s.products = demoProducts();
            s.demo = true;
            break;
        case 'product': {
            const p = a.product;
            if (!p || !txt(p.name) || !txt(p.barcode) || !txt(p.category) || !txt(p.unit) || !['price', 'cost', 'stock', 'min'].every(k => num(p[k])) || !Number.isInteger(p.stock) || !Number.isInteger(p.min))
                throw Error('Enter valid product details and whole-number stock.');
            if (s.products.some(x => x.barcode === p.barcode.trim() && x.id !== p.id))
                throw Error('This barcode belongs to another item.');
            const i = s.products.findIndex(x => x.id === p.id);
            if (p.target !== undefined && (!Number.isInteger(p.target) || p.target < 1 || p.target > 10000000))
                throw Error('Target stock must be a positive whole number.');
            const clean = { target: p.target ?? Math.max(p.stock, p.min * 5, 1), id: i >= 0 ? p.id : id(), name: p.name.trim(), barcode: p.barcode.trim(), category: p.category, unit: p.unit, price: p.price, cost: p.cost, stock: p.stock, min: p.min };
            if (i >= 0)
                s.products[i] = clean;
            else
                s.products.push(clean);
            break;
        }
        case 'sale': {
            if (s.sales.some(x => x.id === a.id))
                break;
            if (!txt(a.id) || !Array.isArray(a.items) || !a.items.length || !num(a.discount) || !['Cash', 'UPI', 'Card'].includes(a.payment))
                throw Error('Invalid sale.');
            if (a.items.length > 200)
                throw Error('A bill can contain up to 200 different products.');
            const seen = new Set();
            const items = a.items.map((line) => { const p = s.products.find(x => x.id === line.id); if (!p || seen.has(line.id) || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > 1000000 || line.qty > p.stock)
                throw Error('Stock changed. Refresh and check bill quantities.'); seen.add(line.id); return { ...p, qty: line.qty }; });
            const subtotal = items.reduce((t, p) => t + p.price * p.qty, 0);
            if (a.discount > subtotal)
                throw Error('Discount cannot exceed the subtotal.');
            items.forEach((p) => { s.products.find(x => x.id === p.id).stock -= p.qty; });
            s.sales.unshift({ id: a.id, date: new Date().toISOString(), customer: typeof a.customer === 'string' ? a.customer.slice(0, 200) : 'Walk-in customer', payment: a.payment, items, total: Math.round((subtotal - a.discount) * 100) / 100, discount: a.discount });
            break;
        }
        case 'contact': {
            if (!['customers', 'suppliers'].includes(a.kind) || !txt(a.name) || typeof a.phone !== 'string' || a.phone.length > 30)
                throw Error('Enter valid contact details.');
            (s[a.kind]).push({ id: id(), name: a.name.trim(), phone: a.phone });
            break;
        }
        case 'purchase': {
            if (s.purchases.some(x => x.id === a.id))
                break;
            const p = s.products.find(x => x.id === a.product);
            if (!p || !Number.isInteger(a.qty) || a.qty < 1 || a.qty > 1000000 || !num(a.cost) || !txt(a.id) || !txt(a.supplier))
                throw Error('Enter a product, supplier and valid quantity/cost.');
            if (p.stock + a.qty > 10000000)
                throw Error('Stock exceeds the supported limit.');
            p.stock += a.qty;
            p.cost = a.cost;
            s.purchases.unshift({ id: a.id, date: new Date().toISOString(), product: p.name, qty: a.qty, total: Math.round(a.qty * a.cost * 100) / 100, supplier: a.supplier });
            break;
        }
        case 'bill_import': {
            if (!txt(a.id) || !txt(a.supplier) || !Array.isArray(a.items) || a.items.length < 1 || a.items.length > 100)
                throw Error('Review 1–100 items and enter the supplier.');
            s.imports ??= [];
            if (s.imports.includes(a.id))
                break;
            const copy = structuredClone(s);
            for (const line of a.items) {
                if (!txt(line.name) || !txt(line.barcode) || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > 1000000 || !num(line.cost) || !num(line.price))
                    throw Error('Check every item name, barcode, quantity, cost and selling price.');
                const code = line.barcode.trim();
                let p = copy.products.find(x => x.barcode === code);
                if (!p) {
                    mutate(copy, { type: 'product', product: { id: '', name: line.name, barcode: code, category: typeof line.category === 'string' && line.category.trim() ? line.category : 'Imported', unit: 'piece', stock: 0, min: 10, target: Math.max(line.qty, 50), price: line.price, cost: line.cost } });
                    p = copy.products.find(x => x.barcode === code);
                }
                mutate(copy, { type: 'purchase', id: a.id + '-' + copy.purchases.length, product: p.id, qty: line.qty, cost: line.cost, supplier: a.supplier });
            }
            copy.imports.push(a.id);
            Object.assign(s, copy);
            break;
        }
        case 'expense':
            if (!txt(a.name) || !num(a.amount) || !a.amount)
                throw Error('Enter a description and amount.');
            s.expenses.unshift({ id: id(), date: new Date().toISOString(), name: a.name, amount: a.amount });
            break;
        case 'settings':
            if (!txt(a.name) || typeof a.phone !== 'string' || typeof a.address !== 'string' || a.address.length > 500)
                throw Error('Enter valid store details.');
            if (!num(a.lowPercent) || a.lowPercent > 100)
                throw Error('Low-stock percentage must be between 0 and 100.');
            s.settings = { name: a.name.trim(), phone: a.phone.slice(0, 30), address: a.address, lowPercent: a.lowPercent };
            break;
        default: throw Error('Unknown action.');
    }
    return s;
}
