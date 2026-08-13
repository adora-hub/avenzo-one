# AVENZO ONE

ระบบแพลตฟอร์ม Multi-tenant สำหรับการจัดการองค์กร ร้านค้า สาขา สมาชิก และสิทธิ์การใช้งาน

## Current progress

- Phase 0.1 — Organization/Branch Core: completed and deployed to Supabase
- Phase 0.2 — Role/Permission Core: completed and deployed to Supabase
- Phase 0.3 — Platform Admin Control and Subscription/Expiry: completed and deployed to Supabase
- Phase 0.4 — Auth/UI Foundation: build verified
- Phase 1.3.6.1 — Design Token Foundation: implemented
- Phase 1.3.6.2 — Shared UI Theme Migration: implemented; local UI verification in progress
- Phase 1.3.6.3 — Page-specific Theme Migration and Visual QA: approved and completed; theme gates and production build passed
- Phase 1.3.6.4 — Operations UI Foundation: approved and completed; component foundation and Billing Exceptions pilot passed Decision Gate
- Supabase project: `AVENZO ONE`
- Database region: `ap-southeast-1`

## Documentation

- [Phase 0.1 — Organization/Branch Core](docs/AVENZO_ONE_Phase_0.1_Organization_Branch_Core.md)
- [Implementation Starter Plan](docs/AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md)
- [Design System and UI/UX Standards](docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md)
- [Phase 0.4 — Auth & UI Foundation](docs/AVENZO_ONE_Phase_0.4_Auth_UI_Foundation.md)
- [Phase 1.3.6.1 — Design Token Foundation](docs/AVENZO_ONE_Phase_1.3.6.1_Design_Tokens.md)
- [Phase 1.3.6.2 — Shared UI Theme Migration](docs/AVENZO_ONE_Phase_1.3.6.2_Shared_UI_Theme_Migration.md)
- [Phase 1.3.6.3 — Page-specific Theme Migration and Visual QA](docs/AVENZO_ONE_Phase_1.3.6.3_Page_Specific_Theme_Visual_QA.md)
- [Phase 1.3.6.4 — Operations UI Foundation](docs/AVENZO_ONE_Phase_1.3.6.4_Operations_UI_Foundation.md)

## Web app

```powershell
cd web
Copy-Item .env.example .env.local
npm install
npm run dev
```

## Security

ห้าม commit secrets, API keys, service-role keys หรือไฟล์ `.env` ขึ้น Repository
