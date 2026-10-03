# Согласование поиска блока и checkpoint quality

2026-10-03. Исходное состояние сохранено коммитом `c17fc73`.
Задача — согласовать оценку существующего поиска, без дополнительного поиска
переносов и без изменений DSL STM32G0_CAN_RS485.

## Что меняется

Production `blockPolicy()` включает `alignedScore`. Старые сохранённые native
inputs без этого поля сохраняют прежний scorer; контракт v4 дополнен optional
полями одновременно в TypeScript и Rust.

- Площадь: `0.35 * area + 0.5 * (width + height)`, как в `blockQuality`.
- Обычные связи: те же MST длины, пересечения линий, растяжение MST-рёбер и
  доступ каждого пассивного пина к ближайшему связанному пину каждого IC.
  Питание весит 0.25, сигнал/SW — 1; aliases определяет общий TS classifier.
- Пересечения линий/падов, экспозиция внешних nets и authored signal paths
  используют шкалу checkpoint. CPU/GPU сохраняют full candidate scoring,
  resident geometry, fixed-segment cache, shortlist и conservative pruning.
- Authored pin/component/block distance, clearance, same-side и layer preference
  передаются отдельно от proposal heuristics. `clearance(..., all)` раскрывается
  только в score-only terms, которые не создают relation-anchored candidates.
- Для distance: `w*d + 20*w*excess² + 20*w*shortage²`. `hard:false` не меняет `w`.
  Явная пара U1.2–D3.2 остаётся с `w=432`, `max=4`, несмотря на ignored GND.
- Role/hull/aspect/facing/power-yield суррогаты больше не конкурируют с этой
  оценкой. Proposal ordering, generators, beam/singles/pairs, budgets и postrefine
  сохраняются. Bounds/target-size и hard constraints по-прежнему действуют.
- В component collision mode декоративные рамки не получают штраф за физическую
  коллизию. Физическая незаконность ранжируется через прежний hardCount; soft
  barrier фиксирован, без дополнительной цены глубины, отсутствующей в checkpoint.
- GPU восстанавливает body/through-hole/score boxes от исходного центра каждого
  компонента и конечной округлённой component pose, как CPU. Перенос уже
  округлённого template давал остаток 0.001 мм и расхождение hardCount у buck.

Scorers согласованы по термам и весам, а не обещают побитовое равенство всех
сумм: connection points прежнего native транспорта округлены до 0.001 мм,
checkpoint восстанавливает пины из footprint. F32 contract сохраняется.
Частичная beam-оценка доступных endpoints не равна оценке завершённого блока.

## Входы и проверки

Сохранённые тела, pads, netlist и исходные локальные poses из исследованного
запуска. DSL проекта не менялся. Постоянные fixtures:

- `tests/fixtures/block-placement/STM32G0_CAN_RS485/can-score.json`:
  SHA-256 `a706e816949a2bca503d3b2319f6ebfa2a961aaac21871c16cef415fdc4a1613`.
- `tests/fixtures/block-placement/STM32G0_CAN_RS485/buck-score.json`:
  SHA-256 `a8203f59eebf892287cbe5da24d6b37d88949286022037602abc9d0df33a42eb`.

CAN regression проверяет легальный вариант R13 со связью TX <3 мм и ростом
площади <5%, совпадение шкалы frozen scores, явную soft GND-пару, aliases питания,
pin/component/all clearances и layer preferences. Реальный buck fixture
проверяет пару D3–GND и clearance buck_feedback–L1.
Опциональные live GPU tests запускают настоящий unlocked search с
`PCB_BLOCK_GPU_VERIFY=1` и `PCB_BLOCK_GPU_VERIFY_PRUNE=1`, проверяя кандидаты,
hardCount, численную оценку, shortlist с pruning/без pruning и отсутствие fallback.
Отдельный GPU case покрывает pin/all clearance и layer terms. Все 7 новых
проверок прошли на финальной сборке (6 вместе, добавленный GPU case отдельно).

Команды:

```powershell
npm run typecheck
npm run build
cargo test --manifest-path native/pcb-board-packer/Cargo.toml
npm run native:build
$env:PCB_BLOCK_GPU_TEST='1'
node --import tsx --test tests/pcb-block-score-alignment.test.ts
```

Дополнительно: focused block quality, search stages, postrefiner, portfolio,
relaxed groups и post-place tests: 42 passed, 6 skipped. Rust: 99 passed,
5 ignored. Четыре failures `pcb-block-experiments.test.ts` (USB snapshot,
ignored nets, hard legality, pairMax) воспроизведены на исходном `c17fc73`,
собранном отдельно с `--no-default-features`; baseline addon SHA-256
`895507e693129b6f309957edc2e89f483655c99605eb9c031d470075a6f5d5cc`.
Fixture expectations не переписывались; USB долг остаётся открытым.

Финальный Windows x64 addon (CUDA/Vulkan, F32): SHA-256
`9727772612a7c3183781a164ac379858f917e4831f9715c0676c03424932a25b`,
23,863,808 bytes. Устройство проверки — NVIDIA GeForce RTX 3060 Laptop GPU;
actual backend CUDA. Baseline replay addon SHA-256
`cefba68ae952144645a42c22b0e741c21d296397767706abfd843eb60e45ec39`.

## Локальные native replays

Один CPU проход на финальную CPU-версию, grid 0.5, width 4, один native thread.
Исходные child primitives одинаковы. Это повторная сборка локальной семьи,
а не запуск всей платы и не воспроизведение полного checkpoint portfolio.

| Метрика | Исходный saved layout | Старый native CPU replay | Aligned CPU replay |
|---|---:|---:|---:|
| CAN TX, мм | 7.480 | 7.480 | 1.915 |
| CAN VIO, мм | 2.475 | 2.475 | 6.073 |
| CAN area, мм² | 75.060 | 75.060 | 76.893 |
| CAN checkpoint score | 1311.18 | 1311.18 | 529.73 |
| Buck D3–SW, мм | 5.482 | 9.737 | 5.090 |
| Buck area, мм² | 267.881 | 254.317 | 318.704 |
| Buck checkpoint score | 191958.09 | 740158.25 | 97665.49 |
| CAN native time, ms | — | 841.9 | 973.5 |
| Buck native time, ms | — | 8475.9 | 14226.0 |

Оба aligned CPU результата физически легальны, hardCount=0. CAN вырос на 2.44%
к исходному layout. Buck вырос на 18.97%; уменьшилась полная электрическая
оценка, а D3–SW приблизился лишь немного. Это не обещание малого роста площади
для каждого блока и не исправление заданных competing SW/GND/feedback требований.
Native CPU replays стали медленнее; speedup здесь не заявляется.

GPU buck replay на финальном addon прошёл beam/singles/pairs без fallback и
с теми же poses, что CPU; hardCount=0, native score=97687.8203125 у обоих.
Проверены 2,945,832 GPU candidates, включая повторную оценку без pruning.
С включёнными CPU verification и prune verification время 87.741 s включает
диагностику и холодную компиляцию, поэтому не сравнивается с production CPU
таймингом. CAN live GPU regression также прошла с TX <3 мм.

Наблюдаемый native/checkpoint остаток у выбранных layouts: CAN 0.0028,
buck 22.3281 (0.023% checkpoint score). Малая погрешность координат заметно
усиливается квадратичным clearance; абсолютное равенство не заявляется.
SHA-256 сериализованных native inputs до/после:

| Input | Before | Aligned |
|---|---|---|
| CAN | `8f4435cb88524055ffbb4fae7b823cd7472e94f96aa8a7c0cf6984b4efb15daf` | `35d3d31beef55784a65158ddff11e09f008404e45f4daf0dc251076237a989c3` |
| Buck | `794c86302c4a43680f2fafe015fd23e9267a25ad9348dfb6878e715a96abc143` | `425795fca3b2daa056df1f993b0949d0eb207c44975d257f0b58fa5f92a97075` |

## Полная плата

Повторный offline pipeline на сохранённом полном PlacementInput, 68 компонентов,
60×40 мм: `report.ok=true`, 0 overlaps/outsideBoard/hole/region/layer violations.
Block backend CPU, один thread, subtree workers выключены, board/post-place
backend auto (в этом прогоне CubeCL CUDA). Время 108.073 s — отдельное измерение
без сопоставимого полного baseline для вывода о скорости.
Полный PlacementInput SHA-256:
`5a3b569be392d53e5d1b65443c916f9fe03f8543850eda7941501f83d25f0de2`.

- CAN checkpoint: score 529.73, area 76.89 мм². После общей post-placement
  доводки R13–TX 2.991 мм, R13–VIO 6.875 мм.
- Buck checkpoint portfolio выбрал grouped/pairs: score 116294.56,
  area 331.18 мм². На финальной плате D3–SW 5.103 мм, D3–GND 3.778 мм.
- Остались 17 soft hint violations. Пара D3–SW всё ещё выходит за soft max 4 мм;
  её нельзя объявлять исправленной только из-за улучшения общей оценки.

Полный pipeline проверен на CPU-equivalent intermediate addon SHA-256
`88d8ebe0b780e5ea2a9336ca641e06d25c4512ca365767eddc611386258d225e`:
последующие изменения касаются только GPU materialization/score endpoints.
Первый полный прогон с устаревшим `dist/tree-subtree.worker.js` исключён из
доказательств новой оценки; worker bundle пересобран, проверочный прогон выполнен
без subtree workers. Повторы GPU обусловлены выявленными numerical failures,
а не серией прогревов. Локальные inputs/results/logs/SVG: ignored
`debugging/can-buck-analysis/`.
