# Rust — источник PCB placement score

Дата: 2026-10-03. Основание — указание пользователя: при конфликте выбирать
существующую Rust-оценку, а не переносить предпочтения TS в поиск. D3 и настройка
качества раскладки не входят в эту работу.

## Архитектурное правило

Формулы, численные веса и измерения качества принадлежат Rust. TypeScript
компилирует DSL/геометрию, вызывает solver/evaluator, проверяет допуск и организует
этапы. Собственной запасной формулы score в TS нет. Правило закреплено в
`src/pcb-layout/AGENTS.md` и `native/pcb-board-packer/AGENTS.md`.

Это не один универсальный score для всех задач. Block search, Board Package,
post-place, passive island и authored island имеют разные назначения и native
objectives. Один и тот же этап поиска и сравнение его результатов должны
обращаться к одному оценщику, с теми же relations, режимами и ограничениями.

Native search сохраняет собственные маршрутные поправки shortlist и другие
поисковые эвристики. `evaluateBlockQuality` совпадает с native checkpoint
`rank.score`; перенос не отменяет внутренние эвристики Rust и не объявляет
разные native этапы одной формулой.

## Что заменено

| Место / этап | Прежний TypeScript | Теперь |
|---|---|---|
| `block-quality.ts`, checkpoints, pair seeds, portfolio блоков | `scorePostPlace + localStretch + .35·area + .5·(w+h) + 2·exposure` | `block_solver::score_block` через `evaluateBlockQuality`; существующая формула поиска Rust |
| Компактность поиска CPU/GPU | Предыдущая незакоммиченная правка нормировала normal-mode до `.35·area + .5·(w+h)` для прямоугольника | Нормировка снята. Вернулись Rust bbox/hull коэффициенты: normal `3.2, 2.5, 10, 1.5`; high `4.2, 5.4, 14.4, 12`. `reducedHull` по-прежнему умножает только hull area на `.25` |
| `block-portfolio.ts`, выбор после Board Package | `postPlace + sum(internalBlockQuality) + spacing + alignment` | Полный `solver::state_rank` упаковщика с исходным `BoardPackParams`. Отдельная TS-добавка internalBlockQuality удалена, а не добавлена в Rust упаковщик |
| `board-spacing.ts` | Собственная копия `18·max(0, clearance+gap−distance)²` | Вызов `solver::soft_spacing_penalty`, включая native проверку конфликтующих сторон и exemptions |
| `board-alignment.ts` | Собственная копия позиционного Huber и cosine orientation penalty | Вызов общего `solver::alignment_score`, используемого самим упаковщиком |
| Диагностика длины сетей | TS MST | MST из `post_place.rs`; финальные wiring guards получают native lengths |
| Отбор comparable/dominates/near и wiring regression | Пороги и арифметика в TS | `placement_quality.rs`, прежние пороги сохранены |
| Островки `line/bypass/cap_cluster/core_pairs` | TS distance/spread/compactness/pad-hit/facing scores | `placement_quality::island`, без настройки коэффициентов; генерация вариантов остаётся прежней |
| Начальные ориентации, pin-1, bypass и power-side ориентации | TS формулы | `placement_quality::orientation_score` и native веса ориентации |
| Структурное сходство блоков, spacing/alignment policy | TS weighted Dice, shape ratio, density→gap/compactnessScale | Native policy/quality функции; извлечение структуры и геометрии остаётся в TS |
| Post-place/refiner питание | Отдельный prefix regexp в двух энкодерах | Веса от Rust `net_class::is_power` |
| Board ordinary nets / начальная ориентация / powerComponent | Разные schematic/TS классификаторы | Rust `net_class`; имена сетей не переименовываются |
| same_side / prefer_layer | TS `weight·20` / `weight·10` | Общая функция `post_place::layer_penalty`, также используемая refiner |
| Суммирование native path/orientation scores | TS F32 reduction | Native F32 reduction |

Для block checkpoints сохраняется канонический контекст исходного блока.
Экспериментальная смена роли компонента может влиять на поиск гипотезы, но её
результат оценивается с исходными ролями через тот же Rust evaluator. Исходные
DSL/roles не меняются. Альтернативы сохраняют уже вычисленную native quality,
вместо повторного вызова оценщика без relations.

### Исправление контекста grouped/released, 2026-10-03

После коммита `a15e413` обнаружен пропуск в этом согласовании: `tree-solver.ts`
повторно извлекал исходные graph relations при оценке checkpoints. Поиск released
при этом использовал преобразованные `relaxed.relations`. Привязки к исчезнувшим
группам при итоговом сравнении переставали разрешаться. Общая Rust-функция сама
по себе не устраняла различие её входного контекста.

На сохранённом STM capture `2026-10-03T14-34-59-367Z`, MCU `00046`, одна геометрия
получала 8205.744140625 с поисковыми relations и 6273.447265625 с исходными
групповыми. Разница 1932.296875 воспроизводится удалением released anchors.

Исправлены только три места вызова оценки в `solveBlockNode` через локальный
`qualityFor`: grouped сохраняет `originalRelations`, released/original/role
гипотезы — `params.relations`. Это действует для обычных checkpoints, источников
парного улучшения и postrefine-кандидатов. Канонические исходные роли остаются;
изменения весов, Rust-формул, алгоритмов поиска и его бюджета отсутствуют.

Интеграционный тест в `pcb-relaxed-block-groups.test.ts` перехватывает реальные
контексты поиска и сравнивает всю quality каждого кандидата портфеля с native
оценкой в соответствующем контексте. Тест падает до правки и проходит после неё.
Исторические результаты ниже относятся к исходной миграции, до этого исправления.

Проверки исправления: typecheck/build успешны; 18/18 тестов в
`pcb-relaxed-block-groups`, `pcb-block-quality`, `pcb-block-search-stages`,
`pcb-native-score-authority` прошли. Новый STM capture:
`debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T16-12-57-227Z`.
MCU released/pairs имеет native rank 8205.744140625 и portfolio score 8205.74.
68 компонентов, report.ok=true, overlaps=0, outsideBoard=0, hard hint violations=0;
15 мягких нарушений остаются. Финальный массив placements полностью совпал с
запуском `14-34-59-367Z`: исправление контекста не улучшило и не ухудшило геометрию
этого примера. Native addon не менялся и не пересобирался. Время capture не
используется для выводов о производительности: часть проверки шла параллельно тестам.

`electrical` в block quality теперь означает сумму электрических слагаемых
**того же Rust block objective**, без bbox/hull/aspect/overlap/bounds/target-size.
Это больше не прежний `postPlace + TS localStretch`. `score` — полный Rust score;
`wire`, `links`, `ports` — native измерения для допуска/разнообразия и отчёта.

## Какие прежние TS формулы сняты

Для блока `localStretch` складывался из двух частей:

1. На каждом MST-ребре между разными компонентами:
   `netWeight · 2 · max(distance−4, 0)²`.
2. Для каждого non-main_ic pin и каждого main_ic на его сети — расстояние до
   ближайшего same-net pin этого IC:
   `netWeight · (6·distance + 32·max(distance−3, 0)²)`.

TS исключал GND и ignored nets, использовал `.25` для питания, `1` для сигналов.
MST-вес `wire` был суммой `netWeight·distance`. Внешняя `exposure` была минимальной
глубиной пина сети внутри bbox, умноженной на netWeight, затем на `2` в score.
Эти добавки больше не определяют финальный score блока отдельно от поиска.
Существующая незакоммиченная native IC-pin stretch правка сохранена по текущему
указанию: пользователь отменил именно удешевление компактности. Она не добавляется
повторно при итоговом отборе.

TS normal compactness не содержала hull, aspect ratio, target size и других
предпочтений поиска Rust. Теперь final block score содержит те же члены, что поиск.

Прежний prefix regexp питания:
`/^(?:VBUS|VCC|VDD|VIN|BAT|AVDD|DVDD|IOVDD|ADC_AVDD|VREG|[+]\w+)/i`.
Он, например, пропускал `3V3`, `VOUT`, `VSYS`, `VREF`, но удешевлял `VREG_LX`.
Теперь действует существующий Rust классификатор. На board обычная питающая сеть
по-прежнему имеет native stage weight `.1`, в block/post-place — `.25`.
Разница между этапами сохранена; это не две реализации одной формулы.
Schematic ground-классификатор распознавал любое `gnd`, `GROUND` и `PGMD`;
Rust распознаёт `GND`, префикс `GND_`/`GND-`, суффикс `_GND`/`-GND` после trim.
Это различие теперь устранено в перечисленных PCB энкодерах в пользу Rust.

## TS-only критерии, перенесённые без настройки

- Обычный authored island: `2·area + w+h + overlap·1e6 + 8·pairDistance +
  5·netSpread + 6·capAlignment`. Его старый специальный GND spread weight `.2`
  перенесён в Rust этого этапа; это отдельный authored-island objective.
- Core pairs: overlap `1e6`; `10000·Σ(d+100·excess²)`; foreign pad hits `180·100`;
  balance `25`; pair crossings `600`; facing `15`; area `.4`; `Σd+max(d)`;
  pin-1 preference `5`. Для pad-box пересечения используется уже существующая
  геометрическая функция Rust, а не новая TS/Rust копия.
- Pin-1: `max(nx+.25,0)² + max(ny+.25,0)² + .15·max(nx−ny,0)`.
- Bypass: сумма поперечных абсолютных offsets, с множителем `.2`, если пины по
  разные стороны; row power — signed power/return offsets минус axis mismatch;
  pad axis — разница абсолютных проекций; target pad — средняя поперечная проекция.
- Initial IC rotation: `Σ(1−dot(normalized source,target))·weight`.
- Block comparable: electrical `≤best·1.12+20`, wire `≤best·1.15+1`, каждая связь
  `≤best+max(1.5,.35·best)`. Dominance и near-layout численные пороги также перенесены.
- Board electrical guard: score growth `≤min(40,.001·|before|)`, total length growth
  `≤max(.5,.005·before)`, individual length growth `≤max(.5,.25·before)`.
- Structural similarity: `.55·weightedDice(nodes)+.30·Dice(edges)+.15·shape`;
  IC node weight `4`, inductor `3`, остальные `1`, shape gate `.5`.
- Density policy: `freedom=clamp((.60−density)/.35,0,1)`, gap `3·freedom`,
  compactnessScale `1−.9·freedom`. Alignment weight `1/pairCount`, tolerance `.15`.

## Границы и проверка

TS сохраняет DSL compilation (в том числе authored priority/relations), геометрию
входа, генерацию прежних кандидатов, сортировку native результатов, физический
допуск и отчёты. `auto-place.ts::diagnosticScore` — только отображение результата,
не score поиска/отбора. Native passive-island, micro-router, signal-path и
post-place/refiner уже были native; второй solver для них не добавлен.

Двоичный addon требует `placementScoreContractVersion() === 1`; старый addon
даёт явную ошибку сборки, а не переключение на TypeScript scorer.

Исторические измерения предыдущего согласования сохранены в
`../minimal-score-alignment/README.md`; они не являются результатом этой миграции.

### Результаты проверок

- `npm run typecheck`, `npm run build`, `npm run native:build` — успешно.
- Rust: 99 passed, 5 ignored.
- Целевые TS проверки миграции: 45/45. В том числе проверяется равенство
  evaluator и solver rank для блока и платы, восстановленная компактность,
  питание, IC-pin stretch и перенесённые TS-only коэффициенты.
- Полный `npm test`: 437 tests, 401 passed, 28 skipped, 8 failed. Все восемь
  падений воспроизведены на исходном коде и сохранённом baseline addon; см. ниже.
- `git diff --check` — без ошибок.
- SHA256 собранного addon:
  `6c42e74ff5d55027fa82d530586489351b13cc3d58d9fe000a0e7ede01d0c212`.

CAN replay выполнен один раз на CPU и один раз на CubeCL/CUDA (RTX 3060 Laptop),
с `PCB_BLOCK_GPU_VERIFY=1` для GPU. Входной capture:
`2026-10-03T09-21-51-681Z/native/block/process-14216-thread-0/00052-can-af9fe0a5b3`;
SHA256 входа `af9fe0a5b3f76c0cbff81e618df07c41d07f0f159de4e8365fc1b8048e9d8e32`.
Полные solution JSON совпадают, включая states, три checkpoints и rank
`{hardCount:0, hardSeverity:0, score:989.8759155273438}`. GPU проверка не выявила
расхождений; CPU 547.53 ms, холодный GPU 4978.00 ms (включает подготовку kernels).
Это проверка паритета одного capture, не утверждение об ускорении.

Replay артефакты в `debugging/pcb-layout/replays/block/`:
`2026-10-03T13-34-34-956Z-can` (GPU), `2026-10-03T13-38-27-653Z-can` (CPU).
Логи сборки/тестов: `debugging/rust-score-authority-{build,cargo,ts-build,focused,tests-final,can-gpu,can-cpu}.log`.

### Полный STM: наблюдаемый результат, без настройки качества

Новый capture: `debugging/pcb-layout/runs/STM32G0_CAN_RS485/2026-10-03T13-32-38-705Z`.
68 компонентов размещены; `report.ok=true`, физических overlaps 0, outsideBoard 0.
Остаются 15 hint violations, из них два с priority critical, но `hard:false`;
нарушений hints с `hard:true` нет. Это не означает исполнения всех мягких пожеланий.
Время одного запуска 59.17 s, 69 native requests. Автороутинг не запускался.

Сравнение одного и того же placement input (SHA256 сериализованного объекта
`53cf2886c0a8f77e2c2380ba901d1c526651ce787494ff2f93137fbc8b544eb9`):
«исходный» — `09-21-51-681Z`, «предыдущее согласование» — `12-19-31-143Z`,
«текущий» — `13-32-38-705Z`, все 2026-10-03. Ниже расстояния между центрами падов
финального размещения, мм. Scores разных версий напрямую не сравниваются.

| Связь / параметр | Исходный | Предыдущее согласование | Текущий |
|---|---:|---:|---:|
| R13.2–U4.1, CAN_TX | 7.480 | 3.242 | 1.936 |
| X1.3–R8.1 | 1.933 | 2.040 | 2.694 |
| R8.2–U3.8 | 2.759 | 4.025 | 2.759 |
| X1.3–U3.8, прямое расстояние | 6.150 | 7.439 | 6.538 |
| U1.3–R1.2, feedback | 3.467 | 3.790 | 2.979 |
| U1.3–R2.1, feedback | 2.335 | 2.261 | 1.812 |
| U4.7–J4.1, CANH | 7.029 | 10.054 | 7.890 |
| U4.6–J4.2, CANL | 6.741 | 8.282 | 7.382 |
| Ориентация U4 | 270° | 180° | 270° |
| C10, +3V3 pin → ближайший +3V3 pin U3 | 7.559 | 6.763 | 4.223 |
| C11, аналогично | 5.619 | 4.692 | 9.276 |
| C12, аналогично | 5.303 | 8.498 | 5.612 |
| C13, аналогично | 5.227 | 10.245 | 7.860 |
| C14, аналогично | 4.461 | 2.663 | 5.659 |

Качество смешанное: R13, feedback U1 и CAN улучшились относительно предыдущего
согласования, но часть обвязки MCU хуже, а сегмент X1–R8 удлинился. Устранение
двух источников оценки само по себе не гарантирует хорошую раскладку.
В текущем capture Board Package → final меняются, например, C11: 7.941→9.276 mm
и C13: 4.223→7.860 mm; это показывает, что для дальнейшего разбора нужно смотреть
также этапы после упаковки. Коэффициенты ради улучшения этих чисел не менялись.
D3 отдельно не исследовался и не исправлялся.

Воспроизводимые измерения: `debugging/rust-score-authority-metrics.mjs`, результат
`debugging/rust-score-authority-comparison.json` (включает Board Package и final).

### Разбор тестовых падений

Исходный коммит `287bbf46c51003e85d27beb982d70425d919b10e` распакован для
проверки в игнорируемый `debugging/rust-score-authority-baseline/`, использован
сохранённый `debugging/minimal-score-alignment/baseline.node`.
Повторились восемь прежних падений: три island/module tests (те же area
`37.505001` и switch-pair distance `3.8009999`), один RF-path (`report.ok=false`),
один empty/locked GPU initialization и три USB tests. Их ожидания не изменены.
Логи: `debugging/rust-score-authority-baseline-{island,rf,empty-gpu,usb,usb-combined}.log`.
Первый baseline USB combined запуск не имел archived scripts; после добавления
исходных scripts повторён и подтвердил старое нарушение `pairMax < 6`.

Тест `ignored ordinary nets produce no extra candidates` прежде одновременно
менял `netCandidates` и `ignoredNets`. Последний влияет не только на генератор,
но и на native geometric route correction; прежнее совпадение было случайным.
Контроль исправлен на одинаковый `ignoredNets` в обеих ветках. При единственном
изменении `netCandidates` решения полностью совпадают, production code не менялся.

Тест сторон display переведён с объектов, приведённых через `as` без bbox/pins/
solverOptions, на полноценные объекты контракта; исходная проверка отсутствия
ложного bottom-side spacing penalty сохранена. Native spacing вызывается отдельно,
без электрического графа и полной оценки платы.

## Эксперимент 2026-10-04

По последующему указанию пользователя начата унификация именно семантики relations
между native этапами с согласованной новой кривой. Это отдельное разрешённое
изменение поведения, а не продолжение прежнего переноса без настройки весов.
[Реализация, заменённые формулы, проверки и незакрытые расхождения](../unified-relations/README.md).
Общая формула расстояния теперь находится в `relation_score.rs`; не возвращать
её копии в TS или отдельные CPU/GPU формулы. Остальные stage objectives пока
сохраняются; полное согласование всех relations ещё не завершено.
