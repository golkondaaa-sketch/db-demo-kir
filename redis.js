// Мини-Redis: строки, хэши, списки, отсортированные множества, время жизни ключей.
// Отвечает в формате redis-cli, чтобы потом не удивляться настоящему.
"use strict";
(function () {
  const ERR_ARGS = c => `ERR wrong number of arguments for '${c.toLowerCase()}' command`;
  const WRONGTYPE = "WRONGTYPE Operation against a key holding the wrong kind of value";

  function tokenize(line) {   // аргументы через пробел, "в кавычках" — одним аргументом
    const out = []; let cur = "", q = null, has = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === "\\" && i + 1 < line.length) { cur += line[++i]; } else if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
      if (/\s/.test(ch)) { if (has || cur) out.push(cur); cur = ""; has = false; continue; }
      cur += ch; has = true;
    }
    if (q) throw new Error("ERR unbalanced quotes in request");
    if (has || cur) out.push(cur);
    return out;
  }
  const glob = p => new RegExp("^" + p.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  const isInt = s => /^-?\d+$/.test(s);
  const fmtNum = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(6)));

  class MiniRedis {
    constructor() { this.m = new Map(); }
    get(k) { const e = this.m.get(k); if (!e) return null; if (e.exp && e.exp <= Date.now()) { this.m.delete(k); return null; } return e; }
    typed(k, t) { const e = this.get(k); if (e && e.t !== t) throw new Error(WRONGTYPE); return e; }
    keys() { return [...this.m.keys()].filter(k => this.get(k)); }

    // ответ: {t: "ok"|"int"|"nil"|"str"|"arr"|"err", v}
    command(args) {
      if (!args.length) return null;
      const c = args[0].toUpperCase(), a = args.slice(1), n = a.length;
      const need = (min, max = min) => { if (n < min || n > max) throw new Error(ERR_ARGS(c)); };
      const int = v => ({ t: "int", v });
      switch (c) {
        case "PING": return { t: "str", v: "PONG", raw: true };
        case "SET": {
          if (n < 2) throw new Error(ERR_ARGS(c));
          let exp = 0, nx = false;
          for (let i = 2; i < n; i++) {
            const o = a[i].toUpperCase();
            if ((o === "EX" || o === "PX") && i + 1 < n && isInt(a[i + 1])) { exp = Date.now() + (+a[++i]) * (o === "EX" ? 1000 : 1); }
            else if (o === "NX") nx = true;
            else throw new Error("ERR syntax error");
          }
          if (nx && this.get(a[0])) return { t: "nil" };
          this.m.set(a[0], { t: "string", v: a[1], exp }); return { t: "ok" };
        }
        case "GET": { need(1); const e = this.typed(a[0], "string"); return e ? { t: "str", v: e.v } : { t: "nil" }; }
        case "DEL": { if (!n) throw new Error(ERR_ARGS(c)); let k = 0; for (const x of a) if (this.get(x)) { this.m.delete(x); k++; } return int(k); }
        case "EXISTS": { if (!n) throw new Error(ERR_ARGS(c)); return int(a.filter(x => this.get(x)).length); }
        case "EXPIRE": { need(2); if (!isInt(a[1])) throw new Error("ERR value is not an integer or out of range"); const e = this.get(a[0]); if (!e) return int(0); e.exp = Date.now() + (+a[1]) * 1000; return int(1); }
        case "PERSIST": { need(1); const e = this.get(a[0]); if (!e || !e.exp) return int(0); e.exp = 0; return int(1); }
        case "TTL": { need(1); const e = this.get(a[0]); if (!e) return int(-2); if (!e.exp) return int(-1); return int(Math.ceil((e.exp - Date.now()) / 1000)); }
        case "TYPE": { need(1); const e = this.get(a[0]); return { t: "str", v: e ? e.t : "none", raw: true }; }
        case "KEYS": { need(1); const re = glob(a[0]); return { t: "arr", v: this.keys().filter(k => re.test(k)).sort().map(v => ({ t: "str", v })) }; }
        case "DBSIZE": { need(0); return int(this.keys().length); }
        case "INCR": case "DECR": case "INCRBY": case "DECRBY": {
          need(c.endsWith("BY") ? 2 : 1);
          const by = c === "INCR" ? 1 : c === "DECR" ? -1 : (isInt(a[1]) ? +a[1] : NaN) * (c === "DECRBY" ? -1 : 1);
          if (Number.isNaN(by)) throw new Error("ERR value is not an integer or out of range");
          let e = this.typed(a[0], "string");
          if (e && !isInt(e.v)) throw new Error("ERR value is not an integer or out of range");
          if (!e) { e = { t: "string", v: "0", exp: 0 }; this.m.set(a[0], e); }
          e.v = String(+e.v + by); return int(+e.v);
        }
        case "HSET": {
          if (n < 3 || n % 2 === 0) throw new Error(ERR_ARGS(c));
          let e = this.typed(a[0], "hash"); if (!e) { e = { t: "hash", v: new Map(), exp: 0 }; this.m.set(a[0], e); }
          let added = 0; for (let i = 1; i < n; i += 2) { if (!e.v.has(a[i])) added++; e.v.set(a[i], a[i + 1]); } return int(added);
        }
        case "HGET": { need(2); const e = this.typed(a[0], "hash"); return e && e.v.has(a[1]) ? { t: "str", v: e.v.get(a[1]) } : { t: "nil" }; }
        case "HDEL": { if (n < 2) throw new Error(ERR_ARGS(c)); const e = this.typed(a[0], "hash"); if (!e) return int(0); let k = 0; for (const f of a.slice(1)) if (e.v.delete(f)) k++; if (!e.v.size) this.m.delete(a[0]); return int(k); }
        case "HGETALL": { need(1); const e = this.typed(a[0], "hash"); return { t: "arr", v: e ? [...e.v].flatMap(([f, v]) => [{ t: "str", v: f }, { t: "str", v }]) : [] }; }
        case "LPUSH": case "RPUSH": {
          if (n < 2) throw new Error(ERR_ARGS(c));
          let e = this.typed(a[0], "list"); if (!e) { e = { t: "list", v: [], exp: 0 }; this.m.set(a[0], e); }
          for (const x of a.slice(1)) c === "LPUSH" ? e.v.unshift(x) : e.v.push(x); return int(e.v.length);
        }
        case "LPOP": case "RPOP": {
          need(1); const e = this.typed(a[0], "list"); if (!e) return { t: "nil" };
          const v = c === "LPOP" ? e.v.shift() : e.v.pop(); if (!e.v.length) this.m.delete(a[0]); return { t: "str", v };
        }
        case "LLEN": { need(1); const e = this.typed(a[0], "list"); return int(e ? e.v.length : 0); }
        case "LRANGE": {
          need(3); if (!isInt(a[1]) || !isInt(a[2])) throw new Error("ERR value is not an integer or out of range");
          const e = this.typed(a[0], "list"); if (!e) return { t: "arr", v: [] };
          const L = e.v.length; let s = +a[1], t = +a[2]; if (s < 0) s += L; if (t < 0) t += L; s = Math.max(0, s);
          return { t: "arr", v: e.v.slice(s, t + 1).map(v => ({ t: "str", v })) };
        }
        case "ZADD": case "ZINCRBY": {
          if (c === "ZINCRBY") need(3); else if (n < 3 || n % 2 === 0) throw new Error(ERR_ARGS(c));
          let e = this.typed(a[0], "zset"); if (!e) { e = { t: "zset", v: new Map(), exp: 0 }; this.m.set(a[0], e); }
          if (c === "ZINCRBY") {
            if (Number.isNaN(+a[1])) throw new Error("ERR value is not a valid float");
            const v = (e.v.get(a[2]) || 0) + +a[1]; e.v.set(a[2], v); return { t: "str", v: fmtNum(v) };
          }
          let added = 0;
          for (let i = 1; i < n; i += 2) { if (Number.isNaN(+a[i])) throw new Error("ERR value is not a valid float"); if (!e.v.has(a[i + 1])) added++; e.v.set(a[i + 1], +a[i]); }
          return int(added);
        }
        case "ZSCORE": { need(2); const e = this.typed(a[0], "zset"); return e && e.v.has(a[1]) ? { t: "str", v: fmtNum(e.v.get(a[1])) } : { t: "nil" }; }
        case "ZRANGE": case "ZREVRANGE": {
          if (n < 3 || n > 4 || (n === 4 && a[3].toUpperCase() !== "WITHSCORES")) throw new Error(n < 3 ? ERR_ARGS(c) : "ERR syntax error");
          const e = this.typed(a[0], "zset"); if (!e) return { t: "arr", v: [] };
          const items = [...e.v].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1)); if (c === "ZREVRANGE") items.reverse();
          const L = items.length; let s = +a[1], t = +a[2]; if (s < 0) s += L; if (t < 0) t += L; s = Math.max(0, s);
          return { t: "arr", v: items.slice(s, t + 1).flatMap(([m, sc]) => (n === 4 ? [{ t: "str", v: m }, { t: "str", v: fmtNum(sc) }] : [{ t: "str", v: m }])) };
        }
        case "FLUSHALL": case "FLUSHDB": { this.m.clear(); return { t: "ok" }; }
        case "SELECT": case "FROM": case "INSERT": case "UPDATE": case "CREATE":
          throw new Error(`ERR unknown command '${args[0]}'`);
        default: throw new Error(`ERR unknown command '${args[0]}', with args beginning with: ${a.slice(0, 3).map(x => `'${x}'`).join(" ")}`);
      }
    }

    // выполнение «скрипта»: строка = команда; # и // — комментарии
    exec(code) {
      const lines = [];
      for (const raw of code.split("\n")) {
        const line = raw.replace(/^\s*(#|\/\/).*$/, "").trim(); if (!line) continue;
        let reply; try { reply = this.command(tokenize(line)); } catch (e) { reply = { t: "err", v: e.message }; }
        if (reply) lines.push({ cmd: line, reply });
      }
      return lines;
    }
  }
  MiniRedis.tokenize = tokenize;

  // как отвечает redis-cli
  function format(r, indent = "") {
    switch (r.t) {
      case "ok": return "OK";
      case "int": return `(integer) ${r.v}`;
      case "nil": return "(nil)";
      case "err": return `(error) ${r.v}`;
      case "str": return r.raw ? r.v : JSON.stringify(r.v);
      case "arr": return r.v.length ? r.v.map((x, i) => `${i ? indent : ""}${i + 1}) ${format(x, indent + "   ")}`).join("\n") : "(empty array)";
    }
    return "";
  }
  MiniRedis.format = format;

  // стартовые данные: немного ключей, чтобы было что смотреть
  MiniRedis.seed = function (r) {
    r.command(["SET", "views:Гамлет", "1520"]);
    r.command(["SET", "views:Щелкунчик", "2310"]);
    r.command(["ZADD", "top:shows", "1520", "Гамлет", "2310", "Щелкунчик", "980", "Евгений Онегин", "1210", "Лебединое озеро", "640", "Ревизор"]);
    r.command(["RPUSH", "queue:emails", "билет №1001 → ivanov.i.01@example.com", "билет №1002 → petrova.a.01@example.com"]);
    r.command(["HSET", "session:7f3a9c", "user_id", "2", "name", "Петрова Анна", "cart", "Щелкунчик ×2"]);
    r.command(["EXPIRE", "session:7f3a9c", "1800"]);
  };

  window.MiniRedis = MiniRedis;
})();
