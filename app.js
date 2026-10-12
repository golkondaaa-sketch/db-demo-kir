// Оболочка тренажёра: вкладки, редактор, запуск (SQL / Redis / MongoDB), самопроверка, панель справа, песочница.
"use strict";
(function () {
  const KEY = "db-trainer-v1";
  let SQL = null;                 // модуль sql.js
  const inst = {};                // экземпляр движка на вкладку (большая база — общая для вкладок с big: true)
  let S = { tab: TABS[0].id, done: {}, code: {}, hint: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) S = { ...S, ...s }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const $ = s => document.querySelector(s);
  const el = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstElementChild; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tab = () => TABS.find(t => t.id === S.tab) || TABS[0];
  const tkey = (t, i) => `${t.id}:${i}`;
  const fmtN = n => Number(n).toLocaleString("ru-RU");
  const BIG = { perShow: 30, bookings: 100000, viewers: 10000 };

  // ================= SQL =================
  // запросы выполняются по одному: время показываем для последнего запроса с результатом, а не суммарное
  const sqlRun = (d, sql) => {
    let last = null, total = 0, n = 0;
    for (const st of d.iterateStatements(sql)) {
      const t0 = performance.now(), cols = st.getColumnNames(), rows = [];
      while (st.step()) rows.push(st.get());
      const ms = performance.now() - t0; total += ms; n++;
      if (cols.length) last = { cols, rows, ms };
    }
    return { cols: last ? last.cols : [], rows: last ? last.rows : [], ms: last ? last.ms : total, total, n, changes: d.getRowsModified() };
  };
  function sqlExplain(m, code) {
    let x;
    if (/\.\.\./.test((code || "").replace(/--.*$/gm, ""))) return "В запросе осталось многоточие <code>...</code> — впишите вместо него своё значение.";
    if ((x = m.match(/no such table: (\S+)/))) return `Нет таблицы <code>${esc(x[1])}</code>. Список таблиц — справа, в схеме.`;
    if ((x = m.match(/no such column: (\S+)/))) return `Нет столбца <code>${esc(x[1])}</code>. Проверьте название в схеме справа и букву-псевдоним таблицы перед точкой.`;
    if ((x = m.match(/no such index: (\S+)/))) return `Нет индекса <code>${esc(x[1])}</code>.`;
    if ((x = m.match(/index (\S+) already exists/))) return `Индекс <code>${esc(x[1])}</code> уже создан. Чтобы создать заново — сначала <code>DROP INDEX ${esc(x[1])};</code>`;
    if ((x = m.match(/near "(.*?)": syntax error/))) return `Ошибка в записи запроса рядом с <code>${esc(x[1])}</code>: лишний или пропущенный знак, незакрытая кавычка.`;
    if (/incomplete input/.test(m)) return "Запрос оборван: не хватает конца — закрывающей скобки или кавычки.";
    if ((x = m.match(/UNIQUE constraint failed: (.+)/))) return `Нарушена уникальность: в <code>${esc(x[1])}</code> такое значение уже есть.`;
    if (/FOREIGN KEY constraint failed/.test(m)) return "Нарушен внешний ключ: ссылка ведёт на строку, которой нет, — или на эту строку кто-то ссылается.";
    if ((x = m.match(/NOT NULL constraint failed: (.+)/))) return `Пустое значение в обязательном столбце <code>${esc(x[1])}</code>.`;
    if (/CHECK constraint failed/.test(m)) return "Значение не прошло проверку CHECK — правило, записанное в самой таблице.";
    if (/ambiguous column name/.test(m)) return "Такой столбец есть в нескольких таблицах запроса — уточните таблицу: <code>b.id</code>, а не <code>id</code>.";
    if (/within a transaction/.test(m)) return "Транзакция уже открыта: сначала завершите её — <code>COMMIT</code> или <code>ROLLBACK</code>.";
    if (/no transaction is active/.test(m)) return "Нет открытой транзакции: COMMIT и ROLLBACK работают только после BEGIN.";
    return "";
  }
  const sqlEngine = {
    create(t) {
      const key = t.big ? "#big" : t.id;
      if (!inst[key]) { const d = new SQL.Database(); Seed.build(d, t.big ? BIG : undefined); if (t.setup) d.run(t.setup); inst[key] = d; }
      if (t.big && t.setup && !inst[key][`#${t.id}`]) { inst[key].run(t.setup); inst[key][`#${t.id}`] = 1; }
      return inst[key];
    },
    reset(t) { const key = t.big ? "#big" : t.id; if (inst[key]) inst[key].close(); delete inst[key]; },
    exec(d, code) {
      try {
        const out = sqlRun(d, code);
        // транзакция осталась открытой (BEGIN без COMMIT): закрываем, как закрыла бы программа, потеряв соединение
        try { d.run("BEGIN"); d.run("ROLLBACK"); } catch (e) { if (/within a transaction/.test(e.message)) { d.run("ROLLBACK"); out.leftOpen = true; } }
        return out;
      }
      catch (e) {
        let rolled = false; try { d.run("ROLLBACK"); rolled = true; } catch (_) {}
        return { error: e.message, hint: sqlExplain(e.message, code), rolled };
      }
    },
    render(box, out, opt = {}) {
      box.innerHTML = "";
      if (out.prepNote) box.appendChild(el(`<div class="prep">↺ ${out.prepNote}</div>`));
      if (out.leftOpen) box.appendChild(el(`<div class="note-rb">⚠ Транзакция осталась открытой: <code>BEGIN</code> есть, а <code>COMMIT</code> не выполнился. Такие изменения не зафиксированы — когда программа закрывает соединение без <code>COMMIT</code>, база всё откатывает. Здесь откатили сразу.</div>`));
      if (out.error) {
        box.appendChild(el(opt.expected
          ? `<div class="err exp"><b>База остановила операцию — так и задумано</b>${out.hint ? `<div>${out.hint}</div>` : ""}<code class="orig">${esc(out.error)}</code></div>`
          : `<div class="err"><b>База ответила ошибкой</b>${out.hint ? `<div>${out.hint}</div>` : ""}<code class="orig">${esc(out.error)}</code></div>`));
        if (out.rolled) box.appendChild(el(`<div class="note-rb">↩ Транзакция была открыта — приложение получило ошибку и выполнило <code>ROLLBACK</code>: всё, что сделано после <code>BEGIN</code>, отменено.</div>`));
        return;
      }
      if (!out.cols.length) { box.appendChild(el(`<div class="ok-run">Выполнено. Изменено строк: <b>${fmtN(out.changes)}</b> · <span class="ms">${out.total.toFixed(1)} мс</span></div>`)); return; }
      const lim = 100, rows = out.rows.slice(0, lim), plan = out.cols.includes("detail") && out.cols.includes("parent");
      box.appendChild(el(`<div class="res"><div class="meta">Строк: <b>${fmtN(out.rows.length)}</b>${out.rows.length > lim ? ` (показаны первые ${lim})` : ""} · <span class="ms">${out.ms.toFixed(1)} мс</span>${out.n > 1 ? ` <span class="tot">· весь текст в окне: ${out.total.toFixed(1)} мс</span>` : ""}</div>
        ${plan ? `<div class="plan">${out.rows.map(r => { const d = String(r[3]); return `<div class="${/^SCAN/.test(d) ? "scan" : /SEARCH|USING/.test(d) ? "search" : ""}">${esc(d)}</div>`; }).join("")}</div>` : ""}
        <div class="tw"><table><thead><tr>${out.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(v => `<td class="${v === null ? "nul" : typeof v === "number" ? "num" : ""}">${v === null ? "NULL" : esc(typeof v === "number" ? fmtN(v) : v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`));
    },
    side(d, t, box) {
      box.innerHTML = `<div class="lbl">Схема базы</div>`;
      if (t.watch) {
        const w = el(`<div class="watch"><div class="lbl">Следим</div></div>`);
        for (const [label, q] of t.watch) { let v; try { v = sqlRun(d, q).rows.map(r => r.join(" · ")).join("<br>") || "—"; } catch (e) { v = "—"; } w.appendChild(el(`<div class="wl"><span>${label}</span><b>${v}</b></div>`)); }
        box.appendChild(w);
      }
      const tables = sqlRun(d, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY rowid").rows.map(r => r[0]);
      for (const name of tables) {
        const cols = sqlRun(d, `PRAGMA table_info("${name}")`).rows, fks = sqlRun(d, `PRAGMA foreign_key_list("${name}")`).rows;
        const idx = sqlRun(d, `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${name}' AND sql IS NOT NULL`).rows.map(r => r[0]);
        const cnt = sqlRun(d, `SELECT COUNT(*) FROM "${name}"`).rows[0][0];
        const card = el(`<div class="tbl"><button class="tn" title="Показать первые строки">${esc(name)} <small>${fmtN(cnt)} строк</small></button>
          <div class="cols">${cols.map(c => { const fk = fks.find(f => f[3] === c[1]); return `<div class="col"><span class="cn">${c[5] ? "🔑 " : ""}${esc(c[1])}</span><span class="ct">${esc(c[2].toLowerCase())}${fk ? ` → ${esc(fk[2])}` : ""}</span></div>`; }).join("")}</div>
          ${idx.length ? `<div class="idx">${idx.map(i => `⚡ ${esc(i)}`).join("<br>")}</div>` : ""}</div>`);
        card.querySelector(".tn").onclick = () => sandbox(`SELECT * FROM ${name} LIMIT 20;`, true);
        box.appendChild(card);
      }
      box.appendChild(el(`<div class="legend">🔑 первичный ключ · → внешний ключ · ⚡ индекс. Клик по таблице — первые 20 строк в песочнице внизу.</div>`));
    },
    sandbox: "-- здесь можно писать любые запросы к базе этой вкладки\nSELECT * FROM venues;",
  };

  // ================= Redis =================
  function redisExplain(msg, cmd) {
    if (/unknown command/.test(msg)) return /^(select|insert|update|create|delete)\b/i.test(cmd) ? "Это SQL. Redis не понимает SQL — у него свои короткие команды: SET, GET, HSET…" : "Такой команды нет. Список команд — в шпаргалке над заданиями.";
    if (/wrong number of arguments/.test(msg)) return "Не то число аргументов: проверьте, что всё на месте. Текст с пробелами берите в кавычки.";
    if (/WRONGTYPE/.test(msg)) return "Под этим ключом лежит значение другого типа: например, команда для строки применена к хэшу.";
    if (/not an integer/.test(msg)) return "Ожидалось целое число.";
    if (/syntax error/.test(msg)) return "Лишние или неверные аргументы. Текст с пробелами берите в кавычки.";
    return "";
  }
  const redisEngine = {
    create(t) { if (!inst[t.id]) { const r = new MiniRedis(); MiniRedis.seed(r); inst[t.id] = r; } return inst[t.id]; },
    reset(t) { delete inst[t.id]; },
    exec(r, code) { const lines = r.exec(code); const bad = lines.find(l => l.reply.t === "err"); return { lines, error: bad ? bad.reply.v : null }; },
    render(box, out) {
      if (!out.lines.length) { box.innerHTML = `<div class="ok-run">Команд нет — напишите хотя бы одну.</div>`; return; }
      box.innerHTML = `<div class="term">${out.lines.map(l => {
        const e = l.reply.t === "err", ex = e ? redisExplain(l.reply.v, l.cmd) : "";
        return `<div class="tc">&gt; ${esc(l.cmd)}</div><div class="tr ${e ? "te" : ""}">${esc(MiniRedis.format(l.reply))}</div>${ex ? `<div class="tx">${ex}</div>` : ""}`;
      }).join("")}</div>`;
    },
    side(r, t, box) {
      const draw = () => {
        const keys = r.keys().sort();
        box.innerHTML = `<div class="lbl">Что лежит в Redis · ${keys.length} ${keys.length % 10 === 1 && keys.length % 100 !== 11 ? "ключ" : "ключей"}</div>`;
        for (const k of keys) {
          const e = r.get(k); if (!e) continue;
          let v;
          if (e.t === "string") v = esc(e.v);
          else if (e.t === "hash") v = [...e.v].map(([f, x]) => `${esc(f)}: ${esc(x)}`).join("<br>");
          else if (e.t === "list") v = e.v.map((x, i) => `${i}. ${esc(x)}`).join("<br>") || "—";
          else v = [...e.v].sort((a, b) => b[1] - a[1]).map(([m, s]) => `${esc(m)} — ${s}`).join("<br>");
          const ttl = e.exp ? Math.max(0, Math.ceil((e.exp - Date.now()) / 1000)) : null;
          box.appendChild(el(`<div class="rk"><div class="rkh"><code>${esc(k)}</code><span class="rt">${e.t}</span>${ttl !== null ? `<span class="ttl">⏱ ${ttl} с</span>` : ""}</div><div class="rv">${v}</div></div>`));
        }
        box.appendChild(el(`<div class="legend">Ключи с ⏱ исчезнут сами, когда время выйдет. Типы: string — строка, hash — набор полей, list — список, zset — рейтинг.</div>`));
      };
      draw();
      clearInterval(redisEngine._tick); redisEngine._tick = setInterval(() => { if (tab().kind === "redis") draw(); else clearInterval(redisEngine._tick); }, 1000);
    },
    sandbox: "# по команде в строке\nKEYS *",
  };

  // ================= MongoDB =================
  function mongoExplain(e) {
    const m = e.message || String(e);
    if (e instanceof SyntaxError) return "Ошибка в записи: проверьте скобки, кавычки и запятые. Текст — в кавычках, документ — в фигурных скобках { }.";
    if (/is not a function/.test(m)) return "Нет такой команды у коллекции. Есть: find, findOne, countDocuments, insertOne, updateOne, updateMany, deleteOne.";
    if (/is not defined/.test(m)) { const x = m.match(/(\S+) is not defined/); return `Неизвестное имя <code>${esc(x ? x[1] : "")}</code>. Если это текст — возьмите его в кавычки.`; }
    if (/atomic operators/.test(m)) return "Вторым аргументом update нужно сказать, что сделать: <code>{ $set: { поле: значение } }</code>.";
    if (/E11000/.test(m)) return "Документ с таким _id уже есть.";
    if (/unknown operator/.test(m)) return "Неизвестный оператор. Есть: $gt, $gte, $lt, $lte, $ne, $in, $nin, $exists.";
    return "";
  }
  const pretty = (v, ind = "") => {
    const n = ind + "  ";
    if (v === null || v === undefined) return `<span class="jn">null</span>`;
    if (typeof v === "number" || typeof v === "boolean") return `<span class="jn">${v}</span>`;
    if (typeof v === "string") return `<span class="js">"${esc(v)}"</span>`;
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (v.every(x => typeof x !== "object")) return `[ ${v.map(x => pretty(x)).join(", ")} ]`;
      return `[\n${v.map(x => n + pretty(x, n)).join(",\n")}\n${ind}]`;
    }
    const ks = Object.keys(v); if (!ks.length) return "{}";
    return `{\n${ks.map(k => `${n}<span class="jk">${esc(k)}</span>: ${pretty(v[k], n)}`).join(",\n")}\n${ind}}`;
  };
  const mongoEngine = {
    create(t) { if (!inst[t.id]) { const m = new MiniMongo(); MiniMongo.seed(m); inst[t.id] = m; } return inst[t.id]; },
    reset(t) { delete inst[t.id]; },
    exec(m, code) {
      const t0 = performance.now();
      try { const r = m.exec(code); return { value: r.value, empty: r.empty, ms: performance.now() - t0 }; }
      catch (e) { return { error: e.message || String(e), hint: mongoExplain(e) }; }
    },
    render(box, out) {
      box.innerHTML = "";
      if (out.error) { box.appendChild(el(`<div class="err"><b>MongoDB ответила ошибкой</b>${out.hint ? `<div>${out.hint}</div>` : ""}<code class="orig">${esc(out.error)}</code></div>`)); return; }
      for (const n of out.empty || []) box.appendChild(el(`<div class="note-rb">Коллекции <code>${esc(n)}</code> нет или она пуста. MongoDB не ругается на опечатку в названии — просто вернёт пусто. Список коллекций — справа.</div>`));
      const v = out.value;
      if (Array.isArray(v)) {
        box.appendChild(el(`<div class="res"><div class="meta">Документов: <b>${v.length}</b> · ${out.ms.toFixed(1)} мс</div><div class="docs">${v.slice(0, 50).map(d => `<pre class="doc">${pretty(d)}</pre>`).join("") || `<div class="ok-run">Пусто — ни один документ не подошёл под условие.</div>`}</div></div>`));
      } else box.appendChild(el(`<div class="res"><pre class="doc">${pretty(v)}</pre></div>`));
    },
    side(m, t, box) {
      box.innerHTML = `<div class="lbl">Коллекции</div>`;
      for (const name of m.names()) {
        const docs = m.coll(name)._docs, fields = {};
        for (const d of docs) for (const k of Object.keys(d)) fields[k] = (fields[k] || 0) + 1;
        const card = el(`<div class="tbl"><button class="tn" title="Показать документы">${esc(name)} <small>${docs.length} док.</small></button>
          <div class="cols">${Object.entries(fields).map(([k, c]) => `<div class="col"><span class="cn">${esc(k)}</span><span class="ct">${c === docs.length ? "во всех" : `в ${c} из ${docs.length}`}</span></div>`).join("")}</div></div>`);
        card.querySelector(".tn").onclick = () => sandbox(`db.${name}.find().limit(3)`, true);
        box.appendChild(card);
      }
      box.appendChild(el(`<div class="legend">Схемы нет: у документов разный набор полей — справа видно, у скольких документов есть каждое поле. Клик по коллекции — первые документы в песочнице.</div>`));
    },
    sandbox: "// любые команды mongosh\ndb.shows.find({}, { title: 1, genre: 1, _id: 0 })",
  };

  // ================= без движка (виджеты, квиз) =================
  const noneEngine = { create() { return null; }, reset() {}, side(i, t, box) { box.innerHTML = t.sideHtml || ""; } };
  const ENGINES = { sql: sqlEngine, redis: redisEngine, mongo: mongoEngine, none: noneEngine };
  const engine = t => ENGINES[t.kind];

  // ================= проверка =================
  function sameRows(a, b, ordered, cols) {
    const norm = v => (v === null ? "∅" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v));
    const pick = r => (cols ? cols.map(i => r[i]) : r).map(norm).join("\u0001");
    if (a.length !== b.length) return false;
    const x = a.map(pick), y = b.map(pick);
    if (!ordered) { x.sort(); y.sort(); }
    return x.every((v, i) => v === y[i]);
  }
  function check(t, task, out, ctx) {
    const c = task.check;
    if (typeof c === "function") { const r = c(out, ctx); return r === true ? { ok: true } : { ok: false, msg: typeof r === "string" ? r : "" }; }
    const sub = q => q.replace(/:pre(\d?)/g, (_, i) => JSON.stringify(ctx.pre ? ctx.pre[+(i || 0)] : null));
    if (c.requires && !c.requires.test(ctx.code)) return { ok: false, msg: c.requiresMsg || "Решение должно использовать то, о чём просит задание." };
    if (c.error) {
      if (!out.error) return { ok: false, msg: "Запрос выполнился без ошибки — а мы ждали, что база его остановит. Проверьте значения." };
      if (!c.error.test(out.error)) return { ok: false, msg: "Ошибка есть, но не та, которую ждём. Перечитайте задание." };
      if (!c.state) return { ok: true };
    } else if (out.error) return { ok: false };
    if (c.run) return { ok: true };
    if (c.expect) {
      const e = ctx.sql(c.expect);
      if (sameRows(out.rows, e.rows, c.ordered, c.cols)) return { ok: true };
      if (out.rows.length !== e.rows.length) return { ok: false, msg: `Ожидали строк: ${e.rows.length}, у вас: ${out.rows.length}.` };
      return { ok: false, msg: "Число строк совпало, но значения другие. Проверьте условие и столбцы." };
    }
    if (c.state) { const r = ctx.sql(sub(c.state)); return r.rows.length && r.rows[0][0] ? { ok: true } : { ok: false, msg: c.stateMsg || "Запрос выполнился, но в базе нет ожидаемого результата." }; }
    return { ok: true };
  }

  // ================= отрисовка =================
  function renderNav() {
    const nav = $("#nav"); nav.innerHTML = "";
    let total = 0, done = 0;
    TABS.forEach((t, n) => {
      const req = t.tasks.map((x, i) => [x, i]).filter(([x]) => !x.star);
      const d = req.filter(([, i]) => S.done[tkey(t, i)]).length;
      total += req.length; done += d;
      const b = el(`<button class="navi ${t.id === S.tab ? "on" : ""} ${d === req.length ? "full" : ""}">
        <span class="nn">${n + 1}</span><span class="nt">${esc(t.title)}<small>${t.sub}</small></span><span class="np">${d}/${req.length}</span></button>`);
      b.onclick = () => { S.tab = t.id; save(); render(); window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    $("#progress").innerHTML = `<b>${done} из ${total}</b> заданий · ★ — по желанию`;
  }

  function solved(card, k) { S.done[k] = true; save(); card.classList.add("solved"); renderNav(); }

  function renderTask(t, task, i, host) {
    const k = tkey(t, i), E = engine(t), I = E.create(t);
    const head = `<div class="th"><span class="num">${i + 1}</span>${task.star ? `<span class="star">★ по желанию</span>` : ""}<span class="mark">✓ решено</span></div><div class="tt">${task.t}</div>`;
    if (task.widget) {
      const card = el(`<section class="task ${S.done[k] ? "solved" : ""}">${head}<div class="wbox"></div></section>`);
      host.appendChild(card);
      const ctx = { key: k, solve: () => solved(card, k), sql: q => sqlRun(I, q) };
      task.widget(card.querySelector(".wbox"), ctx);
      return;
    }
    const code0 = S.code[k] ?? task.code;
    const card = el(`<section class="task ${S.done[k] ? "solved" : ""}">${head}
      <textarea class="ed" spellcheck="false" rows="${Math.max(3, code0.split("\n").length + 1)}"></textarea>
      <div class="bar">
        <button class="btn run">▶ Выполнить <small>Ctrl+Enter</small></button>
        ${task.hints ? `<button class="btn ghost hint">Подсказка</button>` : ""}
        ${task.answer ? `<button class="btn ghost ans">Показать ответ</button>` : ""}
        <button class="btn ghost back" title="Вернуть исходный текст задания">↺ Исходный</button>
      </div>
      <div class="hints"></div><div class="verdict"></div><div class="out"></div></section>`);
    const ed = card.querySelector(".ed"); ed.value = code0;
    const grow = () => (ed.rows = Math.max(3, ed.value.split("\n").length + 1));
    ed.oninput = () => { S.code[k] = ed.value; save(); grow(); };
    const showHints = () => {
      const n = S.hint[k] || 0;
      card.querySelector(".hints").innerHTML = (task.hints || []).slice(0, n).map(x => `<div class="h">💡 ${x}</div>`).join("");
      const b = card.querySelector(".hint"); if (b) b.disabled = n >= task.hints.length;
    };
    showHints();
    const exec = () => {
      const I = E.create(t);
      const ctx = { code: ed.value, inst: I, sql: q => sqlRun(I, q), mongo: c => I.exec(c).value, redis: c => I.exec(c) };
      if (task.before) ctx.before = task.before(ctx);
      // подготовка задания: каждое начинается с одного и того же состояния, повторы не копят ошибки
      if (task.prep) { try { I.run("ROLLBACK"); } catch (e) {} try { I.run(task.prep); } catch (e) {} }
      if (task.check && task.check.pre) { try { ctx.pre = sqlRun(I, task.check.pre).rows[0]; } catch (e) {} }
      const out = E.exec(I, ed.value);
      if (task.prepNote) out.prepNote = task.prepNote;
      let v; try { v = check(t, task, out, ctx); } catch (e) { v = { ok: false, msg: "" }; }
      E.render(card.querySelector(".out"), out, { expected: v.ok && !!out.error });
      const vb = card.querySelector(".verdict");
      if (v.ok) { solved(card, k); vb.innerHTML = `<div class="good"><b>✓ Верно.</b> ${task.done || ""}</div>`; }
      else vb.innerHTML = v.msg ? `<div class="bad">${v.msg}</div>` : "";
      E.side(I, t, $("#side"));
    };
    card.querySelector(".run").onclick = exec;
    ed.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exec(); } };
    const hb = card.querySelector(".hint"); if (hb) hb.onclick = () => { S.hint[k] = (S.hint[k] || 0) + 1; save(); showHints(); };
    const ab = card.querySelector(".ans"); if (ab) ab.onclick = () => { ed.value = task.answer; ed.oninput(); };
    card.querySelector(".back").onclick = () => { ed.value = task.code; delete S.code[k]; save(); grow(); };
    host.appendChild(card);
  }

  function sandbox(code, runNow) {
    if (code !== undefined) $("#sbEd").value = code;
    if (runNow) { $("#sbRun").click(); $("#sandbox").scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  function render() {
    renderNav();
    const t = tab(), E = engine(t), main = $("#tasks");
    if (t.kind === "sql" && t.big && !inst["#big"]) {   // большую базу строим с предупреждением
      main.innerHTML = `<div class="loading">Готовлю большую базу: ${fmtN(BIG.bookings)} броней. Несколько секунд…</div>`;
      $("#side").innerHTML = ""; $("#sandbox").hidden = true;
      setTimeout(() => { E.create(t); render(); }, 30);
      return;
    }
    main.innerHTML = "";
    main.appendChild(el(`<section class="intro"><h2>${esc(t.title)}</h2>${t.intro}</section>`));
    main.querySelectorAll("[data-viz]").forEach(n => Viz[n.dataset.viz](n));
    t.tasks.forEach((task, i) => renderTask(t, task, i, main));
    E.side(E.create(t), t, $("#side"));
    $("#sandbox").hidden = t.kind === "none";
    $("#sbEd").value = S.code[`${t.id}:sb`] || t.sandbox || E.sandbox || "";
    $("#sbOut").innerHTML = "";
    $("#resetDb").hidden = t.kind === "none";
  }

  // ================= старт =================
  $("#sbRun").onclick = () => { const t = tab(), E = engine(t), I = E.create(t); E.render($("#sbOut"), E.exec(I, $("#sbEd").value)); E.side(I, t, $("#side")); };
  $("#sbEd").oninput = () => { S.code[`${tab().id}:sb`] = $("#sbEd").value; save(); };
  $("#sbEd").onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#sbRun").click(); } };
  $("#resetDb").onclick = () => { const t = tab(); engine(t).reset(t); render(); flash("База вкладки «" + t.title + "» возвращена к исходной"); };
  $("#resetAll").onclick = () => { if (!confirm("Стереть отметки о решённых заданиях и ваши запросы?")) return; S = { tab: S.tab, done: {}, code: {}, hint: {} }; save(); render(); };
  function flash(m) { const f = $("#flash"); f.textContent = m; f.classList.add("on"); setTimeout(() => f.classList.remove("on"), 2500); }

  initSqlJs().then(m => { SQL = m; $("#loading").remove(); render(); })
    .catch(e => { $("#loading").innerHTML = "Не удалось запустить базу в браузере: " + esc(e.message) + ". Попробуйте Chrome, Edge или Яндекс Браузер."; });
})();
