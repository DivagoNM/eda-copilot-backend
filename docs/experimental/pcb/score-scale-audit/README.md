# Аудит масштаба PCB-штрафов — 2026-10-04

Только измерения и документация. Формулы, веса, поиск, DSL и native addon не изменены. Данные контекста: сохранённый ESPower 2026-10-03T20-57-52-035Z; текущие незакоммиченные изменения пользователя в tests/pcb-layout/ESpower/ESpower.js не использованы и не затронуты.

## Что подтверждено

1. Единый язык Rust не означает единую функцию потерь. Block/Family, Board и PostPlace используют разные формулы и разные контексты.
2. **near critical меняет смысл между этапами:** во входе Board R21→U8 нет maxDistance, а expandHints для PostPlace добавляет min=0.8, max=8 и weight=240. Это не просто отличие коэффициента. При 20 мм прямой штраф Board ≈2057, PostPlace 696000.
3. **critical_pair быстро упирается в потолок в Block/Board.** RF max9 после превышения примерно на 0.56 мм достигает ограничения в Board. Прибавление следующего микрометра стоит сначала сотни единиц, затем около 0.46. В PostPlace потолка нет.
4. **normal/high/critical усиливаются дважды в Block/Board:** priority участвует непосредственно и уже закодирована в relation.weight. Для near normal→critical итоговый множитель ≈12.86, а не просто 240/70≈3.43. Это факт формулы, не автоматически ошибка.
5. **Отдельный GND spread в крупных блоках имеет выключатель:** если точек больше 3 или разброс больше 4 мм, весь этот член пропускается. Это настоящий нисходящий скачок; не путать с автоматически добавленными small-block hints.
6. Разные нули имеют разные причины: отсутствующий endpoint; одна rigid primitive; отключённая метрика; исключённый GND; насыщение только одного члена. Нельзя лечить их одинаковым увеличением веса.

## 1. Карта этапов

| Член | Block и Family | Board Package | PostPlace |
| --- | --- | --- | --- |
| Явная связь | k·d + capped limit + side | k·d + capped limit (+ satellite side) | W·d + 20W·excess²; без cap |
| Цена near critical без max | 113.143/мм | 102.857/мм | 240/мм + автоматически max8 |
| Цена critical_pair W432 до max | 407.314/мм | 462.857/мм | 432/мм |
| Пассивный pad→IC | 6d + 32·max(d−3,0)², вес сети | Нет такого члена непосредственно | Та же общая Rust-функция; local scopes |
| Обычная сеть | HPWL spread + long-net + local stretch | Слабое межблочное притяжение ordinary_net | MST: w·(10d+0.35d²) на сегмент |
| Попадание линии в чужой pad | 180·w, если padCrossings | В base score отдельного такого члена нет; Micro-A* на кандидатах | 180·w плюс маршрутная поправка при отборе |
| Пересечение обычных MST-линий | Не следует приравнивать к PostPlace: отдельного crossing_penalty здесь нет | В base score нет общего MST-crossing члена | 180·sqrt(w1·w2) |
| Signal Path topology | Общая topology ×4 normal / ×2.5 high | Общая topology ×5 normal / ×3 high | Общая topology ×20, но metadata weight=1 |
| Компактность | Площадь bbox + hull + размеры + aspect + target size | Площадь bbox + размеры, softSpacing scale | Прямого члена площади нет |
| Механическая допустимость | Hard rank/проверки плюс крупные штрафы | Hard rank count/severity плюс severity×1e6 | Проверка допустимости кандидата отдельно от электрического score |
| Контекст | Grouped и released меняют состав primitives и доступные endpoints | Сначала частичная плата, затем целая; движение rigid blocks | Компоненты целой платы, ограниченные local scopes |

Family использует block_solver, а не отдельную шкалу. Но при увеличении числа компонентов меняются коэффициенты small/large, доступность связей и геометрия. Совпадение функции не гарантирует одинаковый обмен на всех этапах. Board rank из quality не включает маршрутную поправку shortlist. Поэтому нельзя сравнивать записанный base score с effective PostPlace improvement как одну величину.

## 2. Точные формулы расстояния

Обозначения: d — расстояние, M — maxDistance, m — minDistance, e=max(d−M,0), t=max(m−d,0), W — закодированный вес relation.

Block/Board: k = P × K × E × max(W/70,0.25).

- P: low=3, normal=8, high=16, critical=30.
- E: move_from=1, move_both=1.2, прочее=0.4. lock/skip обрабатываются отдельно.
- Block K: critical_pair=2.2; very_near=1.7; near=1.1; прочее=1.
- Board K: critical_pair=2.5; anchor=1.7; edge=1.4; island_target=1.6; прочее=1. **near и very_near здесь оба 1.**
- L = min(250000, h·k·(1500e²+120e+800t²+80t)), где h=5 для hard, иначе 1.
- Прямой член = k·d + L. Если нет max/min, соответствующее слагаемое отсутствует.
- compactness high дополнительно умножает весь relation subtotal на 0.45 в Block и 0.35 в Board. Потолок применяется до этого множителя.

PostPlace: W·d + 20W·e² + 20W·t². Вес берётся из expandHints, без повторного P/K/E. В численной функции distance нет hard×5 и cap. Hard влияет на отдельные проверки refiner; отсутствие множителя в score не означает отсутствие проверки.

### Near critical: один пользовательский смысл, разные правила

Нативные измерения ниже изолируют вклад relation; прочие геометрические слагаемые вычтены на той же тестовой геометрии. Block/Board без max; PostPlace соответствует реальному expandHints с max8/min0.8. Это численный зонд, не кандидат физической платы.

| d, мм | Block | Board | PostPlace |
| --- | --- | --- | --- |
| 1 | 113,143 | 102,857 | 240 |
| 3 | 339,429 | 308,571 | 720 |
| 5 | 565,714 | 514,286 | 1 200 |
| 8 | 905,143 | 822,857 | 1 920 |
| 10 | 1 131,429 | 1 028,572 | 21 600 |
| 12 | 1 357,714 | 1 234,286 | 79 680 |
| 20 | 2 262,857 | 2 057,143 | 696 000 |

### RF critical_pair: W432, soft max9, normal compactness

| d, мм | Block | Board | PostPlace |
| --- | --- | --- | --- |
| 8,999 | 3 665,421 | 4 165,251 | 3 887,568 |
| 9 | 3 665,829 | 4 165,714 | 3 888 |
| 9,001 | 3 715,745 | 4 222,438 | 3 888,44 |
| 9,1 | 14 704,113 | 16 709,217 | 4 017,601 |
| 9,5 | 181 051,203 | 205 740 | 6 264 |
| 9,6 | 253 186,881 | 254 443,422 | 7 257,604 |
| 10 | 254 073,141 | 254 628,578 | 12 960 |
| 12 | 254 887,766 | 255 554,281 | 82 944 |
| 20 | 258 146,281 | 259 257,141 | 1 054 080 |

### Цена ещё одного микрометра: score(d+0.001) − score(d)

| Начальное d, мм | Block | Board | PostPlace |
| --- | --- | --- | --- |
| 9 | 49,916 | 56,723 | 0,44 |
| 9,1 | 171,995 | 195,451 | 2,167 |
| 9,5 | 661,152 | 751,313 | 9,076 |
| 9,6 | 723,746 | 0,469 | 10,803 |
| 10 | 0,402 | 0,453 | 17,711 |

Это реальные вызовы native F32, поэтому последняя цифра может отражать округление. Подтверждения «200 тысяч за микрометр» нет. Подтверждено: около 751 единицы за микрометр при d=9.5 и около 0.47 при d=9.6 в Board. На d=M значение непрерывно, но наклон скачком меняется с k на k+120hk. На cap наклон резко падает обратно к k. Например RF Board сразу после max имеет правый наклон ≈56006 единиц/мм против ≈463 до max. Порог cap для RF Board ≈M+0.5614 мм; для hard-аналога ≈M+0.2313 мм. Это аналитические пороги, не измерения шагов поиска.

## 3. Компактность и препятствия: сколько это стоит

| Составляющая | normal | high | Оговорка |
| --- | --- | --- | --- |
| Block bbox area | 3.2 / мм² | 4.2 / мм² | Дополнительно hull |
| Block hull area при reducedHull | 2.5 / мм² | 3.6 / мм² | Без reducedHull: 10 / 14.4 |
| Block (width+height) | 2.5 / мм | 5.4 / мм | Это полупериметр bbox |
| Block hull perimeter | 1.5 / мм | 12 / мм | Полный hull perimeter |
| Board bbox area | 0.8×scale / мм² | 1.2×scale / мм² | scale из softSpacing |
| Board (width+height) | 1.5×scale / мм | 8×scale / мм | Дополнительно spacing/alignment |
| Один signal-pad hit | 180 | 180 | Block/PostPlace; GND исключён из соответствующего набора сетей |
| Один power-pad hit | 45 | 45 | При весе питания 0.25 |
| Один signal-signal crossing PostPlace | 180 | 180 | Строгое пересечение разных MST-сетей |
| Один signal-power crossing PostPlace | 90 | 90 | sqrt(1×0.25)×180 |
| Один power-power crossing PostPlace | 45 | 45 | sqrt(0.25×0.25)×180 |

Таким образом, 1 мкм дополнительного превышения RF около 9.5 мм в Board стоит больше четырёх signal-pad hits по шкале Block/PostPlace. Это **сравнение масштаба разных этапов**, а не утверждение, что Board суммирует эти hits. У Board их прямого члена нет.

PostPlace local stretch при w=1: d=2→12; 3→18; 4→56; 5→158; 8→848; 10→1628. При питании w=0.25 всё вчетверо меньше. Формула общая для Block и PostPlace, но число пар, роли IC и scopes надо проверять отдельно.

## 4. GND и питание

- Native net weights: локальный сигнал 1, питание 0.25; Board ordinary-net сигнал 1, питание 0.1. Сам классификатор возвращает GND=1, но дальнейшие потребители исключают GND или ведут отдельный член. **Выводить активную силу GND только из этого числа нельзя.**
- Block spread: HPWL=maxX−minX+maxY−minY. Для блока из 1–4 компонентов signal multiplier18, ground2.5; для 5+ — signal4, ground0.15. Дополнительно net weight; high compactness ×0.65.
- В крупном блоке ground spread считается только при числе точек ≤3 и HPWL≤4 мм. При HPWL 3.999/4.000/4.001 стоимость для w1 равна 0.59985/0.6/**0**. При четвёртом паде этот член тоже исчезает. Это исходная формула, не результат native sweep.
- Small-block inferred GND: отдельная near normal weight70/max8. Создаётся для блоков из 2–4 компонентов, каждый ≤6 пинов, с дополнительной проверкой localReach≤6. Это не тот же член, что ground spread. Он может работать одновременно с ним.
- Block same-net attraction, explicit hint, long-net, passive→IC и pad hits могут одновременно зависеть от одной сети. Это перекрывающиеся цели, но не доказательство ошибочного двойного счёта: отключать их без измерений нельзя.

## 5. Signal Path и Micro-A*

Topology использует detour, backtrack, turns, facing:

T = (detour×[22 straight / 8 flexible] + backtrack×42 + turns×[18 straight / 5 flexible] + facing×12) × priority × metadataWeight.

Priority: low0.65, normal1, high1.35, critical1.8. Block/Board metadataWeight=max(W/70,0.25), PostPlace encoder передаёт 1. Для W432 внешние множители дают Block4×6.171≈24.686; Board5×6.171≈30.857; PostPlace20×1=20 — **не просто разницу 4/5/20**. Topology требует ≥3 разрешённых портов; при меньшем числе этот член 0. Обычные board-сети добавляются через ordinary_net в общий topology subtotal: это отдельная слабая метрика с cap расстояния30мм, affinity cap4 и fanout≤8.

Micro-A* — поправка за маршрут сверх baseline, а не вся длина повторно. Цена найденного обхода: max(routeCost−baseline,0)×jobWeight×routeScale. routeScale=1. Для explicit job jobWeight=priorityWeight×clamp(W/70,0.25,4); critical priorityWeight=4, high2.5, normal1.5, low1 (внутренняя шкала приоритетов роутера 4/3/2/1). Для W432 critical jobWeight=16. Via cost critical45, high30, ordinary10, power20 мм-эквивалента. Не найденный маршрут: max(knownDetour,2×viaCost)+30, затем вес. При critical W432 это 120×16=1920 для knownDetour=0. Это несопоставимо с предельным distance penalty250000.

Board ограничивает ordinary jobs16, total32; block ordinary8; PostPlace ordinary16. Поэтому маршрутный контекст и покрытие не полные. Base Board quality не содержит эти поправки: они применяются при rerank/локальном отборе. Последующие этапы не наследуют накопленный численный score предыдущих: они заново оценивают геометрию.

## 6. Механика и пограничные эффекты

Механические запреты нельзя смешивать с мягкими электрическими предпочтениями. Block component overlap: 10000000+100000×depth; envelope/hybrid overlap: 250000+25000×depth. Выход bbox блока за bounds: 10000000+500000×overflow. Это намеренные скачки за нарушение допустимости; есть и отдельные hard checks/rank.

Board сначала ранжирует hardCount/hardSeverity, затем score; severity также входит с множителем1e6. PostPlace проверяет кандидата отдельно. Маленькое геометрическое нарушение способно доминировать над электрическим улучшением — нужно смотреть hard rank, а не только общую сумму.

Изменение состава MST, строгого факта pad/line hit и наличия endpoint дискретно. Гладкая distance-функция не устранит такие скачки. При объединении двух участников в одну rigid primitive scoped relation перестаёт участвовать в межпримитивной оценке; при разборке снова появляется. Это изменение контекста, не пропавший коэффициент.

## 7. Что уже проверено на плате

Из предыдущего точного native replay: MCU сверху вместо снизу, те же внутренние блоки, без дополнительных hard violations. R21 19.49→4.95мм, RF17.54→7.40мм; USB5.68/6.90→9.63/9.90мм. Изолированная marginal ablation relations на замороженной геометрии: RF улучшение≈258675; две USB ухудшение≈502210; R21 улучшение≈1497. Эти marginal значения включают изменения topology metadata и не равны только прямым формулам раздела2. См. ../espower-regression-audit/README.md.

## 8. Порядок решений, ещё не реализация

1. Сначала согласовать **семантику** near/very_near/max/hard между этапами: сейчас R21 фактически имеет разные требования.
2. Затем согласовать размерности и усиление priority, включая compactness high. Не переносить все числа одного этапа на другой автоматически.
3. Обсудить крутой участок и cap distance; отдельно GND spread cutoff. Не называть разницу в механических и электрических штрафах дефектом сама по себе.
4. Определить допустимые обмены длина↔pad hits↔площадь на конкретных сохранённых вариантах; после этого предложить новые коэффициенты и только затем запускать сравнения.
5. Раздельно исправлять неполный контекст поиска: отсутствующую антенну нельзя компенсировать большим весом, пока endpoint не участвует.

## Воспроизведение и границы достоверности

Запуск из корня backend: node --import tsx docs/experimental/pcb/score-scale-audit/probe.mjs. Числа native-samples.json получены существующими evaluateBlockQuality/evaluateBoardQuality/scorePostPlace; это не новая TS-функция оценки. Изолированный вклад считается вычитанием базовой оценки на той же численной геометрии. Пустые размеры и отсутствие механических компонентов намеренны: зонд проверяет формулу relation, не допустимость размещения. Не использовать его как placement fixture.

Проверены текущие CPU quality exports addon и сохранённые реальные hints. Поиск, GPU parity, полная плата и трассировка в этом аудите не запускались. Из совпадения отдельных общих функций не делаем вывода о полной CPU/GPU идентичности. Источники для конфигурационных/пограничных таблиц прочитаны непосредственно; полная автоматическая декомпозиция всех вспомогательных terms (power yield, dense access, edge, alignment, target size) не экспортируется и здесь не заявлена. Они перечислены в карте, но их суммарный вклад зависит от геометрии. Таблицы не доказывают глобальную оптимальность выбранных вариантов.

## Источники

- native/pcb-board-packer/src/block_solver.rs: score_block_terms, scoped_relation_penalty, relation_weight, relation_distance_limit_penalty, spread_penalty, direct_pad_crossing_penalty.
- native/pcb-board-packer/src/solver.rs: board_score, relation_weight, distance_limit_penalty, relation_penalty, local_improve.
- native/pcb-board-packer/src/post_place.rs: score, crossing_penalty, pad_hits.
- native/pcb-board-packer/src/local_stretch.rs: penalty (общая CPU/CubeCL функция).
- native/pcb-board-packer/src/signal_path.rs и ordinary_net.rs: topology и обычные межблочные сети.
- native/pcb-board-packer/src/micro_router.rs: two_layer, route_jobs_penalty, priority_weight, unresolved_detour.
- src/pcb-layout/pcb-auto-place/hints.ts: expandHints и semanticDistance.
- src/pcb-layout/pcb-auto-place/placement-graph.ts: addSmallBlockGroundHints.
- src/pcb-layout/pcb-auto-place-v2/native/encode-post-place-score.ts: кодирование path weight1 и hints.

## Дополнение: геометрическая поправка Block/Family

В сохранённом crystal включён routingMetric=geometric. Кроме основного pad hit 180·w при отборе кандидатов вызывается fast_route: выбирается лучший из ограниченного набора прямых/ломаных путей. Его цена: дополнительная длина +20 за чужой pad либо +2 за полосу clearance, +3 за пересечение чужого сегмента skeleton. Для внешнего выхода добавляется 0.5×(цена пути+0.25×длина). В этой поправке нет множителя питания 0.25; GND исключён. Проверяются до четырёх ближайших пар на сеть, затем выбирается лучший путь. Это ещё одна шкала и ещё одно покрытие препятствий. Следовательно, pad obstacle может влиять и через прямой MST hit в base score, и через отдельную геометрическую поправку. Quality export не включает эту поправку отбора — так же нельзя путать base Block score с полным критерием поиска.

Дополнительные пороги компактности: targetWidth/targetHeight в Block добавляют по каждой превышенной размерности 20000e²+2000e (high ×1.2); aspect при отношении сторон >5 добавляет 220×max(minSide,1)×(ratio−5)²; smoothAspect добавляет 12×minSide×max(ratio−2,0)². Если target size задан, его превышение на 0.1мм стоит400, на1мм22000: это принципиально сильнее обычной цены площади. Наличие этих полей в конкретном capture необходимо проверять отдельно.
