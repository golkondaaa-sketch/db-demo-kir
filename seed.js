// База СценыМосквы: площадки, спектакли, показы, актёры, зрители, брони.
// Данные генерируются детерминированно — у всех студентов одинаковые ответы.
"use strict";
(function () {
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE venues (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT NOT NULL,
  seats   INTEGER NOT NULL
);
CREATE TABLE shows (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  genre    TEXT NOT NULL,
  age      TEXT NOT NULL,
  minutes  INTEGER NOT NULL,
  venue_id INTEGER NOT NULL REFERENCES venues(id)
);
CREATE TABLE performances (
  id        INTEGER PRIMARY KEY,
  show_id   INTEGER NOT NULL REFERENCES shows(id),
  starts_at TEXT NOT NULL,
  price     INTEGER NOT NULL
);
CREATE TABLE actors (
  id        INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL
);
CREATE TABLE show_actors (
  show_id  INTEGER NOT NULL REFERENCES shows(id),
  actor_id INTEGER NOT NULL REFERENCES actors(id),
  role     TEXT NOT NULL,
  PRIMARY KEY (show_id, actor_id)
);
CREATE TABLE viewers (
  id         INTEGER PRIMARY KEY,
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE bookings (
  id             INTEGER PRIMARY KEY,
  viewer_id      INTEGER NOT NULL REFERENCES viewers(id),
  performance_id INTEGER NOT NULL REFERENCES performances(id),
  seat           TEXT NOT NULL,
  price          INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('оплачено', 'отменено')),
  created_at     TEXT NOT NULL,
  UNIQUE (performance_id, seat)          -- составной ключ: одно место на показ продаётся один раз
);`;

  const VENUES = [
    ["Основная сцена", "Театральная пл., 1", 900],
    ["Малая сцена", "Театральная пл., 1, стр. 2", 250],
    ["Новая сцена", "ул. Новослободская, 12", 500],
    ["Летний сад", "Сад «Эрмитаж», эстрада", 400],
    ["Дом музыки", "Космодамианская наб., 52", 1200],
    ["Камерный зал", "ул. Покровка, 8", 120],
  ];
  // название, жанр, возраст, минут, площадка, базовая цена
  const SHOWS = [
    ["Гамлет", "драма", "16+", 200, 1, 3500],
    ["Щелкунчик", "балет", "0+", 120, 1, 4500],
    ["Евгений Онегин", "опера", "12+", 190, 1, 4000],
    ["Джаз в саду", "концерт", "0+", 90, 4, 1500],
    ["Вишнёвый сад", "драма", "12+", 170, 3, 2500],
    ["Лебединое озеро", "балет", "6+", 150, 1, 5000],
    ["Ревизор", "комедия", "12+", 160, 3, 2000],
    ["Кармен", "опера", "16+", 180, 5, 3800],
    ["Маленький принц", "детский", "6+", 70, 2, 1200],
    ["Буратино", "детский", "0+", 60, 2, 900],
    ["Мастер и Маргарита", "драма", "18+", 210, 3, 3000],
    ["Чайка", "драма", "12+", 150, 6, 1800],
  ];
  const ACTORS = ["Андрей Соколов", "Мария Лебедева", "Илья Морозов", "Ольга Волкова", "Сергей Павлов",
    "Анна Козлова", "Дмитрий Новиков", "Екатерина Смирнова", "Павел Фёдоров", "Наталья Орлова",
    "Алексей Белов", "Ирина Захарова", "Михаил Егоров", "Татьяна Медведева", "Николай Степанов",
    "Юлия Алексеева", "Виктор Никитин", "Елена Макарова", "Роман Кузьмин", "Светлана Тарасова"];
  const HAMLET = [["Гамлет", 0], ["Офелия", 1], ["Клавдий", 2], ["Гертруда", 3], ["Полоний", 4], ["Горацио", 6]];

  const SUR = [["Петров", "petrov"], ["Сидоров", "sidorov"], ["Смирнов", "smirnov"], ["Кузнецов", "kuznetsov"], ["Попов", "popov"],
    ["Васильев", "vasiliev"], ["Соколов", "sokolov"], ["Михайлов", "mikhailov"], ["Новиков", "novikov"], ["Фёдоров", "fedorov"],
    ["Морозов", "morozov"], ["Волков", "volkov"], ["Алексеев", "alekseev"], ["Лебедев", "lebedev"], ["Семёнов", "semenov"],
    ["Егоров", "egorov"], ["Павлов", "pavlov"], ["Козлов", "kozlov"], ["Степанов", "stepanov"], ["Николаев", "nikolaev"]];
  const NAMES_M = [["Иван", "i"], ["Пётр", "p"], ["Сергей", "s"], ["Алексей", "a"], ["Дмитрий", "d"], ["Андрей", "a"], ["Михаил", "m"], ["Олег", "o"]];
  const NAMES_F = [["Анна", "a"], ["Мария", "m"], ["Елена", "e"], ["Ольга", "o"], ["Наталья", "n"], ["Ирина", "i"], ["Татьяна", "t"], ["Юлия", "y"]];
  const PATR = ["Иванович", "Петрович", "Сергеевич", "Алексеевич", "Дмитриевич", "Андреевич", "Михайлович", "Олегович"];

  const pad = n => String(n).padStart(2, "0");

  function build(db, opts = {}) {
    const r = rng(12);
    db.run(SCHEMA);
    db.run("BEGIN");
    const ins = (sql, rows) => { const st = db.prepare(sql); for (const row of rows) st.run(row); st.free(); };

    ins("INSERT INTO venues VALUES (?,?,?,?)", VENUES.map((v, i) => [i + 1, ...v]));
    ins("INSERT INTO shows VALUES (?,?,?,?,?,?)", SHOWS.map((s, i) => [i + 1, s[0], s[1], s[2], s[3], s[4]]));

    // показы: по умолчанию у спектакля 6 дат с октября по декабрь 2026; в большой базе — на год вперёд
    const perf = [], per = opts.perShow || 6, span = per > 6 ? 360 : 85;
    const day0 = Date.UTC(2026, 9, 3), iso = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    SHOWS.forEach((s, i) => {
      for (let k = 0; k < per; k++) {
        const off = Math.floor(k * span / per) + ((i * 5) % Math.max(1, Math.floor(span / per)));
        perf.push([perf.length + 1, i + 1, `${iso(day0 + off * 864e5)} ${s[1] === "детский" ? 12 : 19}:00`, s[5] + (k % 3) * 500]);
      }
    });
    ins("INSERT INTO performances VALUES (?,?,?,?)", perf);

    ins("INSERT INTO actors VALUES (?,?)", ACTORS.map((a, i) => [i + 1, a]));
    const sa = HAMLET.map(([role, a]) => [1, a + 1, role]);
    SHOWS.forEach((s, i) => {
      if (i === 0 || s[1] === "концерт") return;
      const used = new Set();
      for (let k = 0; k < 4; k++) {
        let a; do a = Math.floor(r() * ACTORS.length); while (used.has(a)); used.add(a);
        sa.push([i + 1, a + 1, k === 0 ? "главная роль" : "роль второго плана"]);
      }
    });
    ins("INSERT INTO show_actors VALUES (?,?,?)", sa);

    // зрители: №1 — Иванов, как на занятии 13
    const nViewers = opts.viewers || 2000, viewers = [[1, "Иванов Иван Иванович", "ivanov.i.01@example.com", "+7 900 000-00-01", "2024-03-15"]];
    const seen = new Set(["ivanov.i.01@example.com"]);
    for (let id = 2; id <= nViewers; id++) {
      const f = r() < .55, [sur, sl] = SUR[Math.floor(r() * SUR.length)], [nm, nl] = (f ? NAMES_F : NAMES_M)[Math.floor(r() * 8)];
      const pt = PATR[Math.floor(r() * PATR.length)];
      let k = 1, email; do email = `${sl}${f ? "a" : ""}.${nl}.${pad(k++)}@example.com`; while (seen.has(email)); seen.add(email);
      const y = 2022 + Math.floor(r() * 5), mo = 1 + Math.floor(r() * (y === 2026 ? 9 : 12));
      viewers.push([id, `${sur}${f ? "а" : ""} ${nm} ${f ? pt.replace(/ич$/, "на") : pt}`, email,
        r() < .8 ? `+7 9${pad(Math.floor(r() * 100))} ${100 + Math.floor(r() * 900)}-${pad(Math.floor(r() * 100))}-${pad(Math.floor(r() * 100))}` : null,
        `${y}-${pad(mo)}-${pad(1 + Math.floor(r() * 28))}`]);
    }
    ins("INSERT INTO viewers VALUES (?,?,?,?,?)", viewers);

    // брони: у Иванова фиксированный набор, остальные случайно, «Гамлет» и балеты популярнее
    const book = [], weight = SHOWS.map((s, i) => (i === 0 ? 4 : s[1] === "балет" ? 3 : 1));
    const wsum = weight.reduce((a, b) => a + b, 0);
    const pickShow = () => { let x = r() * wsum; for (let i = 0; i < weight.length; i++) if ((x -= weight[i]) < 0) return i; return 0; };
    const taken = new Set(), ROWS = per > 6 ? 30 : 20, SEATS = per > 6 ? 40 : 30;
    const add = (viewer, p, status) => {
      let row, seat, tries = 0;
      do {
        if (++tries > 40) { p = (p + 1) % perf.length; tries = 0; }      // показ раскуплен — берём следующий
        row = 1 + Math.floor(r() * ROWS); seat = `ряд ${row}, место ${1 + Math.floor(r() * SEATS)}`;
      } while (taken.has(p + "|" + seat));
      taken.add(p + "|" + seat);
      const pr = perf[p];
      const [date] = pr[2].split(" "), [y, m, d] = date.split("-").map(Number), back = 3 + Math.floor(r() * 40);
      const t = new Date(Date.UTC(y, m - 1, d) - back * 864e5);
      book.push([book.length + 1, viewer, pr[0], seat, pr[3] + (row <= 5 ? 1000 : 0), status,
        `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(9 + Math.floor(r() * 13))}:${pad(Math.floor(r() * 60))}`]);
    };
    [[0, 0], [0, 1], [1, 2], [2, 0], [4, 3], [8, 1], [9, 2]].forEach(([s, k], i) => add(1, s * per + k, i === 5 ? "отменено" : "оплачено"));
    const nBook = opts.bookings || 12000;
    while (book.length < nBook) add(2 + Math.floor(r() * (nViewers - 1)), pickShow() * per + Math.floor(r() * per), r() < .07 ? "отменено" : "оплачено");
    ins("INSERT INTO bookings VALUES (?,?,?,?,?,?,?)", book);
    db.run("COMMIT");
  }

  window.Seed = { build };
})();
