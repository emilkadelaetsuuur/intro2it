# Flame in Freefall — пакет данных NASA PSI (горение)

Источник: NASA Physical Sciences Informatics, https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation
Снято 14 ноября 2026. Лицензия данных PSI — CC0-1.0 (у PSI-10 лицензия в записи не указана).

## Что внутри

- `investigations.csv` — 26 исследований из выдачи по запросу combustion: акроним, платформа, даты, DOI, число публикаций и файлов, объём сырых данных, какие таблицы лежат в пакете.
- `investigations_text.json` — тексты для каждого исследования: цель, гипотеза, подход, значение для практики, ключевые слова.
- `publications.csv` — публикации по исследованиям с авторами и DOI.
- `tables/` — 23 исходные таблицы экспериментов (CSV). У CFI-G включены обе конфигурации: 179 строк в Normal Flames и 154 в Inverse Flames. [Таблица Normal Flames, версия 1](https://psi.nasa.gov/geode-py/ws/studies/PSI-159/download?file=PSI-159_Experimental%20table_CFI-G_Normal%20Flames.csv&version=1&redirect=true). SHA-256 включённого файла: `d95a621c3fbd27d204dd32ed29fa17d68f2b779d6a523cde8479ed7ebaa5251a`.

## Что нужно знать перед использованием

- Файл Normal Flames взят из [публичной копии таблицы PSI-159 в зафиксированной версии Fotia](https://github.com/AnteurAbderraouf/Fotia/blob/8dec5cbcaf98ea120f110200bb57c073c0263404/combustion_science/microgravity_investigation/PSI-159/csv/CFI-G_Normal%20Flames.csv). Во время этой проверки сервис скачивания PSI возвращал HTTP 504. Указанный выше SHA-256 относится к локальному файлу.
- Значения в таблицах грязные: ячейки с несколькими числами (`21; 26.5; 40`), `3400%` вместо 34, текст в числовых колонках, у FLEX одна строка с давлением 0. Чистить обязательно, исходные CSV не трогать.
- PSI-181 (припои) и PSI-108 (STDCE-1, гидродинамика) попали в выдачу по слову combustion, но к горению не относятся.
- Вторые таблицы PSI-10 (Flame Design, inverse) и PSI-108 не входят в эту версию. Полный список приведён в `tables_not_downloaded`.
- В CFI-G для normal flames начальная доля O₂ относится к атмосфере камеры. Для inverse flames XO₂ относится к окислителю, подаваемому через горелку; в камере находилось газообразное топливо. Это различие описано в [отчёте NASA по ACME](https://ntrs.nasa.gov/citations/20220005205), стр. 4, 7–8.
- Исходные строки сохранены, в том числе 8 повторов в CFI и запись о чистке в BASS. При подсчёте испытаний CFI учитывается каждая уникальная запись, а BASS — только строки с номером испытания.
- Сырые данные (в основном видео) в пакет не входят: это терабайты.
- Saffire IV–VI в выдаче PSI нет.

## Как обновить

Список исследований отдаёт тот же запрос, которым пользуется сайт PSI:
`https://psi.nasa.gov/geode-py/ws/repo/search?term=combustion&source=psi&type=investigation&from=0&size=200`
Таблицы открываются на странице исследования: `https://psi.nasa.gov/physci/repo/data/investigations/PSI-25`.
