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
- Phase 2.0.1 — Current-State Discovery & Decisions: approved and completed; findings incorporated into the approved Phase 2.0.2 Domain Contract
- Phase 2.0.2 — Domain Contract: approved and completed; D-201–D-217 locked, with Migration Baseline Recovery required before schema work
- Phase 2.0.3.1 — Migration Baseline Recovery: owner approved and completed; clean replay passed 90/90 canonical migrations + 7 recovered bridges, with schema fingerprint matching Production 7/7 categories
- Phase 2.0.3.2 — Product/SKU Schema: owner approved and completed locally; Product/SKU tenant constraints, permanent identifiers, forward-only lifecycle, deny-by-default RLS and local advisors passed
- Phase 2.0.3.3 — Warehouse/Location Schema: owner approved and completed locally; Branch-owned topology, composite tenant FKs, transactional default-location invariant, deny-by-default RLS and local advisors passed
- Phase 2.0.3.4 — Inventory Ledger & Balance: owner approved and completed locally; immutable movements, derived non-negative balances, atomic/idempotent posting, reconciliation and local advisors passed
- Phase 2.0.3.5 — Permission, RLS & Security Tests: owner approved and completed locally; 8 domain permissions, tenant/branch-scoped reads, server-only stock posting, AAL2 Platform Admin evidence and abuse tests passed
- Phase 2.0.3.6 — Migration Verification: owner approved and completed locally; two clean rebuilds, transactional rollback rehearsal, full Phase 2.0.3 tests and matching schema fingerprints passed
- Phase 2.0.4 — Server/Application Foundation: owner approved and completed locally; RLS read repositories, authorized/idempotent command boundary, optimistic concurrency, immutable event/audit evidence, security tests and Production Build passed
- Phase 2.0.5 — Product/SKU Vertical Slice: owner approved and completed locally; organization-scoped Product/SKU workspace, search/filter/keyset pagination, detail/create/edit/lifecycle actions, responsive light/dark UI and authenticated browser verification passed
- Phase 2.0.6 — Warehouse & Stock Movement Slice: owner approved and completed locally; Warehouse/Location directory, balance and immutable ledger views, receive/adjust/transfer commands, negative-stock protection, inventory audit evidence and responsive browser verification passed
- Phase 2.0.7 — Hardening & Release Gate: owner approved; Local Release Candidate passed clean replay, rollback, 91/91 application/security contracts, production build and authenticated E2E reconciliation; Vercel Preview remains pending separate deploy approval
- Phase 2.1 — Product Workspace UI/UX Modernization: **R0–R7.3 ปิดแล้ว** ตาม Approved Mockup/Production truth; R7.3 ผ่าน Controlled Atomic/Recovery/Image/Cleanup E2E เฉพาะ AVENZO ONE PREVIEW, Product regression 171/171 และ TypeScript โดยไม่มี Stock write และไม่แตะ Supabase Production
- Supabase project: `AVENZO ONE`
- Database region: `ap-southeast-1`

## Documentation

- [Phase 0.1 — Organization/Branch Core](docs/AVENZO_ONE_Phase_0.1_Organization_Branch_Core.md)
- [Implementation Starter Plan](docs/AVENZO_ONE_Codex_Implementation_Starter_Plan_V7.md)
- [Design System and UI/UX Standards](docs/AVENZO_ONE_Design_System_and_UIUX_Standards_V1.md)
- [UI Mockup-First Implementation Guide](docs/AVENZO_ONE_UI_Mockup_First_Implementation_Guide_V1.md)
- [Phase 0.4 — Auth & UI Foundation](docs/AVENZO_ONE_Phase_0.4_Auth_UI_Foundation.md)
- [Phase 1.3.6.1 — Design Token Foundation](docs/AVENZO_ONE_Phase_1.3.6.1_Design_Tokens.md)
- [Phase 1.3.6.2 — Shared UI Theme Migration](docs/AVENZO_ONE_Phase_1.3.6.2_Shared_UI_Theme_Migration.md)
- [Phase 1.3.6.3 — Page-specific Theme Migration and Visual QA](docs/AVENZO_ONE_Phase_1.3.6.3_Page_Specific_Theme_Visual_QA.md)
- [Phase 1.3.6.4 — Operations UI Foundation](docs/AVENZO_ONE_Phase_1.3.6.4_Operations_UI_Foundation.md)
- [Phase 2.0 — Foundation Vertical Slice Roadmap](docs/AVENZO_ONE_Phase_2.0_Foundation_Vertical_Slice_Roadmap.md)
- [Phase 2.0.1 — Current-State Discovery & Decisions](docs/AVENZO_ONE_Phase_2.0.1_Current_State_Discovery_and_Decisions.md)
- [Phase 2.0.2 — Product, Warehouse & Inventory Domain Contract](docs/AVENZO_ONE_Phase_2.0.2_Domain_Contract.md)
- [Phase 2.0.3.1 — Migration Baseline Recovery](docs/AVENZO_ONE_Phase_2.0.3.1_Migration_Baseline_Recovery.md)
- [Phase 2.0.3.2 — Product/SKU Schema](docs/AVENZO_ONE_Phase_2.0.3.2_Product_SKU_Schema.md)
- [Phase 2.0.3.3 — Warehouse/Location Schema](docs/AVENZO_ONE_Phase_2.0.3.3_Warehouse_Location_Schema.md)
- [Phase 2.0.3.4 — Inventory Ledger & Balance](docs/AVENZO_ONE_Phase_2.0.3.4_Inventory_Ledger_Balance.md)
- [Phase 2.0.3.5 — Permission, RLS & Security Tests](docs/AVENZO_ONE_Phase_2.0.3.5_Permission_RLS_Security_Tests.md)
- [Phase 2.0.3.6 — Migration Verification](docs/AVENZO_ONE_Phase_2.0.3.6_Migration_Verification.md)
- [Phase 2.0.4 — Server/Application Foundation](docs/AVENZO_ONE_Phase_2.0.4_Server_Application_Foundation.md)
- [Phase 2.0.5 — Product/SKU Vertical Slice](docs/AVENZO_ONE_Phase_2.0.5_Product_SKU_Vertical_Slice.md)
- [Phase 2.0.6 — Warehouse & Stock Movement Slice](docs/AVENZO_ONE_Phase_2.0.6_Warehouse_Stock_Movement_Slice.md)
- [Phase 2.0.7 — Hardening & Release Gate](docs/AVENZO_ONE_Phase_2.0.7_Hardening_Release_Gate.md)
- [Phase 2.1 — Product Workspace UI/UX Modernization](docs/AVENZO_ONE_Phase_2.1_Product_Workspace_UI_UX_Modernization.md)
- [Phase 2.1.R6 — Product Image Gate](docs/AVENZO_ONE_Phase_2.1.R6_Product_Image_Gate.md)
- [Phase 2.1.R7.0 — Products Visual Parity Gate](docs/AVENZO_ONE_Phase_2.1.R7.0_Products_Visual_Parity_Gate.md)
- [Phase 2.1.R7.1 — Atomic Product Creation Contract](docs/AVENZO_ONE_Phase_2.1.R7.1_Atomic_Product_Creation_Contract.md)
- [Phase 2.1.R7.2 — Unified Product Creation Form Integration](docs/AVENZO_ONE_Phase_2.1.R7.2_Unified_Product_Creation_Form_Integration.md)
- [Phase 2.1.R7.2.1 — Visual Parity Audit](docs/AVENZO_ONE_Phase_2.1.R7.2.1_Visual_Parity_Audit.md)
- [Phase 2.1.R7.2.2 — Page Structure](docs/AVENZO_ONE_Phase_2.1.R7.2.2_Page_Structure.md)
- [Phase 2.1.R7.2.3A — General Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3A_General_Form_Components.md)
- [Phase 2.1.R7.2.3B — Image Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3B_Image_Form_Components.md)
- [Phase 2.1.R7.2.3C — SKU & Identifier Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3C_SKU_Identifier_Form_Components.md)
- [Phase 2.1.R7.2.3D — Pricing & Tax Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3D_Pricing_Tax_Form_Components.md)
- [Phase 2.1.R7.2.3E — Physical Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3E_Physical_Form_Components.md)
- [Phase 2.1.R7.2.3F — Packaging & Bundle Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3F_Packaging_Bundle_Form_Components.md)
- [Phase 2.1.R7.2.3G — Inventory Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3G_Inventory_Form_Components.md)
- [Phase 2.1.R7.2.3H — Metadata & Security Form Components](docs/AVENZO_ONE_Phase_2.1.R7.2.3H_Metadata_Security_Form_Components.md)
- [Phase 2.1.R7.2.4A — Context Master Data Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4A_Context_Master_Data_Interaction.md)
- [Phase 2.1.R7.2.4B — Saved Tags Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4B_Saved_Tags_Interaction.md)
- [Phase 2.1.R7.2.4C — Identifier Assistant Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4C_Identifier_Assistant_Interaction.md)
- [Phase 2.1.R7.2.4D — SKU Staging Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4D_SKU_Staging_Interaction.md)
- [Phase 2.1.R7.2.4E — Validation Summary Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4E_Validation_Summary_Interaction.md)
- [Phase 2.1.R7.2.4F — Success & Recovery Interaction](docs/AVENZO_ONE_Phase_2.1.R7.2.4F_Success_Recovery_Interaction.md)
- [Phase 2.1.R7.2.5 — Visual Parity & Responsive QA](docs/AVENZO_ONE_Phase_2.1.R7.2.5_Visual_Parity_Responsive_QA.md)
- [Phase 2.1.R7.3 — Creation Recovery & E2E Gate](docs/AVENZO_ONE_Phase_2.1.R7.3_Creation_Recovery_E2E_Gate.md)

## Web app

```powershell
cd web
Copy-Item .env.example .env.local
npm install
npm run dev
```

## Security

ห้าม commit secrets, API keys, service-role keys หรือไฟล์ `.env` ขึ้น Repository
