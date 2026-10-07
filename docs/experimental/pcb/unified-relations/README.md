# Согласование relations: эксперимент 2026-10-04

> Исторический отчёт. [Калибровка весов 2026-10-07](../route-weight-calibration/README.md)
> уменьшает коэффициент кубического превышения мягких non-core pair/path
> с 1 до 0.25. Формула, линейный член и core-профили сохранены;
> приведённые ниже исходные числа описывают эксперимент 2026-10-04.

Ветка `feat/experimental-unified-relations`, исходный коммит `6a001c5` ветки
`feat/experimental`. Не коммитить/сливать до проверки результата пользователем.
Изменения пользовательского `tests/pcb-layout/ESpower/ESpower.js` не тронуты.

## Что проверяем

Общая функция расстояния в Rust для Block/Family, Board Package, PostPlace и
начального corePairs. TypeScript передаёт намерение, координаты и параметры,
полученные от Rust; собственной функции distance score у него нет.

Это поведенческий эксперимент, а не обещание эквивалентности прежней раскладке.
Полное качество платы пока **не подтверждено**. Обнаружены не прошедшие
интеграционные проверки, перечисленные ниже. Все виды оценок системы ещё не
унифицированы: ограничения текущего охвата явно указаны в конце.

## Формула и значения

`P(d) = W*d + W/tau² * (max(d-M,0)³ + max(m-d,0)³)`.
Отсутствующая граница не добавляет соответствующий член.
`W = 10 * priority * authorWeight * pathFactor`.
Приоритеты: low=0.5, normal=1, high=2, critical=4; pathFactor=2 для signalPath,
иначе 1. Приоритет применяется один раз. Насыщения 250000 нет. Признак hard не
Core hard distance uses x100 on the cubic excess only; it is soft and reported as a warning (see below).

| Relation | DSL | Мягкий max при отсутствии явного | tau |
|---|---|---|---|
| near | `near(...)` | 8 для high/critical, 12 иначе | 2 |
| very_near | `veryNear(...)` | 3 для critical, 4 иначе | 2 |
| cluster_with | `cluster(...)` | 10 | 2 |
| critical_pair | `criticalPair(...)` | 3 для critical/core, 4 иначе | 1 |
| сегмент пути | `signalPath(...)` | отсутствует | 1 |

Сохранены неявные min: near/cluster=0.8, veryNear=0.4.
Явные min/max и authorWeight имеют приоритет. Старые 25/70/140/240 остаются
форматом транспортного веса graph relations; таблица теперь принадлежит Rust,
из этого веса Rust извлекает authorWeight. Скрытые default ×1.8/×2.4 в hint expansion и ×2.4/×2.8 в corePairs/coreIsland удалены.

Пример criticalPair max=9, authorWeight=1: d=9 → 360; d=9.5 → 385;
d=17 → 21160. Для такого же signalPath-сегмента значения вдвое больше.

## Заменённые реализации

| Место | Было | В эксперименте |
|---|---|---|
| Block CPU/CubeCL | отдельный distance-limit penalty, hard×5, cap250000; при high общий ×0.45 | `relation_score::distance_cost`, без stage multiplier |
| Board CPU/CubeCL | отдельная копия limit penalty; high×0.35 | та же функция и профиль |
| PostPlace CPU/CubeCL | линейный вес + `20*W*excess²`, свои defaults | та же функция; defaults приходят из Rust |
| `hints.ts` | численные defaults расстояния и приоритеты в TS | native `placementRelationProfile` и `placementPriorityWeight` |
| CorePairs island | `(sum(d + 100*excess²))*10000`, общий min(max) нескольких пар; дополнительная сумма длин | каждая пара получает свой native профиль; дублирующая сумма длин удалена |
| comp endpoint | Block/Board: среднее падов, PostPlace: позиция компонента | везде позиция компонента; pin остаётся конкретным падом |
| SignalPath | дополнительный stage multiplier Block2.5/4, Board3/5, Post20; приоритет умножался повторно | одна нормализация веса и общая `topology_cost`; ordinary-net terms отделены и сохраняют старые коэффициенты |
| Refiner/score encoder | принудительный минимальный вес1 | передаёт точный native вес, в том числе малый авторский |
| Отчёт пути | weight1 вне зависимости от authored hints | тот же нормализованный вес пути |

`inverseTauSquared` — параметр общей кривой в существующем транспорте
NumericRule → native PostPlace → GPU. `core` переносит уже существующий DSL-флаг,
чтобы default3 для core-пары не терялся при кодировании. `pairRelations` переносит
существующие параметры отдельных пар островка. Эти поля не добавляют поисковых
стадий или новых DSL-конструкций.

В GPU Block координаты компонента размещены после настоящих connection points
в статическом транспортном буфере. Они не входят в число падов, электрические
сети, препятствия или генерацию кандидатов. На CPU читается placement компонента.

Код Micro-A*, число кандидатов, beam width, отбор pair seeds, веса компактности,
геометрических препятствий и threshold100 не изменены. Исключение в допустимости — отдельно согласованный hard:true для corePairs. Однако Micro-A* получает
веса из того же графа: удаление неявного усиления criticalPair меняет этот вход.
Это нельзя описывать как полностью неизменную маршрутную поправку.

## Проверки и текущий результат

- TypeScript typecheck: проходит.
- Rust: 103 passed, 5 ignored; GPU feature компилируется.
- 15 целевых проверок score authority/net score/unified relations: проходят.
  На одной геометрии near имеет одинаковый вклад Block/Board/PostPlace при normal
  и high compactness. Отдельно проверены authored weight, отсутствие cap,
  signalPath ×2 и отсутствие island ×10000.
- CPU/GPU probe Block и Board с включёнными VERIFY: одинаковые score и poses,
  hardCount=0, fallback отсутствует. Проверены124 block-кандидата и598 board-кандидатов.
  [Числа и hash addon](parity.json). Холодная компиляция CUDA входит во время;
  это проверка корректности, не измерение ускорения полного pipeline.
- Отдельная PostPlace CPU/GPU-проверка полного score, путей, сторон и победителей: проходит.
- Промежуточный интеграционный прогон: 66 tests, 56 passed, 6 skipped, 4 failed.
  Ожидания тестов не ослаблялись:
  1. `packs core pair components near their paired pads`: площадь37.505 при ожидании ≤32.
  2. `solves two-component core pair islands ...`: первая связь3.9303мм при ожидании ≤2.5мм.
  3. `keeps alternate module orders ...`: пересечение input_power/buck.
  4. `places a cross-block RF-style path ...`: report.ok=false.
     Дополнительная диагностика: сам путь прямой (detour/backtrack/turns=0),
     все четыре maxDistance соблюдены. Причина report.ok=false — C1–U1 и U1–C2:
     зазор0.25мм при требовании0.5мм. Это механическая проблема результата,
     а не доказательство ухудшения формы signalPath.
  All four checks also fail on the original commit; see baseline verification below.

Снятие огромного скрытого усиления островка меняет компромисс с сохранёнными
штрафами препятствий и ориентации. Особенно существенно: `hard:true` в старом
core island не был независимым критерием ранжирования — большой distance penalty
фактически маскировал отсутствие такой проверки. Уменьшение веса это проявляет.
Latest decision (2026-10-04) supersedes strict core-pair distance ranking:
`core:true, hard:true` multiplies only cubic min/max excess by **100**, through
the common Rust profile. The linear cost and topology cost remain unchanged.
Core distance violations no longer contribute to island hardCount/hardSeverity;
physical overlap still does. Each selected drift above 0.001 mm produces a warning
with pair references, measured distance and limits. PostPlace numeric distance
rules for core pairs are likewise soft, carrying the same amplified profile.
A finite penalty is a preference, not a guarantee of choosing an in-limit result
whenever one exists. Candidate generation/counts are unchanged. Partial island
assembly evaluates only pairs whose two endpoints have already been placed.

Baseline verification: all four listed integration failures also reproduce on
commit 6a001c5 using its original TS and a separately built CPU addon. They are
not evidence of four newly introduced failures. The new scores may still change
geometry; full STM32/ESPower quality remains unaccepted.

Заодно устранено расхождение итогового island score: corePairs отбирался по
core-формуле, а в результате публиковалась generic-формула. Теперь используется
тот же core evaluator.

Старые сохранённые native captures содержат старые транспортные веса и defaults.
Они пригодны для проверки CPU/GPU на идентичном входе, но сравнение качества новой
DSL-компиляции требует заново кодировать PlacementInput. Нельзя объявлять старый
native capture полноценным прогоном новой семантики.

## Что ещё не закрыто

Общая функция расстояния не означает, что все остальные отношения уже имеют
одинаковый полный вклад. Это следующие конкретные разрывы для следующей итерации:

- Block добавляет собственные exposure/facing к некоторым relations; PostPlace
  не воспроизводит эти члены. Явный signalPath topology теперь общий, но соседние
  эвристики доступа к порту ещё могут влиять на выбор по-разному.
- away/clearance/same_side/edge/prefer_layer: в PostPlace отдельные типы оценок,
  а графовые Block/Board-входы не несут весь тот же геометрический контекст.
  Их полная унификация требует транспорта зазоров/сторон/границ; текущая работа
  не утверждает, что этот вопрос решён.
- bypass/cap_cluster/line имеют отдельные структурные критерии островка.
  Общая distance-функция не заменяет правила шин, рядов и ориентации.
- Автоматические graph-only связи не всегда попадают в исходные input.hints,
  из которых компилируется PostPlace. Отсутствие relation на этапе не исправляется
  совпадением формул.
- Цены обычных сетей, геометрии, площади и механики этапов остаются различными.
  Их нельзя молча перенастроить в рамках согласования distance relations.

Не считать эксперимент завершённым согласованием всех scores и не переносить
в основную ветку до разбора этих пунктов и проверки STM32/ESPower.

### Core drift validation (latest build)

- `npm run native:build`, `npm run typecheck`: passed.
- Rust: 103 passed, 5 ignored. Focused score/drift tests: 7 passed.
- CPU/CubeCL replay with `core:true, hard:true`: identical states and ranks;
  block score 513.4400024, board score 4756.8208008, physical hardCount=0.
  VERIFY enabled, no GPU fallback; 124 block and 598 board candidates.
- Exact outputs and rebuilt addon hash: [drift-parity.json](drift-parity.json).
  Previous parity.json describes the earlier build, not this one.
- No full-board quality claim and no commit. STM32/ESPower acceptance remains pending.
