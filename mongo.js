// Мини-MongoDB: коллекции документов, find/findOne/countDocuments, insert/update/delete,
// операторы запросов $eq $ne $gt $gte $lt $lte $in $nin $exists $and $or, обновления $set $inc $push $pull $unset.
// Синтаксис как в mongosh: db.shows.find({ genre: "балет" }, { title: 1 }).sort({ title: 1 }).limit(3)
"use strict";
(function () {
  const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const isObj = x => x && typeof x === "object" && !Array.isArray(x);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // все значения по пути "a.b.c" с раскрытием массивов, как в Mongo
  function values(doc, path) {
    let cur = [doc];
    for (const part of path.split(".")) {
      const next = [];
      for (const v of cur) {
        if (Array.isArray(v)) { if (/^\d+$/.test(part) && v[+part] !== undefined) next.push(v[+part]); for (const x of v) if (isObj(x) && part in x) next.push(x[part]); }
        else if (isObj(v) && part in v) next.push(v[part]);
      }
      cur = next;
    }
    const out = [];
    for (const v of cur) { out.push(v); if (Array.isArray(v)) out.push(...v); }
    return out;
  }
  const cmp = (a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : null);

  function matchOps(vals, ops, path) {
    for (const [op, arg] of Object.entries(ops)) {
      let ok;
      switch (op) {
        case "$eq": ok = vals.some(v => eq(v, arg)); break;
        case "$ne": ok = !vals.some(v => eq(v, arg)); break;
        case "$gt": ok = vals.some(v => cmp(v, arg) === 1); break;
        case "$gte": ok = vals.some(v => { const c = cmp(v, arg); return c === 1 || c === 0; }); break;
        case "$lt": ok = vals.some(v => cmp(v, arg) === -1); break;
        case "$lte": ok = vals.some(v => { const c = cmp(v, arg); return c === -1 || c === 0; }); break;
        case "$in": if (!Array.isArray(arg)) throw new Error("$in needs an array"); ok = vals.some(v => arg.some(a => eq(v, a))); break;
        case "$nin": if (!Array.isArray(arg)) throw new Error("$nin needs an array"); ok = !vals.some(v => arg.some(a => eq(v, a))); break;
        case "$exists": ok = arg ? vals.length > 0 : vals.length === 0; break;
        default: throw new Error(`unknown operator: ${op}`);
      }
      if (!ok) return false;
    }
    return true;
  }
  function match(doc, f) {
    for (const [k, cond] of Object.entries(f || {})) {
      if (k === "$and") { if (!cond.every(x => match(doc, x))) return false; continue; }
      if (k === "$or") { if (!cond.some(x => match(doc, x))) return false; continue; }
      if (k.startsWith("$")) throw new Error(`unknown top level operator: ${k}`);
      const vals = values(doc, k);
      if (isObj(cond) && Object.keys(cond).length && Object.keys(cond).every(o => o.startsWith("$"))) { if (!matchOps(vals, cond, k)) return false; }
      else if (!vals.some(v => eq(v, cond))) return false;
    }
    return true;
  }

  function project(doc, p) {
    if (!p || !Object.keys(p).length) return clone(doc);
    const keys = Object.entries(p), incl = keys.filter(([k, v]) => k !== "_id" && v).length > 0;
    let out;
    if (incl) {
      out = {};
      if (p._id !== 0 && p._id !== false && "_id" in doc) out._id = doc._id;
      for (const [k, v] of keys) {
        if (k === "_id" || !v) continue;
        const parts = k.split("."); let src = doc, dst = out;
        for (let i = 0; i < parts.length; i++) {
          if (src === undefined || src === null) break;
          if (i === parts.length - 1) { if (parts[i] in src) dst[parts[i]] = clone(src[parts[i]]); }
          else { src = src[parts[i]]; if (Array.isArray(src)) { dst[parts[i]] = src.map(x => project(x, { [parts.slice(i + 1).join(".")]: 1, _id: 0 })); break; } dst = dst[parts[i]] = dst[parts[i]] || {}; }
        }
      }
    } else { out = clone(doc); for (const [k] of keys) delete out[k]; }
    return out;
  }

  function setPath(doc, path, fn) {
    const parts = path.split("."); let o = doc;
    for (let i = 0; i < parts.length - 1; i++) { if (!isObj(o[parts[i]]) && !Array.isArray(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
    fn(o, parts[parts.length - 1]);
  }
  function applyUpdate(doc, u) {
    if (!isObj(u) || !Object.keys(u).length || !Object.keys(u).every(k => k.startsWith("$")))
      throw new Error("Update document requires atomic operators — используйте $set, $inc, $push…");
    const before = JSON.stringify(doc);
    for (const [op, fields] of Object.entries(u)) for (const [path, val] of Object.entries(fields)) {
      if (path === "_id") throw new Error("Performing an update on the path '_id' would modify the immutable field '_id'");
      switch (op) {
        case "$set": setPath(doc, path, (o, k) => (o[k] = clone(val))); break;
        case "$unset": setPath(doc, path, (o, k) => delete o[k]); break;
        case "$inc": setPath(doc, path, (o, k) => { if (o[k] !== undefined && typeof o[k] !== "number") throw new Error(`Cannot apply $inc to a value of non-numeric type`); o[k] = (o[k] || 0) + val; }); break;
        case "$push": setPath(doc, path, (o, k) => { if (o[k] === undefined) o[k] = []; if (!Array.isArray(o[k])) throw new Error(`The field '${path}' must be an array`); if (isObj(val) && val.$each) o[k].push(...clone(val.$each)); else o[k].push(clone(val)); }); break;
        case "$pull": setPath(doc, path, (o, k) => { if (Array.isArray(o[k])) o[k] = o[k].filter(x => !(isObj(val) ? match(x, val) : eq(x, val))); }); break;
        default: throw new Error(`Unknown modifier: ${op}`);
      }
    }
    return JSON.stringify(doc) !== before;
  }

  class Cursor {
    constructor(docs, proj) { this._docs = docs; this._proj = proj; this._sort = null; this._skip = 0; this._limit = 0; }
    sort(s) { this._sort = s; return this; }
    skip(n) { this._skip = n; return this; }
    limit(n) { this._limit = n; return this; }
    count() { return this._docs.length; }
    toArray() {
      let d = this._docs.slice();
      if (this._sort) {
        const keys = Object.entries(this._sort);
        d.sort((a, b) => { for (const [k, dir] of keys) { const x = values(a, k)[0], y = values(b, k)[0]; if (x === y) continue; if (x === undefined) return -dir; if (y === undefined) return dir; return (x < y ? -1 : 1) * dir; } return 0; });
      }
      d = d.slice(this._skip, this._limit ? this._skip + this._limit : undefined);
      return d.map(x => project(x, this._proj));
    }
  }

  class Collection {
    constructor(db, name) { this._db = db; this._name = name; this._docs = []; this._next = 1; }
    _touch() { this._db._used.add(this._name); }
    find(f = {}, p) { this._touch(); return new Cursor(this._docs.filter(d => match(d, f)), p); }
    findOne(f = {}, p) { this._touch(); const d = this._docs.find(x => match(x, f)); return d ? project(d, p) : null; }
    countDocuments(f = {}) { this._touch(); return this._docs.filter(d => match(d, f)).length; }
    insertOne(doc) {
      if (!isObj(doc)) throw new Error("insertOne ожидает документ в фигурных скобках { … }");
      let d = clone(doc); if (d._id === undefined) d = { _id: this._newId(), ...d };   // _id первым, как в MongoDB
      if (this._docs.some(x => eq(x._id, d._id))) throw new Error(`E11000 duplicate key error collection: ${this._name} index: _id_ dup key: { _id: ${JSON.stringify(d._id)} }`);
      this._docs.push(d); this._db._created.add(this._name); return { acknowledged: true, insertedId: d._id };
    }
    insertMany(arr) { const ids = arr.map(d => this.insertOne(d).insertedId); return { acknowledged: true, insertedIds: ids }; }
    _upd(f, u, many) {
      let matched = 0, modified = 0;
      for (const d of this._docs) { if (!match(d, f)) continue; matched++; if (applyUpdate(d, u)) modified++; if (!many) break; }
      return { acknowledged: true, matchedCount: matched, modifiedCount: modified };
    }
    updateOne(f, u) { return this._upd(f, u, false); }
    updateMany(f, u) { return this._upd(f, u, true); }
    _del(f, many) { let k = 0; this._docs = this._docs.filter(d => { if ((many || !k) && match(d, f)) { k++; return false; } return true; }); return { acknowledged: true, deletedCount: k }; }
    deleteOne(f) { return this._del(f, false); }
    deleteMany(f) { return this._del(f, true); }
    _newId() { return this._name.slice(0, 2) + String(this._next++).padStart(3, "0"); }
  }

  class MiniMongo {
    constructor() {
      this._colls = {}; this._used = new Set(); this._created = new Set();
      const self = this;
      this.db = new Proxy({}, {
        get(_, name) {
          if (typeof name !== "string") return undefined;
          if (name === "getCollectionNames") return () => Object.keys(self._colls).filter(n => self._colls[n]._docs.length);
          if (!self._colls[name]) self._colls[name] = new Collection(self, name);
          return self._colls[name];
        },
      });
    }
    coll(name) { return this.db[name]; }
    names() { return Object.keys(this._colls).filter(n => this._colls[n]._docs.length); }
    // выполнить код mongosh; результат — значение последнего выражения
    exec(code) {
      this._used = new Set();
      const prev = window.db; window.db = this.db;
      try {
        let v = (0, eval)(code);
        if (v instanceof Cursor) v = v.toArray();
        const empty = [...this._used].filter(n => !this._colls[n]._docs.length);
        return { value: v, empty };
      } finally { window.db = prev; }
    }
  }

  // стартовые данные: та же афиша, но каждый спектакль — один документ со всем внутри
  MiniMongo.seed = function (m) {
    const V = {
      main: { name: "Основная сцена", address: "Театральная пл., 1" }, small: { name: "Малая сцена", address: "Театральная пл., 1, стр. 2" },
      fresh: { name: "Новая сцена", address: "ул. Новослободская, 12" }, garden: { name: "Летний сад", address: "Сад «Эрмитаж», эстрада" },
      music: { name: "Дом музыки", address: "Космодамианская наб., 52" }, chamber: { name: "Камерный зал", address: "ул. Покровка, 8" },
    };
    const P = (dates, price) => dates.map((d, i) => ({ date: d, price: price + (i % 3) * 500 }));
    const shows = [
      { title: "Гамлет", genre: "драма", age: "16+", venue: V.main, actors: [{ name: "Андрей Соколов", role: "Гамлет" }, { name: "Мария Лебедева", role: "Офелия" }, { name: "Илья Морозов", role: "Клавдий" }, { name: "Ольга Волкова", role: "Гертруда" }], performances: P(["2026-10-03", "2026-10-17", "2026-11-07"], 3500), rating: 4.8 },
      { title: "Щелкунчик", genre: "балет", age: "0+", venue: V.main, actors: [{ name: "Екатерина Смирнова", role: "Мари" }, { name: "Павел Фёдоров", role: "Щелкунчик" }], performances: P(["2026-12-25", "2026-12-30", "2027-01-03"], 4500), rating: 4.9 },
      { title: "Евгений Онегин", genre: "опера", age: "12+", venue: V.main, actors: [{ name: "Михаил Егоров", role: "Онегин" }, { name: "Мария Лебедева", role: "Татьяна" }], performances: P(["2026-10-10", "2026-11-14"], 4000), rating: 4.7 },
      { title: "Джаз в саду", genre: "концерт", age: "0+", venue: V.garden, performers: ["Квартет «Эрмитаж»", "Анна Козлова, вокал"], outdoor: true, performances: P(["2026-10-04"], 1500) },
      { title: "Вишнёвый сад", genre: "драма", age: "12+", venue: V.fresh, actors: [{ name: "Наталья Орлова", role: "Раневская" }, { name: "Сергей Павлов", role: "Лопахин" }], performances: P(["2026-10-12", "2026-11-02"], 2500), rating: 4.5 },
      { title: "Лебединое озеро", genre: "балет", age: "6+", venue: V.main, actors: [{ name: "Ирина Захарова", role: "Одетта" }, { name: "Алексей Белов", role: "Зигфрид" }], performances: P(["2026-11-21", "2026-12-05"], 5000), rating: 4.9 },
      { title: "Ревизор", genre: "комедия", age: "12+", venue: V.fresh, actors: [{ name: "Дмитрий Новиков", role: "Хлестаков" }, { name: "Андрей Соколов", role: "Городничий" }], performances: P(["2026-10-24"], 2000), rating: 4.4 },
      { title: "Кармен", genre: "опера", age: "16+", venue: V.music, actors: [{ name: "Татьяна Медведева", role: "Кармен" }, { name: "Николай Степанов", role: "Хозе" }], performances: P(["2026-11-28"], 3800), rating: 4.6 },
      { title: "Маленький принц", genre: "детский", age: "6+", venue: V.small, actors: [{ name: "Юлия Алексеева", role: "Принц" }, { name: "Виктор Никитин", role: "Лётчик" }], performances: P(["2026-10-11", "2026-10-18", "2026-10-25"], 1200), rating: 4.8 },
      { title: "Буратино", genre: "детский", age: "0+", venue: V.small, actors: [{ name: "Роман Кузьмин", role: "Буратино" }, { name: "Елена Макарова", role: "Мальвина" }], performances: P(["2026-10-04", "2026-11-01"], 900), rating: 4.6 },
      { title: "Мастер и Маргарита", genre: "драма", age: "18+", venue: V.fresh, actors: [{ name: "Илья Морозов", role: "Воланд" }, { name: "Светлана Тарасова", role: "Маргарита" }], performances: P(["2026-10-31", "2026-11-13"], 3000), rating: 4.7 },
      { title: "Выставка «Театральный костюм»", genre: "выставка", age: "0+", venue: V.chamber, halls: ["Зал 1: XIX век", "Зал 2: советский театр"], open: { from: "2026-10-01", to: "2027-01-31" }, price: 600 },
    ];
    const c = m.coll("shows"); shows.forEach(d => c.insertOne(d)); m._created = new Set();
  };

  window.MiniMongo = MiniMongo;
})();
