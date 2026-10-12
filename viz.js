// Картинки и интерактивные виджеты: схема связей, шпаргалка по ключам, изоляция транзакций,
// хранение по строкам и по столбцам, выбор базы.
"use strict";
(function () {
  const el = h => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstElementChild; };

  // ---------- схема связей (вкладка JOIN) ----------
  function er(host) {
    const B = (x, y, w, t, sub) => `<g><rect x="${x}" y="${y}" width="${w}" height="44" rx="10" class="erb"/><text x="${x + w / 2}" y="${y + 20}" class="ert">${t}</text><text x="${x + w / 2}" y="${y + 36}" class="ers">${sub}</text></g>`;
    const L = (x1, y1, x2, y2, a, b) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="erl"/><text x="${x1 + (x2 > x1 ? 8 : x2 < x1 ? -14 : 6)}" y="${y1 + (y2 > y1 ? 16 : -6)}" class="erc">${a}</text><text x="${x2 + (x2 > x1 ? -16 : x2 < x1 ? 8 : 6)}" y="${y2 + (y2 > y1 ? -6 : 16)}" class="erc">${b}</text>`;
    host.innerHTML = `<svg viewBox="0 0 760 150" class="ersvg">
      ${L(130, 32, 165, 32, "1", "∞")}${L(285, 32, 320, 32, "∞", "1")}${L(450, 32, 485, 32, "∞", "1")}${L(585, 32, 620, 32, "∞", "1")}
      ${L(535, 54, 535, 92, "1", "∞")}${L(475, 114, 405, 114, "∞", "1")}
      ${B(10, 10, 120, "viewers", "зрители")}${B(165, 10, 120, "bookings", "брони")}${B(320, 10, 130, "performances", "показы")}
      ${B(485, 10, 100, "shows", "спектакли")}${B(620, 10, 120, "venues", "площадки")}
      ${B(475, 92, 120, "show_actors", "кто в чём играет")}${B(285, 92, 120, "actors", "актёры")}
    </svg>`;
  }

  // ---------- шпаргалка по ключам ----------
  function keys(host) {
    const R = 30, top = 62;
    const table = (x, cols, rows, opts = {}) => {
      let h = "", cx = x;
      cols.forEach(([name, w, cls]) => {
        h += `<rect x="${cx}" y="${top}" width="${w}" height="${R}" class="hd"/><text x="${cx + 8}" y="${top + 19}" class="h">${name}</text>`;
        rows.forEach((row, i) => {
          const bad = opts.bad === i, c = bad ? "bad" : cls || "cell";
          h += `<rect x="${cx}" y="${top + R * (i + 1)}" width="${w}" height="${R}" class="cell ${c}"/>`;
        });
        cx += w;
      });
      rows.forEach((row, i) => {
        let px = x;
        row.forEach((v, j) => { h += `<text x="${px + 8}" y="${top + R * (i + 1) + 19}" class="mono ${opts.bad === i ? "badt" : ""}">${v}</text>`; px += cols[j][1]; });
      });
      return h;
    };
    // брони слева, зрители справа: стрелки внешнего ключа идут слева направо
    const bx = 20, vx = 520;
    const bCols = [["id", 56, "pk"], ["performance_id", 128], ["seat", 136], ["viewer_id", 92, "fk"]];
    const bRows = [["101", "1", "ряд 1, место 1", "1"], ["102", "7", "ряд 3, место 5", "1"], ["103", "1", "ряд 1, место 2", "2"], ["104", "1", "ряд 1, место 1", "3"]];
    const vCols = [["id", 44, "pk"], ["full_name", 116], ["email", 160]];
    const vRows = [["1", "Иванов И. И.", "ivanov.i.01@…"], ["2", "Петрова А. С.", "petrova.a.01@…"], ["3", "Сидоров П. О.", "sidorov.p.01@…"]];
    const fk = [0, 0, 1, 2];
    let arrows = "";
    fk.forEach((v, i) => {
      if (i === 3) return;
      const y1 = top + R * (i + 1) + 15, y2 = top + R * (v + 1) + 15, x1 = bx + 412, x2 = vx;
      arrows += `<path d="M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2 - 4} ${y2}" class="arr" marker-end="url(#ah)"/>`;
    });
    host.innerHTML = `<svg viewBox="0 0 840 250" class="kv">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--blue)"/></marker></defs>
      <text x="${bx}" y="22" class="t">bookings</text><text x="${bx + 92}" y="22" class="tag" fill="var(--muted)">брони</text>
      <text x="${vx}" y="22" class="t">viewers</text><text x="${vx + 82}" y="22" class="tag" fill="var(--muted)">зрители</text>
      <text x="${bx + 4}" y="52" class="tag" fill="#9A7B00">PK</text>
      <text x="${bx + 66}" y="52" class="tag" fill="var(--green)">составной ключ: показ + место</text>
      <text x="${bx + 324}" y="52" class="tag" fill="var(--blue)">FK → viewers.id</text>
      <text x="${vx + 4}" y="52" class="tag" fill="#9A7B00">PK</text>
      <text x="${vx + 164}" y="52" class="tag" fill="#8E5BD6">UNIQUE</text>
      ${table(bx, bCols, bRows, { bad: 3 })}${table(vx, vCols, vRows)}
      <rect x="${bx + 56}" y="${top}" width="264" height="${R * 5}" class="comp" rx="8"/>
      <rect x="${vx + 160}" y="${top}" width="160" height="${R * 4}" class="uniq"/>
      ${arrows}
      <text x="${bx}" y="${top + R * 5 + 24}" class="badt" style="font-size:13px">✗ строка 104: показ 1 + «ряд 1, место 1» уже продано в строке 101 — база не пустит</text>
    </svg>
    <div class="klegend">
      <div class="k1"><b>Первичный ключ (PK)</b>Номер строки: уникален и не пуст. Здесь <code>id</code> — суррогатный ключ, просто порядковый номер без смысла.</div>
      <div class="k2"><b>Внешний ключ (FK)</b>Ссылка на строку другой таблицы. Бронь хранит не имя зрителя, а его <code>id</code>, и ссылка обязана вести к существующей строке.</div>
      <div class="k3"><b>Составной ключ</b>Уникален не столбец, а набор: «показ + место». Каждое по отдельности повторяется, пара — никогда.</div>
      <div class="k4"><b>UNIQUE</b>Уникальность без роли ключа: два зрителя не могут завести аккаунт на один email.</div>
    </div>`;
  }

  // ---------- изоляция: два покупателя на последний билет ----------
  const ISO = {
    none: {
      name: "Без изоляции",
      steps: [
        ["a", "читает: свободных мест — 1", 1, "1"],
        ["b", "читает: свободных мест — 1", 1, "1"],
        ["a", "продаёт место, записывает «свободно 0»", 0, "0"],
        ["b", "тоже продаёт — он ведь видел 1 — и записывает «свободно 0»", 0, "0"],
      ],
      end: "Оба получили билет на одно и то же место. В зале — драка, в базе — «свободно 0», и ошибку никто не заметил.",
      bad: true,
    },
    lock: {
      name: "С изоляцией и блокировкой",
      steps: [
        ["a", "BEGIN · читает с блокировкой: свободных мест — 1 🔒", 1, "1"],
        ["b", "BEGIN · хочет прочитать — ждёт, пока A закончит ⏳", 1, "…"],
        ["a", "продаёт место, «свободно 0», COMMIT · блокировка снята 🔓", 0, "0"],
        ["b", "дождался, читает: свободных мест — 0 → «Билетов нет», ROLLBACK", 0, "0"],
      ],
      end: "Билет у одного, второй получил честный отказ. Цена — касса B ждала: под нагрузкой такие ожидания и есть «база тормозит».",
      bad: false,
    },
  };
  function isolation(host, ctx) {
    let mode = "none", step = 0; const seen = { none: false, lock: false };
    host.innerHTML = `<div class="iso">
      <div class="seg" role="tablist"><button data-m="none" class="on">Без изоляции</button><button data-m="lock">С изоляцией</button></div>
      <div class="isogrid">
        <div class="lane"><div class="who">Касса A · Иванов</div><div class="ev" data-l="a"></div></div>
        <div class="seats"><div class="lbl">свободных мест</div><div class="big" id="isoSeats">1</div><div class="lbl">в базе</div></div>
        <div class="lane"><div class="who">Касса B · Петрова</div><div class="ev" data-l="b"></div></div>
      </div>
      <div class="isoend"></div>
      <div class="bar"><button class="btn isonext">Следующий шаг ▶</button><button class="btn ghost isoreset">↺ Сначала</button></div>
    </div>`;
    const $ = s => host.querySelector(s);
    const draw = () => {
      const S = ISO[mode];
      host.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.m === mode));
      ["a", "b"].forEach(l => {
        $(`.ev[data-l="${l}"]`).innerHTML = S.steps.slice(0, step).map((s, i) => (s[0] === l ? `<div class="st"><span>${i + 1}</span>${s[1]}</div>` : `<div class="st idle"></div>`)).join("");
      });
      $("#isoSeats").textContent = step ? S.steps[step - 1][2] : 1;
      const done = step >= S.steps.length;
      $(".isoend").innerHTML = done ? `<div class="${S.bad ? "bad" : "good"}">${S.end}</div>` : "";
      $(".isonext").disabled = done;
      if (done && !seen[mode]) { seen[mode] = true; if (seen.none && seen.lock) ctx.solve(); }
    };
    host.querySelectorAll(".seg button").forEach(b => (b.onclick = () => { mode = b.dataset.m; step = 0; draw(); }));
    $(".isonext").onclick = () => { step++; draw(); };
    $(".isoreset").onclick = () => { step = 0; draw(); };
    draw();
  }

  // ---------- хранение по строкам и по столбцам ----------
  function columns(host, ctx) {
    const need = new Set(["created_at", "price", "status"]);
    const cols = ctx.sql("SELECT name, type FROM pragma_table_info('bookings')").rows;
    const N = ctx.sql("SELECT COUNT(*) FROM bookings").rows[0][0];
    const bytes = {};
    for (const [c, type] of cols) bytes[c] = /INT/i.test(type) ? N * 8 : ctx.sql(`SELECT SUM(length(CAST(${c} AS BLOB))) FROM bookings`).rows[0][0];
    const all = Object.values(bytes).reduce((a, b) => a + b, 0);
    const mb = b => (b / 1048576).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " МБ";
    host.innerHTML = `<div class="colw">
      <div class="lbl">Отметьте столбцы, которые нужны отчёту «выручка по месяцам»</div>
      <div class="colpick">${cols.map(([c]) => `<label><input type="checkbox" value="${c}"> <code>${c}</code> <small>${mb(bytes[c])}</small></label>`).join("")}</div>
      <div class="bar"><button class="btn colgo">Посчитать, сколько читать</button></div>
      <div class="colres"></div></div>`;
    host.querySelector(".colgo").onclick = () => {
      const picked = [...host.querySelectorAll("input:checked")].map(i => i.value);
      const res = host.querySelector(".colres");
      const ok = picked.length === need.size && picked.every(p => need.has(p));
      if (!ok) {
        const miss = [...need].filter(c => !picked.includes(c)), extra = picked.filter(c => !need.has(c));
        res.innerHTML = `<div class="bad">${miss.length ? `Не хватает: ${miss.map(c => `<code>${c}</code>`).join(", ")} — без него отчёт не посчитать. ` : ""}${extra.length ? `Лишние: ${extra.map(c => `<code>${c}</code>`).join(", ")} — отчёту они не нужны.` : ""}</div>`;
        return;
      }
      const part = picked.reduce((a, c) => a + bytes[c], 0), pct = Math.round(part / all * 100);
      res.innerHTML = `
        <div class="cmp"><div class="cl">Строчная база (PostgreSQL, OLTP)<small>читает строки целиком — все ${cols.length} столбцов</small></div>
          <div class="cb"><i style="width:100%"></i></div><b>${mb(all)}</b></div>
        <div class="cmp"><div class="cl">Колоночная база (ClickHouse, OLAP)<small>читает только 3 нужных столбца</small></div>
          <div class="cb"><i style="width:${pct}%;background:var(--green)"></i></div><b>${mb(part)}</b></div>
        <div class="good">Колоночной базе нужно прочитать ${pct}% данных. А ещё столбец из одинаковых значений («оплачено», «оплачено»…) отлично сжимается — на практике разница доходит до десятков раз.</div>`;
      ctx.solve();
    };
  }

  // ---------- выбор базы: один кейс ----------
  function quiz(host, ctx, q) {
    host.innerHTML = `<div class="quiz">${q.options.map((o, i) => `<label class="qo"><input type="radio" name="${ctx.key}" value="${i}"> <span>${o[0]}</span></label>`).join("")}
      <div class="bar"><button class="btn qgo">Ответить</button></div><div class="qres"></div></div>`;
    host.querySelector(".qgo").onclick = () => {
      const v = host.querySelector("input:checked"), res = host.querySelector(".qres");
      if (!v) { res.innerHTML = `<div class="bad">Выберите вариант.</div>`; return; }
      const o = q.options[+v.value];
      if (o[1]) { res.innerHTML = `<div class="good"><b>✓ Да.</b> ${q.why}</div>`; ctx.solve(); }
      else res.innerHTML = `<div class="bad">${o[2] || "Не лучший выбор."} Попробуйте ещё.</div>`;
    };
  }

  // ---------- разложить по двум корзинам ----------
  function classify(host, ctx, items, kinds = ["OLTP", "OLAP"]) {
    const pick = {};
    host.innerHTML = `<div class="cls">${items.map(([q], i) => `<div class="clr" data-i="${i}"><span>${q}</span><span class="clb">${kinds.map(k => `<button data-k="${k}">${k}</button>`).join("")}</span></div>`).join("")}
      <div class="bar"><button class="btn clgo">Проверить</button></div><div class="clres"></div></div>`;
    host.querySelectorAll(".clr").forEach(r => r.querySelectorAll("button").forEach(b => (b.onclick = () => {
      pick[r.dataset.i] = b.dataset.k; r.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); r.classList.remove("right", "wrong");
    })));
    host.querySelector(".clgo").onclick = () => {
      let ok = 0;
      host.querySelectorAll(".clr").forEach(r => { const i = r.dataset.i, good = pick[i] === items[i][1]; if (good) ok++; r.classList.toggle("right", good); r.classList.toggle("wrong", !!pick[i] && !good); });
      const res = host.querySelector(".clres");
      if (ok === items.length) { res.innerHTML = `<div class="good"><b>✓ Всё верно.</b> OLTP — действия одного человека здесь и сейчас; OLAP — вопросы про всех и за период.</div>`; ctx.solve(); }
      else res.innerHTML = `<div class="bad">Верно ${ok} из ${items.length}. Подсказка: если запрос про одного зрителя прямо сейчас — OLTP, если про всех за период — OLAP.</div>`;
    };
  }

  window.Viz = { er, keys, isolation, columns, quiz, classify };
})();
