const PRODUCT_UNIT_LABELS: Record<string, string> = {
  piece: 'ชิ้น',
  pair: 'คู่',
  pack: 'แพ็ค',
  box: 'กล่อง',
  set: 'ชุด',
  case: 'ลัง',
  dozen: 'โหล',
  kg: 'กิโลกรัม',
  g: 'กรัม',
  litre: 'ลิตร',
  liter: 'ลิตร',
  l: 'ลิตร',
  ml: 'มิลลิลิตร',
  meter: 'เมตร',
  metre: 'เมตร',
  m: 'เมตร',
  cm: 'เซนติเมตร',
  roll: 'ม้วน',
  bag: 'ถุง',
  bottle: 'ขวด',
  can: 'กระป๋อง',
  unit: 'หน่วย',
}

export function formatProductUnit(code: string | null | undefined) {
  const value = code?.trim()
  if (!value) return '—'
  return PRODUCT_UNIT_LABELS[value.toLowerCase()] ?? value
}
