import { readFile } from "node:fs/promises";
import vm from "node:vm";

const prototypePath = new URL(
  "../docs/mockups/phase-2.1-products-workspace-ui.html",
  import.meta.url,
);
const html = await readFile(prototypePath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

if (!script) {
  throw new Error("Prototype script is missing");
}

new Function(script);

const checks = {
  doctype: /<!doctype html>/i.test(html),
  breadcrumb: /class="breadcrumb"/.test(html),
  heading: /<h1>Products<\/h1>/.test(html),
  skuBadge: /id="skuBadge"/.test(html),
  dataGrid: /class="data-grid"/.test(html),
  responsiveDesktopWorkspaceWidth: /\.workspace\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*1920px;/.test(html) && /@media \(min-width: 1600px\)[\s\S]*?padding-inline:\s*48px;/.test(html) && /@media \(max-width: 1279px\)[\s\S]*?padding-inline:\s*24px;/.test(html) && /@media \(max-width: 760px\)[\s\S]*?padding:\s*22px 14px 48px;/.test(html),
  productsHeaderContrast: /#productsTable thead th\s*\{[\s\S]*?background:\s*#111;[\s\S]*?color:\s*#fff;/.test(html),
  pinnedProductsHeaderContrast: /#productsTable thead th\.is-pinned\s*\{[^}]*background:\s*#111;[^}]*color:\s*#fff;/.test(html),
  productsHeaderResizeContrast: /#productsTable thead \.column-resizer\[data-resizing="true"\]::after\s*\{\s*background:\s*#fff;/.test(html),
  productImages: /productImage\(product\)/.test(html),
  hoverImagePreview: /id="imagePreview"/.test(html),
  cfColumn: /data-column="cf"/.test(html),
  priceColumn: /data-column="price"/.test(html),
  compactDefaultColumns: /const defaultColumnConfig = \[[\s\S]*?key: "product"[\s\S]*?key: "cf"[\s\S]*?key: "sku"[\s\S]*?key: "inventory"[\s\S]*?key: "unit"[\s\S]*?key: "price"[\s\S]*?key: "status"/.test(html),
  optionalBusinessColumns: ["category", "brand", "barcode", "quantityBehavior", "cost", "tax", "tags", "branches", "createdAt", "updatedAt", "createdBy"].every((key) => html.includes(`data-column="${key}"`)),
  optionalColumnsHiddenByDefault: /key: "category"[^\n]+visible: false[\s\S]*?key: "createdBy"[^\n]+visible: false/.test(html),
  copySkuAndCf: /data-copy-value=/.test(html),
  resizableColumns: /data-resize="product"/.test(html),
  persistentColumnWidths: /storageKeys\.widths/.test(html),
  columnConfigurationModel: /const defaultColumnConfig =/.test(html),
  columnConfigurationPersistence: /storageKeys\.columns/.test(html),
  pinLimitInModel: /pinnedCount < 3/.test(html),
  customizeButton: /id="customizeColumnsButton"/.test(html),
  iconToolbar: /class="toolbar-icon-group"[^>]+role="menubar"/.test(html),
  clearFilterIconButton: /id="clearFilters" class="toolbar-icon-button"/.test(html),
  excelIconButton: /id="excelToolsButton" class="toolbar-icon-button"/.test(html),
  customizeIconButton: /id="customizeColumnsButton" class="toolbar-icon-button"/.test(html),
  iconTooltips: /id="clearFilters"[^>]+data-tooltip="ล้างตัวกรอง"[\s\S]*?id="excelToolsButton"[^>]+data-tooltip="เครื่องมือ Excel"[\s\S]*?id="customizeColumnsButton"[^>]+data-tooltip="ปรับแต่งคอลัมน์"/.test(html),
  iconToolbarKeyboardNavigation: /\.toolbar-icon-group[\s\S]*?ArrowRight[\s\S]*?ArrowLeft[\s\S]*?Home[\s\S]*?End/.test(html),
  excelToolsMenu: /id="excelToolsMenu"[^>]+role="menu"/.test(html),
  excelImportAction: /data-excel-action="import"[\s\S]*?นำเข้าด้วยไฟล์ Excel/.test(html),
  excelTemplateAction: /data-excel-action="template"[\s\S]*?ดาวน์โหลด Template/.test(html),
  excelExportColumnsAction: /data-excel-action="export-columns"[\s\S]*?กำหนดคอลัมน์ที่ส่งออก/.test(html),
  localExcelFileOnly: /id="excelImportInput"[^>]+accept="\.xlsx,\.xls,\.csv"[^>]+hidden/.test(html),
  downloadableCsvTemplate: /function downloadProductTemplate\(\)/.test(html),
  excelMenuKeyboardNavigation: /elements\.excelMenu\.addEventListener\("keydown"[\s\S]*?ArrowDown[\s\S]*?ArrowUp[\s\S]*?Escape/.test(html),
  exportColumnsDialog: /id="exportColumnsModal"[\s\S]*?aria-labelledby="exportColumnsTitle"/.test(html),
  exportColumnsIndependentCopy: /การตั้งค่านี้แยกจากคอลัมน์ที่แสดงในตาราง/.test(html),
  exportColumnsPersistence: /storageKeys\.exportColumns/.test(html),
  exportColumnsDefinition: /const exportColumnDefinitions = \[/.test(html),
  exportColumnsSave: /id="saveExportColumns"[\s\S]*?function persistExportColumns/.test(html),
  iconButtonsDescribeControlledUi: /id="excelToolsButton"[^>]+aria-controls="excelToolsMenu"[\s\S]*?id="customizeColumnsButton"[^>]+aria-controls="customizeColumnsPopover"/.test(html),
  modalFocusContainment: /function keepFocusInside\(container, event\)/.test(html),
  visibleTopIconTooltips: /\.data-grid\s*\{[\s\S]*?overflow:\s*visible;/.test(html),
  responsiveIconToolbar: /@media \(max-width: 760px\)[\s\S]*?\.toolbar-icon-group\s*\{\s*margin-left:\s*auto;/.test(html),
  customizePopover: /id="customizeColumnsPopover"/.test(html),
  customizeColumnRows: /function renderCustomizeRows/.test(html),
  columnVisibilityControl: /data-column-visible=/.test(html),
  columnWidthControl: /data-column-width=/.test(html),
  columnPinControl: /data-column-pin=/.test(html),
  columnReorderControl: /data-column-move=/.test(html),
  stickyPinnedColumns: /function applyPinnedColumns/.test(html),
  dynamicColumnLayout: /function applyColumnLayout/.test(html),
  customizeSave: /id="saveCustomizeColumns"/.test(html),
  inlineCfEdit: /data-edit-field="sales"/.test(html),
  stockIsReadOnly: /Stock มาจาก Inventory read model/.test(html) && !/data-edit-field="inventory"/.test(html),
  inlineBaseUnitEdit: /data-edit-field="unit"/.test(html),
  baseUnitDomainGuard: /function canInlineEditUnit\(product\)[\s\S]*?product\.status === "draft" && product\.inventory === 0/.test(html),
  costPermissionGuard: /product\.cost\.read/.test(html) && /จำกัดสิทธิ์/.test(html),
  quickView: /id="quickViewBackdrop"[\s\S]*?id="quickViewPanel"/.test(html),
  quickViewVariantList: /data-quick-section="variants"[\s\S]*?product\.skuItems\.map/.test(html),
  quickSkuHeaderContrast: /\.quick-sku-table th\s*\{[\s\S]*?background:\s*#111;[\s\S]*?color:\s*#fff;/.test(html),
  quickSkuHeaderIsTableCell: /\.quick-sku-table th\s*\{[\s\S]*?display:\s*table-cell;/.test(html),
  quickSkuStickyHeader: /\.quick-sku-table th\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;/.test(html),
  quickSkuColumnAlignment: /class="quick-sku-table"[^>]*><colgroup>[\s\S]*?<th scope="col">ตัวเลือก<\/th>[\s\S]*?<th scope="col">Stock<\/th>/.test(html),
  quickSkuScrollableRegion: /class="quick-sku-wrap" tabindex="0" aria-label="ตาราง SKU เลื่อนได้เมื่อข้อมูลกว้าง"/.test(html),
  quickViewPhysicalDetails: /productDimensions[\s\S]*?boxDimensions/.test(html),
  variantCountAction: /data-quick-view-section="variants"/.test(html),
  expandedSearchFields: /product\.category, product\.brand, product\.tags\.join/.test(html),
  statusCombobox: /data-status-id=/.test(html),
  fixedStatusCombobox: /\.status-select\s*\{[\s\S]*?width:\s*120px;[\s\S]*?height:\s*30px;/.test(html),
  twelvePixelStatusChevron: /\.status-chevron\s*\{[\s\S]*?right:\s*12px;/.test(html),
  defaultSelectChevron: /\.select-field-chevron\s*\{[\s\S]*?right:\s*12px;/.test(html),
  filterSelectUsesDefaultShell: /class="select-field filter-select-shell"[\s\S]*?id="statusFilter"[\s\S]*?class="select-field-chevron"/.test(html),
  pageSizeUsesDefaultShell: /class="select-field rows-select-shell"[\s\S]*?id="pageSize"[\s\S]*?class="select-field-chevron"/.test(html),
  statusIndicatorDot: /class="status-dot"/.test(html),
  bulkSearchModal: /id="bulkSearchModal"/.test(html),
  bulkSearchTooltip: /กด Ctrl\+Enter เพื่อค้นหาได้/.test(html),
  bulkSearchKeyboardShortcut: /event\.ctrlKey \|\| event\.metaKey/.test(html),
  customAlertIcons: /data-icon-override=/.test(html),
  bulkSummaryAlerts: /class="bulk-alert success"/.test(html),
  bulkSearchExample: /BLZ-DBL-NVY/.test(html),
  createProductAlignedWithDescription: /class="heading-subrow"[\s\S]*?<p>[\s\S]*?id="newProductButton"/.test(html),
  createProductModeMenu: /id="createProductMenu"/.test(html) && /phase-2\.1-unified-product-creation-form\.html/.test(html) && /phase-2\.1-live-sales-code-reservation\.html/.test(html),
  unifiedProductFormLink: /href="phase-2\.1-unified-product-creation-form\.html"/.test(html),
  compactBottomAlignedHeading: /\.page-heading\s*\{[\s\S]*?margin-bottom:\s*10px;[\s\S]*?\.heading-subrow \.primary\s*\{[\s\S]*?bottom:\s*0;/.test(html),
  inverseSkuBadgeByTheme: /\.count-badge\s*\{[\s\S]*?background:\s*#111;[\s\S]*?color:\s*#fff;[\s\S]*?html\[data-theme="dark"\] \.count-badge\s*\{[\s\S]*?background:\s*#fff;[\s\S]*?color:\s*#111;/.test(html),
  noWorkspaceThemeButton: !/id="themeButton"/.test(html),
  noPrototypeResetButton: !/id="resetPrototypeButton"/.test(html),
  darkThemeCompatibilityWithoutControl: /html\[data-theme="dark"\]/.test(html) && !/id="themeButton"/.test(html),
  search: /id="searchInput"/.test(html),
  singleCustomClearButton: /id="searchInput"[^>]+type="text"/.test(html),
  mainMultiTermSearch: /function parseMainSearchTerms/.test(html),
  statusFilter: /id="statusFilter"/.test(html),
  sorting: /data-sort="name"/.test(html),
  selection: /id="selectAll"/.test(html),
  pagination: /id="nextPage"/.test(html),
  noNetworkFetch: !/\bfetch\s*\(/.test(html),
  noSupabaseClient: !/(createClient|supabaseUrl|service_role|NEXT_PUBLIC_SUPABASE)/i.test(
    html,
  ),
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failed.length > 0) {
  throw new Error(`Prototype checks failed: ${failed.join(", ")}`);
}

const logicPrefix = script.split(
  'document.querySelectorAll("[data-resize]")',
)[0];
const memoryStorage = new Map();
const context = vm.createContext({
  clearTimeout,
  console,
  document: { getElementById: () => ({}) },
  localStorage: {
    getItem: (key) => memoryStorage.get(key) ?? null,
    removeItem: (key) => memoryStorage.delete(key),
    setItem: (key, value) => memoryStorage.set(key, value),
  },
  navigator: {},
  setTimeout,
  structuredClone,
});
vm.runInContext(logicPrefix, context);

const parsedCodes = vm.runInContext(
  'parseBulkCodes("B03,b11,BLZ-DBL-NVY B03")',
  context,
);
if (JSON.stringify(parsedCodes) !== JSON.stringify(["B03", "B11", "BLZ-DBL-NVY"])) {
  throw new Error(`Bulk-code parsing failed: ${JSON.stringify(parsedCodes)}`);
}

const matchedProductIds = vm.runInContext(
  'state.bulkCodes = parseBulkCodes("B03,b11,BLZ-DBL-NVY"); filteredProducts().map((product) => product.id).sort((a, b) => a - b)',
  context,
);
if (JSON.stringify(matchedProductIds) !== JSON.stringify([3, 10, 11])) {
  throw new Error(`Bulk matching failed: ${JSON.stringify(matchedProductIds)}`);
}

const mainSearchProductIds = vm.runInContext(
  'state.bulkCodes = []; state.query = "CF-B03,B03"; filteredProducts().map((product) => product.id)',
  context,
);
if (JSON.stringify(mainSearchProductIds) !== JSON.stringify([3])) {
  throw new Error(`Main multi-term search failed: ${JSON.stringify(mainSearchProductIds)}`);
}

const normalizedPinnedCount = vm.runInContext(
  'normalizeColumnConfig(defaultColumnConfig.map((column, order) => ({ ...column, order, pinned: true }))).filter((column) => column.pinned).length',
  context,
);
if (normalizedPinnedCount !== 3) {
  throw new Error(`Pinned-column limit failed: ${normalizedPinnedCount}`);
}

const normalizedWidth = vm.runInContext(
  'normalizeColumnConfig([{ key: "cf", width: 20 }]).find((column) => column.key === "cf").width',
  context,
);
if (normalizedWidth !== 110) {
  throw new Error(`Column-width normalization failed: ${normalizedWidth}`);
}

const phraseSearchIds = vm.runInContext(
  'state.bulkCodes = []; state.query = "กระเป๋าหนัง Mini"; filteredProducts().map((product) => product.id)',
  context,
);
if (JSON.stringify(phraseSearchIds) !== JSON.stringify([3])) {
  throw new Error(`Phrase search failed: ${JSON.stringify(phraseSearchIds)}`);
}

const caseInsensitiveSearchIds = vm.runInContext(
  'state.query = "b11"; filteredProducts().map((product) => product.id)',
  context,
);
if (JSON.stringify(caseInsensitiveSearchIds) !== JSON.stringify([11])) {
  throw new Error(`Case-insensitive search failed: ${JSON.stringify(caseInsensitiveSearchIds)}`);
}

const persistedColumnWidth = vm.runInContext(
  'columnConfig.find((column) => column.key === "product").width = 388; persistColumnConfig(); readStoredJson(storageKeys.columns, []).find((column) => column.key === "product").width',
  context,
);
if (persistedColumnWidth !== 388) {
  throw new Error(`Column persistence failed: ${persistedColumnWidth}`);
}

const hiddenPinnedState = vm.runInContext(
  'normalizeColumnConfig([{ key: "product", visible: false, pinned: true }]).find((column) => column.key === "product")',
  context,
);
if (hiddenPinnedState.visible !== false || hiddenPinnedState.pinned !== false) {
  throw new Error(`Hidden pinned normalization failed: ${JSON.stringify(hiddenPinnedState)}`);
}

const defaultVisibleColumns = vm.runInContext(
  'normalizeColumnConfig([]).filter((column) => column.visible).map((column) => column.key)',
  context,
);
if (JSON.stringify(defaultVisibleColumns) !== JSON.stringify(["product", "cf", "sku", "inventory", "unit", "price", "status"])) {
  throw new Error(`Default visible-column set failed: ${JSON.stringify(defaultVisibleColumns)}`);
}

const optionalColumnSearchIds = vm.runInContext(
  'state.bulkCodes = []; state.query = "Leather Lab"; filteredProducts().map((product) => product.id)',
  context,
);
if (JSON.stringify(optionalColumnSearchIds) !== JSON.stringify([11])) {
  throw new Error(`Brand search failed: ${JSON.stringify(optionalColumnSearchIds)}`);
}

const childSkuSearchIds = vm.runInContext(
  'state.query = "BANG-MINI-TAN-02"; filteredProducts().map((product) => product.id)',
  context,
);
if (JSON.stringify(childSkuSearchIds) !== JSON.stringify([3])) {
  throw new Error(`Child-SKU search failed: ${JSON.stringify(childSkuSearchIds)}`);
}

const baseUnitEligibility = vm.runInContext(
  '[canInlineEditUnit(products[2]), canInlineEditUnit(products[3])]',
  context,
);
if (JSON.stringify(baseUnitEligibility) !== JSON.stringify([false, true])) {
  throw new Error(`Base-unit guard failed: ${JSON.stringify(baseUnitEligibility)}`);
}

const reorderedKeys = vm.runInContext(
  'normalizeColumnConfig([{ key: "status", order: 0 }, { key: "product", order: 1 }, { key: "sku", order: 2 }, { key: "cf", order: 3 }, { key: "inventory", order: 4 }, { key: "unit", order: 5 }]).map((column) => column.key)',
  context,
);
if (reorderedKeys[0] !== "status" || reorderedKeys[1] !== "product") {
  throw new Error(`Column reorder normalization failed: ${JSON.stringify(reorderedKeys)}`);
}

console.log(`Phase 2.1 Products Prototype: ${Object.keys(checks).length}/${Object.keys(checks).length} structure checks + 14/14 interaction-model checks passed`);
