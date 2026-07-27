# DRIFT.md — конфиг drift-режима для mailserver (mail-control-plane)

**Механика: юзер-скилл `drift` v1** (`~/.claude/skills/drift`). Drift ничего
не меняет в коде — только issues с меткой `drift`.

## Конфиг

- **Трекер:** `friench/mailctl` (remote `mailctl`; `origin` — публичное
  зеркало, issues туда НЕ создавать). Доски нет — пока только метки;
  появится — вписать номер и колонку «Drift».
- **FOCUS:** `mailserver-api/src/` — auth/session/API-key поверхность и
  docker-exec пути (это security-чувствительные зоны: находки → метка
  `security`), санитизация в `lib/*-parsers.ts`, дыры в тестах воркеров
  (send/webhook/sync/migration), `mcp/` — дрейф инструментов от REST;
  расхождения `_docs/*.md` с кодом. Известный контекст — открытые issues
  #67–#81: дубли не плодить.
- **FROZEN:** `.env*`, `data/` (боевая `data.db`), всё про DNS/DKIM/сертификаты
  и Dokploy-деплой (находки об этом — только `needs-owner`, без операций).
- **Лимиты:** `MAX_ISSUES=5` за тик · `SECURITY_EVERY=7д` · тик ≤ 45 мин.

## Предпосылки запуска

- [ ] `.claude/drift/` добавлен в `.gitignore` (сейчас `.temp/`/`.claude/`
      статус проверить).
- [ ] Метка `drift` создана в `friench/mailctl`.
