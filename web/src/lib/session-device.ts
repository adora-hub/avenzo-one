import type { SupabaseClient } from '@supabase/supabase-js'

export type AppSessionDeviceMetadata = {
  deviceLabel: string
  browserName: string
  operatingSystem: string
}

function detectBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge'
  if (/OPR\//i.test(userAgent)) return 'Opera'
  if (/Chrome\//i.test(userAgent)) return 'Google Chrome'
  if (/Firefox\//i.test(userAgent)) return 'Mozilla Firefox'
  if (/Safari\//i.test(userAgent)) return 'Safari'
  return 'เว็บเบราว์เซอร์'
}

function detectOperatingSystem(userAgent: string) {
  if (/Windows NT/i.test(userAgent)) return 'Windows'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/(iPhone|iPad|iPod)/i.test(userAgent)) return 'iOS / iPadOS'
  if (/Mac OS X/i.test(userAgent)) return 'macOS'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return 'ไม่ทราบระบบปฏิบัติการ'
}

export function getCurrentSessionDeviceMetadata(userAgent: string): AppSessionDeviceMetadata {
  const browserName = detectBrowser(userAgent)
  const operatingSystem = detectOperatingSystem(userAgent)

  return {
    browserName,
    operatingSystem,
    deviceLabel: `${browserName} บน ${operatingSystem}`,
  }
}

export async function updateCurrentSessionDeviceMetadata(
  supabase: Pick<SupabaseClient, 'rpc'>,
  metadata: AppSessionDeviceMetadata,
) {
  try {
    const { error } = await supabase.rpc('app_update_current_session_device', {
      p_device_label: metadata.deviceLabel,
      p_browser_name: metadata.browserName,
      p_operating_system: metadata.operatingSystem,
    })

    return { updated: !error, errorMessage: error?.message ?? null }
  } catch (error) {
    return {
      updated: false,
      errorMessage: error instanceof Error ? error.message : 'unknown_device_metadata_error',
    }
  }
}
