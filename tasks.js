// Вкладки и задания. kind — движок вкладки: sql | redis | mongo | none (только виджеты).
// Задание: t — текст, code — заготовка, hints, answer, done — пояснение после решения,
// widget(host, ctx) — вместо редактора интерактивный виджет (ctx.solve() — задание решено).
// Проверка задания (check) — функция (out, ctx) => true | "сообщение" или объект для SQL:
//   { run: true }                    — достаточно выполнить любой запрос без ошибки
//   { expect: "SQL" }                — результат совпадает с эталонным запросом (порядок строк не важен,
//                                      ordered: true — важен; имена столбцов не сравниваем)
//   { error: /regex/ }               — запрос должен упасть с такой ошибкой (учимся читать ошибки базы)
//   { state: "SQL" }                 — после запроса этот проверочный SQL возвращает 1
//   pre: "SQL"                       — выполнить до запроса; значения подставляются в state как :pre0, :pre1
//   requires: /regex/                — текст решения должен содержать это (например, BEGIN)
"use strict";
// вкладка «Транзакции»: перед каждым заданием — исходный баланс Иванова, без пробных покупок
var TX_PREP = `
DELETE FROM tickets WHERE booking_id IN (SELECT id FROM bookings WHERE viewer_id = 1 AND created_at = '2026-10-10 12:00');
DELETE FROM bookings WHERE viewer_id = 1 AND created_at = '2026-10-10 12:00';
UPDATE wallets SET balance = 10000 WHERE viewer_id = 1;`;
var TX_NOTE = "Перед запуском: у Иванова 10 000 ₽, прошлые пробные покупки отменены.";

window.TABS = [
  {
    id: "tables",
    title: "Таблицы и запросы",
    sub: "SQL",
    kind: "sql",
    intro: `
<p>Реляционная база хранит данные в <b>таблицах</b>. Строка — один объект (зритель, бронь), столбец — одно его свойство. У столбца есть <b>тип</b>: число, текст, дата — и база не даст положить в него что попало.</p>
<p>С реляционной базой данных работают на языке запросов <b>SQL</b>. Запрос <code>SELECT</code> только читает: сколько ни запускай, данные не изменятся. Здесь можно экспериментировать смело — кнопка «Сбросить базу» вернёт всё как было.</p>`,
    tasks: [
      {
        t: "Выполните готовый запрос — посмотрите, какие спектакли есть в афише.",
        code: "SELECT * FROM shows;",
        check: { run: true },
        done: "<code>*</code> — «все столбцы». Справа в схеме видно, что ещё лежит в базе: площадки, показы, зрители, брони.",
      },
      {
        t: "Покажите только <b>название и возраст</b> спектаклей жанра <b>балет</b>.",
        code: "SELECT title, age\nFROM shows\nWHERE genre = '...';",
        hints: ["Вместо многоточия впишите жанр — в кавычках, как текст в таблице: <code>'балет'</code>."],
        answer: "SELECT title, age\nFROM shows\nWHERE genre = 'балет';",
        check: { expect: "SELECT title, age FROM shows WHERE genre = 'балет'" },
        done: "<code>WHERE</code> — фильтр по строкам, список после <code>SELECT</code> — выбор столбцов.",
      },
      {
        t: "Найдите <b>5 самых дорогих показов</b>: дата и цена, от дорогого к дешёвому.",
        code: "SELECT starts_at, price\nFROM performances\nORDER BY price ...\nLIMIT ...;",
        hints: ["<code>ORDER BY price DESC</code> — по убыванию, <code>ASC</code> — по возрастанию.", "<code>LIMIT 5</code> — оставить первые 5 строк."],
        answer: "SELECT starts_at, price\nFROM performances\nORDER BY price DESC\nLIMIT 5;",
        check: { expect: "SELECT starts_at, price FROM performances ORDER BY price DESC, id LIMIT 5", ordered: true, cols: [1] },
        done: "Без <code>ORDER BY</code> база не обещает никакого порядка — даже если сегодня строки пришли «как надо».",
      },
      {
        t: "Сколько всего броней у Иванова (<code>ivanov.i.01@example.com</code>)? Сначала узнайте его <code>id</code> в таблице <code>viewers</code>, потом посчитайте его брони в <code>bookings</code>.",
        code: "SELECT id, full_name FROM viewers WHERE email = 'ivanov.i.01@example.com';\n\n-- потом:\n-- SELECT COUNT(*) FROM bookings WHERE viewer_id = ...;",
        hints: ["Выполните первый запрос — увидите id. Затем уберите <code>--</code> перед вторым запросом и подставьте id.",
          "Если в окне два запроса, на экране будет результат последнего."],
        answer: "SELECT COUNT(*) FROM bookings WHERE viewer_id = 1;",
        check: { expect: "SELECT COUNT(*) FROM bookings WHERE viewer_id = 1" },
        done: "В броне не хранится ни имя, ни email — только <code>viewer_id</code>, номер строки в таблице зрителей. Это и есть связь между таблицами — о ней следующие вкладки.",
      },
    ],
  },

  {
    id: "keys",
    title: "Ключи",
    sub: "SQL",
    kind: "sql",
    intro: `
<p><b>Первичный ключ</b> (primary key, PK) — уникальный номер строки, как номер паспорта. Двух зрителей с одинаковым <code>id</code> быть не может.</p>
<p><b>Внешний ключ</b> (foreign key, FK) — ссылка на строку другой таблицы: <code>bookings.viewer_id</code> указывает на <code>viewers.id</code>. База проверяет, что ссылка ведёт к существующей строке.</p>
<p><b>Составной ключ</b> — уникальна не одна колонка, а их набор. В бронях это пара «показ + место»: одно место на один показ продаётся один раз.</p>
<details class="cheat"><summary>Шпаргалка: ключи на картинке</summary><div data-viz="keys"></div></details>
<p>В этой вкладке задача — <b>сломать</b> данные и увидеть, что база не даёт. Ошибка здесь — правильный ответ.</p>`,
    tasks: [
      {
        t: "Добавьте зрителя Петрова с <code>id = 1</code>. Этот id уже занят Ивановым — посмотрите, что ответит база.",
        code: "INSERT INTO viewers (id, full_name, email, created_at)\nVALUES (1, 'Петров Пётр Петрович', 'petrov.p.99@example.com', '2026-10-01');",
        check: { error: /UNIQUE constraint failed: viewers\.id|PRIMARY KEY/i },
        done: "Первичный ключ не пускает дубль. Если бы его не было, «зритель №1» стал бы двумя людьми, и брони Иванова «поделились» бы с Петровым.",
      },
      {
        t: "Теперь добавьте Петрова правильно: <b>не указывайте id</b> — база выдаст свободный номер сама.",
        code: "INSERT INTO viewers (full_name, email, created_at)\nVALUES ('Петров Пётр Петрович', 'petrov.p.99@example.com', '2026-10-01');\n\nSELECT * FROM viewers WHERE email = 'petrov.p.99@example.com';",
        check: (out, ctx) => (ctx.sql("SELECT COUNT(*) FROM viewers WHERE email = 'petrov.p.99@example.com'").rows[0][0] === 1
          ? true : out.error ? false : "Петрова в таблице пока нет."),
        done: "Обычно id раздаёт база — так два сервера приложения не выдадут один номер дважды.",
      },
      {
        t: "Добавьте ещё одного зрителя с email Иванова <code>ivanov.i.01@example.com</code>. В таблице на email стоит <code>UNIQUE</code> — что будет?",
        code: "INSERT INTO viewers (full_name, email, created_at)\nVALUES ('Иванов Иван (дубль)', 'ivanov.i.01@example.com', '2026-10-01');",
        check: { error: /UNIQUE constraint failed: viewers\.email/i },
        done: "<code>UNIQUE</code> — уникальность не только для ключа. Без неё один человек заводит два аккаунта, и «мои заказы» показывают половину.",
      },
      {
        t: "Создайте бронь для зрителя с <code>viewer_id = 999999</code> — такого зрителя нет.",
        code: "INSERT INTO bookings (viewer_id, performance_id, seat, price, status, created_at)\nVALUES (999999, 1, 'балкон, место 1', 4500, 'оплачено', '2026-10-01 12:00');",
        check: { error: /FOREIGN KEY constraint failed/i },
        done: "Внешний ключ не даёт создать бронь «ни на кого». Без него такие строки копятся годами, и отчёт по выручке перестаёт сходиться с отчётом по зрителям.",
      },
      {
        t: "Продайте Петрову место, которое уже продано: найдите любую бронь на показ №1 и попробуйте создать вторую на то же место.",
        code: "SELECT performance_id, seat FROM bookings WHERE performance_id = 1 LIMIT 3;\n\n-- подставьте место из результата:\n-- INSERT INTO bookings (viewer_id, performance_id, seat, price, status, created_at)\n-- VALUES (2, 1, '...', 4500, 'оплачено', '2026-10-01 12:00');",
        hints: ["Выполните первый запрос, скопируйте значение seat, уберите <code>--</code> у INSERT и вставьте место вместо многоточия."],
        check: { error: /UNIQUE constraint failed: bookings\.performance_id, bookings\.seat/i },
        done: "Это составной ключ <code>(performance_id, seat)</code>: по отдельности показ и место повторяются, а пара — никогда. Двойную продажу места база остановит, даже если в коде сайта ошибка.",
      },
      {
        star: true,
        t: "Удалите Иванова (<code>id = 1</code>) из зрителей. У него есть брони — что скажет база?",
        code: "DELETE FROM viewers WHERE id = 1;",
        check: { error: /FOREIGN KEY constraint failed/i },
        done: "Нельзя удалить того, на кого ссылаются. Отсюда вопрос к команде на любое «удалите пользователя по заявлению»: что делаем с его заказами — удаляем, обезличиваем, оставляем?",
      },
    ],
  },

  {
    id: "joins",
    title: "Связи и JOIN",
    sub: "SQL",
    kind: "sql",
    intro: `
<p>Данные разложены по таблицам, чтобы <b>не дублировать информацию</b>: название спектакля хранится в одном месте — в <code>shows</code>, а показы и брони ссылаются на него по ключу. Переименовали спектакль — поправили одну строку, и все брони сразу видят новое название. <code>JOIN</code> склеивает таблицы обратно по этим ключам.</p>
<div data-viz="er"></div>
<p><b>Один-ко-многим</b>: у зрителя много броней, у брони один зритель. <b>Многие-ко-многим</b>: в спектакле много актёров, актёр играет в нескольких спектаклях. Для такой связи нужна третья таблица — <code>show_actors</code>.</p>`,
    tasks: [
      {
        t: "Выведите брони Иванова (<code>viewer_id = 1</code>): дату показа и <b>название спектакля</b>. Запрос почти готов — допишите условие склейки во втором <code>JOIN</code>.",
        code: "SELECT p.starts_at, s.title, b.status\nFROM bookings b\nJOIN performances p ON p.id = b.performance_id\nJOIN shows s ON s.id = ...\nWHERE b.viewer_id = 1;",
        hints: ["Показ ссылается на спектакль через столбец <code>show_id</code> — посмотрите в схеме справа.", "<code>JOIN shows s ON s.id = p.show_id</code>"],
        answer: "SELECT p.starts_at, s.title, b.status\nFROM bookings b\nJOIN performances p ON p.id = b.performance_id\nJOIN shows s ON s.id = p.show_id\nWHERE b.viewer_id = 1;",
        check: { expect: "SELECT p.starts_at, s.title, b.status FROM bookings b JOIN performances p ON p.id = b.performance_id JOIN shows s ON s.id = p.show_id WHERE b.viewer_id = 1" },
        done: "Буквы <code>b</code>, <code>p</code>, <code>s</code> — короткие псевдонимы таблиц, чтобы не писать названия целиком.",
      },
      {
        t: "Кто играет в «Гамлете»? Выведите <b>имя актёра и роль</b>. Это связь многие-ко-многим: спектакль → <code>show_actors</code> → актёр.",
        code: "SELECT a.full_name, sa.role\nFROM shows s\nJOIN show_actors sa ON sa.show_id = s.id\nJOIN actors a ON ...\nWHERE s.title = 'Гамлет';",
        hints: ["В связующей таблице есть <code>actor_id</code> — он указывает на <code>actors.id</code>."],
        answer: "SELECT a.full_name, sa.role\nFROM shows s\nJOIN show_actors sa ON sa.show_id = s.id\nJOIN actors a ON a.id = sa.actor_id\nWHERE s.title = 'Гамлет';",
        check: { expect: "SELECT a.full_name, sa.role FROM shows s JOIN show_actors sa ON sa.show_id = s.id JOIN actors a ON a.id = sa.actor_id WHERE s.title = 'Гамлет'" },
        done: "Роль хранится в связующей таблице: это свойство не актёра и не спектакля, а их пары.",
      },
      {
        star: true,
        t: "Сколько <b>оплаченных</b> билетов продано на каждый спектакль? Название и число, от популярного к непопулярному.",
        code: "SELECT s.title, COUNT(*) AS sold\nFROM bookings b\nJOIN performances p ON p.id = b.performance_id\nJOIN shows s ON s.id = p.show_id\nWHERE b.status = 'оплачено'\nGROUP BY ...\nORDER BY sold DESC;",
        hints: ["<code>GROUP BY</code> собирает строки в группы — здесь группа = спектакль: <code>GROUP BY s.title</code>."],
        answer: "SELECT s.title, COUNT(*) AS sold\nFROM bookings b\nJOIN performances p ON p.id = b.performance_id\nJOIN shows s ON s.id = p.show_id\nWHERE b.status = 'оплачено'\nGROUP BY s.title\nORDER BY sold DESC;",
        check: { expect: "SELECT s.title, COUNT(*) FROM bookings b JOIN performances p ON p.id = b.performance_id JOIN shows s ON s.id = p.show_id WHERE b.status = 'оплачено' GROUP BY s.title ORDER BY 2 DESC", ordered: true },
        done: "Это уже отчёт: запрос прошёл по всем броням. На 12 тысячах — мгновенно, на 500 миллионах — минуты и нагрузка на рабочую базу.",
      },
    ],
  },

  // ======================================================================
  {
    id: "index",
    title: "Индексы",
    sub: "SQL · большая база",
    kind: "sql",
    big: true,
    intro: `
<p>Без индекса база ищет строки <b>перебором</b>: читает таблицу страница за страницей, как если искать слово в книге без оглавления. <b>Индекс</b> — это оглавление: отдельная отсортированная структура «значение → где лежит строка».</p>
<p>На этой вкладке база побольше: <b>100 000 броней</b> и 10 000 зрителей. Время запроса видно над результатом. Как база собирается искать, показывает <code>EXPLAIN QUERY PLAN</code>: <span class="pl scan">SCAN</span> — перебор всей таблицы, <span class="pl search">SEARCH … USING INDEX</span> — поиск по индексу.</p>
<p>Индекс не бесплатный: он занимает место и замедляет запись — при каждой вставке база обновляет и таблицу, и все её индексы.</p>`,
    tasks: [
      {
        t: "Найдите все брони Иванова (<code>viewer_id = 1</code>). Запомните время над результатом.",
        code: "SELECT * FROM bookings WHERE viewer_id = 1;",
        check: { run: true },
        done: "Десятки миллисекунд на один поиск: база перебрала все 100 000 броней, чтобы найти десяток. Когда таких запросов сотни в секунду — сервер базы занят только этим.",
      },
      {
        t: "Посмотрите план этого запроса: как база собирается искать?",
        code: "EXPLAIN QUERY PLAN\nSELECT * FROM bookings WHERE viewer_id = 1;",
        check: (out) => (!out.error && out.rows.some(r => /^SCAN bookings/.test(r[3])) ? true : "В плане должна быть строка SCAN bookings — выполните запрос как есть."),
        done: "<b>SCAN</b> — полный перебор таблицы. Индекса по <code>viewer_id</code> нет.",
      },
      {
        t: "Создайте индекс по столбцу <code>viewer_id</code> и снова найдите брони Иванова. Сравните время.",
        code: "CREATE INDEX IF NOT EXISTS idx_bookings_viewer ON bookings (...);\n\nSELECT * FROM bookings WHERE viewer_id = 1;",
        hints: ["В скобках — столбец, по которому ищем: <code>(viewer_id)</code>.", "<code>IF NOT EXISTS</code> — «если такого индекса ещё нет»: задание можно запускать повторно."],
        answer: "CREATE INDEX IF NOT EXISTS idx_bookings_viewer ON bookings (viewer_id);\n\nSELECT * FROM bookings WHERE viewer_id = 1;",
        check: { state: "SELECT COUNT(*) > 0 FROM sqlite_master m JOIN pragma_index_info(m.name) i WHERE m.type = 'index' AND m.tbl_name = 'bookings' AND i.name = 'viewer_id' AND i.seqno = 0", stateMsg: "Индекса по viewer_id в таблице bookings пока нет." },
        done: "Время упало в десятки раз. Справа у таблицы <code>bookings</code> появился ⚡ индекс. Чем больше таблица, тем больше разница: на миллионах строк — секунды против миллисекунд.",
      },
      {
        t: "Проверьте план ещё раз — что изменилось?",
        code: "EXPLAIN QUERY PLAN\nSELECT * FROM bookings WHERE viewer_id = 1;",
        check: (out) => (!out.error && out.rows.some(r => /SEARCH bookings USING INDEX/.test(r[3])) ? true : "В плане пока нет SEARCH … USING INDEX — сначала создайте индекс в задании 3."),
        done: "<b>SEARCH … USING INDEX</b>: база сразу нашла нужное место в индексе и прочитала только брони Иванова.",
      },
      {
        t: "Найдите брони на место «ряд 1, место 1» на <b>всех</b> показах. У таблицы уже есть индекс по паре «показ + место» (составной ключ). Поможет ли он? Посмотрите план.",
        code: "EXPLAIN QUERY PLAN\nSELECT * FROM bookings WHERE seat = 'ряд 1, место 1';",
        check: (out) => (!out.error && out.rows.length ? true : "Выполните запрос как есть и посмотрите на план."),
        done: "Снова <b>SCAN</b>. Индекс по паре «показ + место» отсортирован сначала по показу, потом по месту — как телефонный справочник: по фамилии найдёте быстро, а по одному имени только перебором. Индексы строят под конкретные запросы, а не «на всякий случай».",
      },
      {
        star: true,
        t: "Цена индекса. Скопируйте 100 000 броней в пустую таблицу без индексов и запомните время. Затем уберите <code>--</code> перед четырьмя <code>CREATE INDEX</code> и выполните снова.",
        code: "DROP TABLE IF EXISTS b_copy;\nCREATE TABLE b_copy AS SELECT * FROM bookings WHERE 0;\n-- CREATE INDEX c1 ON b_copy (viewer_id);\n-- CREATE INDEX c2 ON b_copy (performance_id, seat);\n-- CREATE INDEX c3 ON b_copy (created_at);\n-- CREATE INDEX c4 ON b_copy (status, price);\nINSERT INTO b_copy SELECT * FROM bookings;",
        check: (out, ctx) => (out.error ? false : /CREATE INDEX[^;]*ON\s+b_copy/i.test(ctx.code.replace(/--.*$/gm, "")) ? true : "Таблица скопирована — запомните время. Теперь уберите -- перед CREATE INDEX и выполните ещё раз."),
        done: "С четырьмя индексами та же вставка заметно медленнее: на каждую строку база обновляет таблицу и ещё четыре индекса. Поэтому индексы — под реальные запросы, а не на все столбцы подряд.",
      },
    ],
  },

  // ======================================================================
  {
    id: "tx",
    title: "Транзакции и ACID",
    sub: "SQL",
    kind: "sql",
    setup: `
CREATE TABLE wallets (
  viewer_id INTEGER PRIMARY KEY REFERENCES viewers(id),
  balance   INTEGER NOT NULL CHECK (balance >= 0)
);
INSERT INTO wallets SELECT id, 10000 FROM viewers WHERE id <= 20;
CREATE TABLE tickets (
  id         INTEGER PRIMARY KEY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  code       TEXT NOT NULL
);
INSERT OR IGNORE INTO bookings (viewer_id, performance_id, seat, price, status, created_at)
VALUES (2, 1, 'ряд 1, место 1', 3500, 'оплачено', '2026-09-20 10:00');`,
    watch: [
      ["Баланс Иванова", "SELECT balance || ' ₽' FROM wallets WHERE viewer_id = 1"],
      ["Брони Иванова на показ №1", "SELECT COUNT(*) FROM bookings WHERE viewer_id = 1 AND performance_id = 1"],
      ["Выдано билетов", "SELECT COUNT(*) FROM tickets"],
    ],
    intro: `
<p>Покупка билета — одно действие для зрителя, но <b>три шага</b> в базе: списать деньги, забронировать место, выдать билет. Что будет, если между шагами сбой?</p>
<p><b>Транзакция</b> — группа шагов, которые база выполняет <b>все или ни одного</b>. Начинается с <code>BEGIN</code>, заканчивается <code>COMMIT</code> (зафиксировать) или <code>ROLLBACK</code> (отменить всё, что сделано после BEGIN).</p>
<div class="acid">
  <div><b>A</b>Атомарность<small>всё или ничего · задания 1–3</small></div>
  <div><b>C</b>Согласованность<small>правила базы не нарушаются · задание 4</small></div>
  <div><b>I</b>Изолированность<small>параллельные покупки не мешают друг другу · задание 5</small></div>
  <div><b>D</b>Надёжность<small>после COMMIT данные не пропадут, даже если выключить сервер: база сначала пишет в журнал (WAL)</small></div>
</div>
<p>Здесь у зрителей есть кошелёк (<code>wallets</code>) и выданные билеты (<code>tickets</code>). Справа вверху — баланс Иванова и его билеты: следите за ними после каждого запуска.</p>
<p>Каждое задание начинается с одного и того же: у Иванова <b>10 000 ₽</b>, прошлые пробные покупки отменены. Запускайте сколько угодно раз — ошибки прошлых попыток не накапливаются.</p>`,
    tasks: [
      {
        t: "Иванов покупает билет на «Гамлета» (показ №1) за 3 500 ₽, но место «ряд 1, место 1» уже продано — шаг 2 упадёт. Выполните покупку <b>без транзакции</b> и посмотрите на баланс справа.",
        prep: TX_PREP, prepNote: TX_NOTE,
        code: "-- 1. списать деньги\nUPDATE wallets SET balance = balance - 3500 WHERE viewer_id = 1;\n\n-- 2. забронировать место\nINSERT INTO bookings (viewer_id, performance_id, seat, price, status, created_at)\nVALUES (1, 1, 'ряд 1, место 1', 3500, 'оплачено', '2026-10-10 12:00');\n\n-- 3. выдать билет\nINSERT INTO tickets (booking_id, code) VALUES (last_insert_rowid(), 'HAM-0001');",
        check: { error: /UNIQUE constraint failed/i, pre: "SELECT balance FROM wallets WHERE viewer_id = 1", state: "SELECT balance = :pre - 3500 FROM wallets WHERE viewer_id = 1", stateMsg: "Ожидали, что деньги спишутся, а покупка упадёт. Выполните запрос как есть — без BEGIN." },
        done: "Деньги списались, а места и билета нет — тот самый «💥 деньги списались, а билета нет». Без транзакции каждая команда фиксируется сразу, и отменить шаг 1 некому.",
      },
      {
        t: "То же самое, но <b>в транзакции</b>: допишите <code>BEGIN;</code> первой строкой и <code>COMMIT;</code> последней. Шаг 2 снова упадёт — что станет с балансом?",
        prep: TX_PREP, prepNote: TX_NOTE,
        code: "-- сюда BEGIN;\n\nUPDATE wallets SET balance = balance - 3500 WHERE viewer_id = 1;\n\nINSERT INTO bookings (viewer_id, performance_id, seat, price, status, created_at)\nVALUES (1, 1, 'ряд 1, место 1', 3500, 'оплачено', '2026-10-10 12:00');\n\nINSERT INTO tickets (booking_id, code) VALUES (last_insert_rowid(), 'HAM-0001');\n\n-- сюда COMMIT;",
        hints: ["Строка <code>BEGIN;</code> — без <code>--</code> впереди, иначе это комментарий."],
        check: { requires: /^\s*BEGIN\b/im, requiresMsg: "Добавьте BEGIN; первой строкой — без -- впереди.", error: /UNIQUE constraint failed/i, pre: "SELECT balance FROM wallets WHERE viewer_id = 1", state: "SELECT balance = :pre FROM wallets WHERE viewer_id = 1", stateMsg: "Баланс изменился — значит, транзакция не откатилась. Проверьте, что BEGIN стоит первой строкой." },
        done: "Шаг 1 выполнился, но после ошибки приложение сделало <code>ROLLBACK</code> — и списание отменилось. Баланс прежний. Это <b>атомарность</b>: всё или ничего.",
      },
      {
        t: "Успешная покупка: возьмите свободное место <code>балкон, место 7</code>. В транзакции, до <code>COMMIT</code>. Справа должны измениться все три показателя.",
        prep: TX_PREP, prepNote: TX_NOTE,
        code: "BEGIN;\n\nUPDATE wallets SET balance = balance - 3500 WHERE viewer_id = 1;\n\nINSERT INTO bookings (viewer_id, performance_id, seat, price, status, created_at)\nVALUES (1, 1, '...', 3500, 'оплачено', '2026-10-10 12:00');\n\nINSERT INTO tickets (booking_id, code) VALUES (last_insert_rowid(), 'HAM-0002');\n\nCOMMIT;",
        hints: ["Вместо многоточия — <code>'балкон, место 7'</code>, в кавычках."],
        check: { requires: /^\s*COMMIT\b/im, requiresMsg: "Транзакцию нужно завершить: COMMIT; последней строкой.", pre: "SELECT balance, (SELECT COUNT(*) FROM tickets) FROM wallets WHERE viewer_id = 1", state: "SELECT (SELECT balance FROM wallets WHERE viewer_id = 1) = :pre0 - 3500 AND (SELECT COUNT(*) FROM tickets) = :pre1 + 1", stateMsg: "Покупка не прошла целиком: проверьте место и что все три шага на месте." },
        done: "Три шага зафиксированы вместе. После <code>COMMIT</code> покупка уже не пропадёт, даже если сервер выключат через секунду, — это <b>надёжность</b> (D).",
      },
      {
        t: "Попробуйте купить VIP-ложу за 50 000 ₽ — спишите их с баланса Иванова. На счёте меньше.",
        prep: TX_PREP, prepNote: TX_NOTE,
        code: "UPDATE wallets SET balance = balance - 50000 WHERE viewer_id = 1;",
        check: { error: /CHECK constraint failed/i },
        done: "В таблице записано правило <code>balance >= 0</code>. База не даст ни одной операции оставить данные в состоянии, которое нарушает её правила, — это <b>согласованность</b> (C). Ключи из вкладки 2 — правила того же рода.",
      },
      {
        t: "<b>Изолированность.</b> Остался последний билет на «Гамлета», две кассы продают его одновременно. Пройдите сценарий по шагам — сначала без изоляции, потом с ней.",
        widget: (host, ctx) => Viz.isolation(host, ctx),
      },
    ],
  },

  // ======================================================================
  {
    id: "olap",
    title: "OLTP и OLAP",
    sub: "SQL · большая база",
    kind: "sql",
    big: true,
    intro: `
<p><b>OLTP</b> — транзакционные системы для ежедневной работы: купить билет, найти бронь, отменить. Много коротких запросов, ответ за миллисекунды, данные постоянно меняются.</p>
<p><b>OLAP</b> — аналитические системы для отчётов и дашбордов: выручка за год, загрузка залов по месяцам. Запросов мало, но каждый читает огромные объёмы, и ответ за секунды или минуты — нормально.</p>
<p>Здесь та же большая база, что во вкладке «Индексы»: 100 000 броней. Сравним два типа запросов на ней.</p>`,
    tasks: [
      {
        t: "<b>OLTP.</b> Кассир открывает бронь №54321. Выполните и посмотрите на время.",
        code: "SELECT * FROM bookings WHERE id = 54321;",
        check: { expect: "SELECT * FROM bookings WHERE id = 54321" },
        done: "Доли миллисекунды: поиск по первичному ключу всегда идёт по индексу. Такие запросы база выполняет тысячами в секунду.",
      },
      {
        t: "<b>OLAP.</b> Отчёт для дирекции: число броней и выручка по месяцам, только оплаченные. Допишите группировку и сравните время с заданием 1.",
        code: "SELECT substr(created_at, 1, 7) AS month,\n       COUNT(*)   AS bookings,\n       SUM(price) AS revenue\nFROM bookings\nWHERE status = 'оплачено'\nGROUP BY ...\nORDER BY month;",
        hints: ["Группируем по месяцу — по тому, что назвали <code>month</code>: <code>GROUP BY month</code>."],
        answer: "SELECT substr(created_at, 1, 7) AS month,\n       COUNT(*)   AS bookings,\n       SUM(price) AS revenue\nFROM bookings\nWHERE status = 'оплачено'\nGROUP BY month\nORDER BY month;",
        check: { expect: "SELECT substr(created_at, 1, 7), COUNT(*), SUM(price) FROM bookings WHERE status = 'оплачено' GROUP BY 1 ORDER BY 1", ordered: true },
        done: "В тысячи раз дольше: запрос прочитал все 100 000 строк. На сотнях миллионов — минуты, и всё это время он нагружает ту же базу, где идут продажи. Поэтому отчёты переносят в отдельную аналитическую базу.",
      },
      {
        t: "Почему аналитику держат в <b>колоночных</b> базах (ClickHouse)? Строчная база хранит бронь целиком, колоночная — каждый столбец отдельно. Отметьте, какие столбцы нужны отчёту из задания 2, и сравните, сколько данных придётся прочитать.",
        widget: (host, ctx) => Viz.columns(host, ctx),
      },
      {
        t: "Разложите запросы СценыМосквы: где OLTP, а где OLAP?",
        widget: (host, ctx) => Viz.classify(host, ctx, [
          ["Купить билет на «Щелкунчик»", "OLTP"],
          ["Показать зрителю его брони", "OLTP"],
          ["Дашборд: заполняемость залов по месяцам за три года", "OLAP"],
          ["Отменить бронь и вернуть деньги", "OLTP"],
          ["Какие спектакли чаще смотрят вместе — для рекомендаций", "OLAP"],
          ["Выручка по площадкам за год для годового отчёта", "OLAP"],
        ]),
      },
    ],
  },

  // ======================================================================
  {
    id: "redis",
    title: "Redis",
    sub: "NoSQL · ключ-значение",
    kind: "redis",
    intro: `
<p><b>Redis</b> — база «ключ-значение», которая держит всё <b>в оперативной памяти</b>. Как гардероб: сдали пальто — получили номерок, по номерку пальто выдают мгновенно. Но спросить «у кого синее пальто?» нельзя.</p>
<p>Таблиц, схемы и SQL нет. Есть <b>ключ</b> — строка вроде <code>session:7f3a9c</code> — и <b>значение</b>: строка, набор полей, список или рейтинг. Ответ — за доли миллисекунды, поэтому Redis ставят как кэш, для сессий и счётчиков. Цена — данные в памяти: она дорогая, и при сбое может пропасть то, что не успело сохраниться на диск.</p>
<details class="cheat"><summary>Шпаргалка команд</summary>
<table class="cmds">
<tr><td><code>SET ключ значение</code><br><code>SET ключ значение EX 30</code></td><td>записать строку; с EX — на 30 секунд</td></tr>
<tr><td><code>GET ключ</code> · <code>DEL ключ</code></td><td>прочитать · удалить</td></tr>
<tr><td><code>KEYS *</code> · <code>KEYS session:*</code></td><td>список ключей по шаблону</td></tr>
<tr><td><code>TTL ключ</code> · <code>EXPIRE ключ 60</code></td><td>сколько осталось жить · задать время жизни</td></tr>
<tr><td><code>INCR ключ</code></td><td>увеличить число на 1</td></tr>
<tr><td><code>HSET ключ поле значение …</code> · <code>HGETALL ключ</code></td><td>набор полей (hash): записать · прочитать все</td></tr>
<tr><td><code>RPUSH ключ значение</code> · <code>LPOP ключ</code> · <code>LRANGE ключ 0 -1</code></td><td>список: в конец · взять первый · показать весь</td></tr>
<tr><td><code>ZINCRBY ключ шаг элемент</code> · <code>ZREVRANGE ключ 0 2 WITHSCORES</code></td><td>рейтинг: прибавить очки · топ-3 с очками</td></tr>
</table>Одна строка — одна команда. Текст с пробелами — в кавычках.</details>
<p>Справа — всё, что сейчас лежит в Redis. Обновляется вживую.</p>`,
    tasks: [
      {
        t: "Посмотрите, какие ключи уже есть, и прочитайте счётчик просмотров «Гамлета».",
        code: "KEYS *\nGET views:Гамлет",
        check: (out) => (out.lines.some(l => /^GET\s/i.test(l.cmd) && l.reply.t === "str") ? true : "Нужна команда GET с существующим ключом — названия ключей видны справа."),
        done: "Одна команда — одно действие с одним ключом. Никаких WHERE и JOIN.",
      },
      {
        t: "Кэш: положите карточку «Гамлета» на <b>30 секунд</b> и проверьте, сколько ей осталось. Подождите — справа она исчезнет сама, а <code>GET</code> вернёт <code>(nil)</code>.",
        code: 'SET afisha:Гамлет "Гамлет · 3 октября, 19:00 · от 3 500 ₽" EX ...\nTTL afisha:Гамлет',
        hints: ["<code>EX 30</code> — время жизни в секундах."],
        check: (out, ctx) => { const e = ctx.inst.get("afisha:Гамлет"); return e && e.exp ? true : "Ключ должен жить ограниченное время: после значения — EX и число секунд."; },
        done: "Так работает кэш: через 30 секунд Redis удалит ключ, и сайт возьмёт свежие данные из основной базы. Время жизни — компромисс: чем дольше, тем меньше нагрузка на базу, но тем дольше на сайте может висеть устаревшая цена.",
      },
      {
        t: "Сессия: Иванов вошёл на сайт. Сохраните <code>session:a1b2c3</code> с полями <code>user_id</code> = 1 и <code>cart</code> = «Гамлет ×2» и задайте ей жизнь 30 минут.",
        code: 'HSET session:a1b2c3 user_id 1 cart "..."\nEXPIRE session:a1b2c3 ...\nHGETALL session:a1b2c3',
        hints: ["Корзина — в кавычках: <code>\"Гамлет ×2\"</code>.", "30 минут = 1800 секунд."],
        check: (out, ctx) => {
          const e = ctx.inst.get("session:a1b2c3");
          if (!e || e.t !== "hash") return "Сессии session:a1b2c3 пока нет.";
          if (e.v.get("user_id") !== "1") return "Поле user_id должно быть 1.";
          if (!e.v.get("cart") || e.v.get("cart") === "...") return "Заполните корзину вместо многоточия.";
          return e.exp ? true : "Сессии нужно время жизни: EXPIRE и число секунд.";
        },
        done: "Сессия лежит в Redis, а не в памяти сервера приложения, — поэтому любой сервер за балансировщиком узнает Иванова. Уйдёт с сайта на 30 минут — сессия исчезнет сама.",
      },
      {
        t: "Счётчик: Иванов открыл страницу «Гамлета» — увеличьте счётчик просмотров на 1.",
        code: "INCR views:...",
        before: ctx => +((ctx.inst.get("views:Гамлет") || {}).v || 0),
        check: (out, ctx) => (+((ctx.inst.get("views:Гамлет") || {}).v || 0) > ctx.before ? true : "Счётчик views:Гамлет не изменился — проверьте название ключа."),
        done: "<code>INCR</code> атомарный: даже если тысяча зрителей откроют страницу в одну секунду, ни одно увеличение не потеряется. Обычной базе такая частота записи обошлась бы дорого.",
      },
      {
        t: "Найдите все сессии, у которых в корзине «Щелкунчик».",
        code: "# В Redis нет поиска по значению. Попробуйте:\nKEYS session:*\nHGETALL session:7f3a9c",
        check: (out) => (out.lines.length && !out.error ? true : false),
        done: "Найти по значению нельзя: только перебрать все ключи и заглянуть в каждый. На миллионе сессий это недопустимо медленно. Redis — для быстрого доступа по известному ключу, а не для поиска и отчётов.",
      },
      {
        star: true,
        t: "Рейтинг: билеты на «Гамлета» купили ещё 1 000 раз. Прибавьте очки и выведите тройку лидеров.",
        code: 'ZINCRBY top:shows 1000 "Гамлет"\nZREVRANGE top:shows 0 2 WITHSCORES',
        check: (out) => { const l = out.lines[out.lines.length - 1]; return l && l.reply.t === "arr" && l.reply.v.length && l.reply.v[0].v === "Гамлет" ? true : "В конце выведите топ: ZREVRANGE top:shows 0 2 WITHSCORES."; },
        done: "Рейтинг пересортировывается сам при каждом изменении — так делают таблицы лидеров и «популярное сейчас».",
      },
    ],
  },

  // ======================================================================
  {
    id: "mongo",
    title: "MongoDB",
    sub: "NoSQL · документы",
    kind: "mongo",
    intro: `
<p><b>MongoDB</b> — документная база. Вместо строк в таблицах — <b>документы</b>, похожие на JSON: всё про спектакль лежит в одном документе — площадка, актёры, показы. Прочитали документ — получили всё, <b>JOIN не нужен</b>.</p>
<p>Документы собраны в <b>коллекции</b> (аналог таблицы), но жёсткой схемы нет: у концерта — исполнители, у выставки — залы, и база не требует одинаковых полей.</p>
<p>Язык — не SQL, а команды вида <code>db.коллекция.команда(…)</code>. Условие тоже записывается документом: <code>{ genre: "балет" }</code>.</p>
<details class="cheat"><summary>Шпаргалка команд</summary>
<table class="cmds">
<tr><td><code>db.shows.find({ genre: "балет" })</code></td><td>найти все подходящие документы</td></tr>
<tr><td><code>db.shows.find({ … }, { title: 1, _id: 0 })</code></td><td>второй аргумент — какие поля показать</td></tr>
<tr><td><code>db.shows.findOne({ title: "Гамлет" })</code></td><td>первый подходящий документ</td></tr>
<tr><td><code>{ rating: { $gt: 4.7 } }</code></td><td>сравнения: <code>$gt</code> больше, <code>$lt</code> меньше, <code>$gte</code>, <code>$lte</code>, <code>$ne</code> не равно, <code>$in</code> одно из</td></tr>
<tr><td><code>{ "actors.name": "…" }</code></td><td>поле внутри документа — через точку</td></tr>
<tr><td><code>.sort({ rating: -1 }).limit(3)</code></td><td>сортировка (−1 по убыванию) и сколько показать</td></tr>
<tr><td><code>db.shows.countDocuments({ … })</code></td><td>сколько документов подходит</td></tr>
<tr><td><code>db.shows.insertOne({ … })</code></td><td>добавить документ</td></tr>
<tr><td><code>db.shows.updateOne({ условие }, { $set: { поле: значение } })</code><br><code>updateMany</code> — то же для всех подходящих</td><td>изменить один · все</td></tr>
</table></details>`,
    tasks: [
      {
        t: "Откройте документ «Гамлета» целиком.",
        code: 'db.shows.findOne({ title: "Гамлет" })',
        check: (out) => (out.value && out.value.title === "Гамлет" ? true : "Ожидали документ «Гамлета». Проверьте название в кавычках."),
        done: "Площадка, актёры и показы — внутри одного документа. В SQL для такого ответа понадобились бы четыре таблицы и три JOIN (вкладка 3).",
      },
      {
        t: "Найдите все балеты; покажите только название и возраст.",
        code: 'db.shows.find({ genre: "..." }, { title: 1, age: 1, _id: 0 })',
        hints: ["Жанр в кавычках: <code>\"балет\"</code>."],
        check: (out, ctx) => sameDocs(out, ctx.mongo('db.shows.find({ genre: "балет" }, { title: 1, age: 1, _id: 0 })')),
        done: "Первый аргумент — условие, второй — какие поля показать. Как <code>WHERE</code> и список столбцов после <code>SELECT</code>.",
      },
      {
        t: "В каких спектаклях играет <b>Мария Лебедева</b>? Ищем по полю внутри списка актёров.",
        code: 'db.shows.find({ "actors.name": "..." }, { title: 1, _id: 0 })',
        check: (out, ctx) => sameDocs(out, ctx.mongo('db.shows.find({ "actors.name": "Мария Лебедева" }, { title: 1, _id: 0 })')),
        done: "Точка в названии поля — путь внутрь документа, и MongoDB сама заглядывает в каждый элемент списка.",
      },
      {
        t: "Добавьте новый формат — экскурсию за кулисы. У экскурсий есть поле, которого нет ни у кого: <code>guide</code>, экскурсовод. Менять структуру базы не нужно.",
        code: 'db.shows.insertOne({\n  title: "Экскурсия за кулисы",\n  genre: "экскурсия",\n  age: "12+",\n  guide: "...",\n  minutes: 60\n})',
        hints: ["Впишите любое имя экскурсовода в кавычках."],
        check: (out, ctx) => (ctx.mongo('db.shows.countDocuments({ title: "Экскурсия за кулисы", guide: { $exists: true, $nin: ["...", ""] } })') > 0
          ? true : "Документа с экскурсоводом пока нет: замените многоточие на имя и выполните."),
        done: "Документ с новым полем просто добавился: справа видно, что <code>guide</code> есть у одного документа из тринадцати. В реляционной базе пришлось бы менять таблицу (<code>ALTER TABLE</code>). Обратная сторона: база не проверит, что экскурсовод указан у всех экскурсий, — за порядком следит программа. Если запускали несколько раз — экскурсий в коллекции несколько: MongoDB не проверяет дубли, пока не попросить её об этом уникальным индексом.",
      },
      {
        t: "Основную сцену переименовали в «Историческую сцену». Название площадки записано внутри каждого спектакля — обновите все документы.",
        code: 'db.shows.updateOne(\n  { "venue.name": "Основная сцена" },\n  { $set: { "venue.name": "Историческая сцена" } }\n)',
        hints: ["Посмотрите на ответ: <code>matchedCount</code> — сколько документов изменено.", "<code>updateOne</code> меняет только первый подходящий документ, для всех — <code>updateMany</code>."],
        check: (out, ctx) => { const n = ctx.mongo('db.shows.countDocuments({ "venue.name": "Основная сцена" })'); return n === 0 ? true : `Со старым названием осталось документов: ${n}. На сайте сейчас у одних спектаклей «Историческая сцена», у других — «Основная».`; },
        done: "В SQL название площадки хранится в одной строке таблицы <code>venues</code> — поменяли одну строку. В документной базе оно скопировано в каждый спектакль (<b>денормализация</b>): читать быстрее, но при изменении нужно обновить все копии, а забытая копия — это расхождение данных.",
      },
    ],
  },

  // ======================================================================
  {
    id: "choose",
    title: "Выбор базы",
    sub: "под задачу",
    kind: "none",
    intro: `
<p>Универсальной базы нет: крупные сервисы держат несколько баз сразу, каждую под свою задачу. Для каждого кейса СценыМосквы выберите подходящий тип.</p>
<p>Помогают вопросы с лекции: какая структура у данных и как часто она меняется? Чего больше — чтения или записи? Нужны ли сложные запросы и транзакции? Какой объём?</p>`,
    sideHtml: `<div class="lbl">Типы баз</div>
<div class="tbl"><b>Реляционная</b><div class="ct">PostgreSQL, MySQL — общего назначения: строгая структура, связи, транзакции</div></div>
<div class="tbl"><b>Ключ-значение</b><div class="ct">Redis — кэш, сессии, счётчики; всё в памяти, доступ только по ключу</div></div>
<div class="tbl"><b>Документная</b><div class="ct">MongoDB — гибкая структура, вложенные данные, без JOIN</div></div>
<div class="tbl"><b>Колоночная</b><div class="ct">ClickHouse — аналитика, отчёты, логи по огромным объёмам</div></div>
<div class="tbl"><b>Графовая</b><div class="ct">Neo4j — связи «кто с кем», рекомендации, маршруты</div></div>`,
    tasks: [
      ["Продажа билетов: списать деньги, занять место, выдать билет. Одно место нельзя продать дважды.", 0,
        "Деньги и места — строгая структура, связи и транзакции с ACID. Классическая задача реляционной базы."],
      ["Корзина и сессия посетителя сайта: живут 30 минут, читаются при каждом клике.", 1,
        "Короткоживущие данные, которые читают по ключу постоянно, — ключ-значение в памяти. Пропадёт корзина при сбое — неприятно, но не катастрофа."],
      ["Дашборд для дирекции: выручка и заполняемость залов по месяцам за пять лет — сотни миллионов строк.", 3,
        "Агрегации по огромному объёму, а читаются несколько столбцов — это OLAP и колоночная база."],
      ["Каталог мероприятий: у спектакля актёры, у концерта исполнители, у выставки залы и даты. Новые форматы появляются каждый месяц.", 2,
        "Разная структура у разных видов и частые изменения модели — сильная сторона документной базы без жёсткой схемы."],
      ["«Вам может понравиться»: зрители, которые ходили на те же спектакли, что и вы, ещё смотрели…", 4,
        "Цепочки связей «зритель → спектакль → другие зрители → их спектакли» графовая база проходит быстрее, чем множество JOIN."],
      ["Счётчик «сейчас эту страницу смотрят 120 человек» — тысячи обновлений в секунду.", 1,
        "Очень частые простые изменения одного значения — атомарный INCR в памяти."],
      ["Журнал действий на сайте: миллиард событий в месяц, раз в неделю аналитики ищут в нём закономерности.", 3,
        "Поток событий пишется пачками, а анализ идёт по огромному объёму — колоночная база (на лекции: Kafka + ClickHouse)."],
      ["Учёт сотрудников театра: отделы, должности, графики. Структура понятная, данных немного.", 0,
        "Строгая структура, связи и небольшой объём — универсальная реляционная база закроет это без лишней сложности. Экзотику без причины не выбирают."],
    ].map(([t, correct, why]) => ({ t, widget: (host, ctx) => Viz.quiz(host, ctx, { why, options: DB_TYPES.map((o, i) => [o[0], i === correct, o[1]]) }) })),
  },
];

// варианты для вкладки «Выбор базы»: название и пояснение, если выбор неудачный
var DB_TYPES = [
  ["Реляционная (PostgreSQL)", "Реляционная справится, но здесь есть инструмент удобнее — подумайте, что в задаче главное."],
  ["Ключ-значение (Redis)", "Redis держит данные в памяти и ищет только по ключу: быстро, но без сложных запросов и без строгих гарантий сохранности."],
  ["Документная (MongoDB)", "Документная база хороша для гибкой структуры и вложенных данных — здесь важнее другое."],
  ["Колоночная (ClickHouse)", "Колоночная база — для отчётов по огромным объёмам: быстро читает столбцы, но плохо подходит для частых мелких изменений."],
  ["Графовая (Neo4j)", "Графовая база — для связей «кто с кем», здесь главное не они."],
];

// сравнение результатов MongoDB без учёта порядка
function sameDocs(out, expected) {
  if (out.error) return false;
  const a = (Array.isArray(out.value) ? out.value : [out.value]).map(d => JSON.stringify(d)).sort();
  const b = (Array.isArray(expected) ? expected : [expected]).map(d => JSON.stringify(d)).sort();
  if (a.length !== b.length) return `Ожидали документов: ${b.length}, у вас: ${a.length}.`;
  return a.every((x, i) => x === b[i]) ? true : "Документы не те: проверьте условие и какие поля показываете.";
}

