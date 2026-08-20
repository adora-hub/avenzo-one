param(
    [string]$DockerExecutable = 'C:\Users\Windows\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe',
    [string]$ContainerName = 'supabase_db_avenzo-one-local'
)

$ErrorActionPreference = 'Stop'
$verificationDirectory = $PSScriptRoot
$supabaseDirectory = Split-Path $verificationDirectory -Parent
$repositoryRoot = Split-Path $supabaseDirectory -Parent

$phaseMigrations = @(
    '20260813124837_phase_2_0_3_2_product_sku_schema.sql',
    '20260813130312_phase_2_0_3_3_warehouse_location_schema.sql',
    '20260813131250_phase_2_0_3_4_inventory_ledger_balance.sql',
    '20260813132549_phase_2_0_3_5_permission_rls_security.sql'
)

$phaseTests = @(
    'phase_2_0_3_2_product_sku_schema.sql',
    'phase_2_0_3_3_warehouse_location_schema.sql',
    'phase_2_0_3_4_inventory_ledger_balance.sql',
    'phase_2_0_3_5_permission_rls_security.sql'
)

if ($ContainerName -ne 'supabase_db_avenzo-one-local') {
    throw "Refusing non-isolated container: $ContainerName"
}

if (-not (Test-Path -LiteralPath $DockerExecutable)) {
    throw "Docker executable not found: $DockerExecutable"
}

$runningContainer = & $DockerExecutable inspect --format '{{.State.Running}}' $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $runningContainer.Trim() -ne 'true') {
    throw "Local Supabase database container is not running: $ContainerName"
}

function Invoke-LocalPsqlFile {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [switch]$TuplesOnly
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $containerPath = '/tmp/avenzo-phase-2-0-3-verification.sql'
    & $DockerExecutable cp $resolvedPath "${ContainerName}:$containerPath" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "docker cp failed for $resolvedPath"
    }

    $psqlArgs = @('exec', $ContainerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1')
    if ($TuplesOnly) {
        $psqlArgs += @('-A', '-t')
    }
    $psqlArgs += @('-U', 'postgres', '-d', 'postgres', '-f', $containerPath)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $DockerExecutable
    $startInfo.Arguments = ($psqlArgs -join ' ')
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "psql failed for $resolvedPath`n$stdout`n$stderr"
    }
    return ($stdout + $stderr).Trim()
}

function Invoke-LocalPsqlText {
    param(
        [Parameter(Mandatory)]
        [string]$Sql,
        [switch]$TuplesOnly
    )

    $temporaryPath = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText(
            $temporaryPath,
            $Sql,
            [System.Text.UTF8Encoding]::new($false)
        )
        return Invoke-LocalPsqlFile -Path $temporaryPath -TuplesOnly:$TuplesOnly
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

$preflight = Invoke-LocalPsqlText -Sql @'
select current_database(), current_user, current_setting('server_version');
select count(*) from pg_catalog.pg_tables where schemaname = 'public';
'@
Write-Output $preflight

# Rehearse a transactional rollback of the complete Phase 2.0.3 forward set.
$rollbackSql = [System.Text.StringBuilder]::new()
[void]$rollbackSql.AppendLine('begin;')
foreach ($migrationName in $phaseMigrations) {
    $migrationPath = Join-Path $supabaseDirectory "migrations\$migrationName"
    [void]$rollbackSql.AppendLine((Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8))
}
[void]$rollbackSql.AppendLine(@'
do $verify_phase_objects_exist$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.inventory_balances') is null then
    raise exception 'phase_objects_missing_before_rollback';
  end if;
end
$verify_phase_objects_exist$;
rollback;
'@)
[void](Invoke-LocalPsqlText -Sql $rollbackSql.ToString())

$rollbackCheck = Invoke-LocalPsqlText -TuplesOnly -Sql @'
select count(*)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'products', 'skus', 'warehouses', 'locations',
    'inventory_commands', 'stock_movements',
    'inventory_balances', 'inventory_domain_events'
  );
'@
if ($rollbackCheck.Trim() -ne '0') {
    throw "Transactional rollback rehearsal left Phase objects: $rollbackCheck"
}
Write-Output 'PHASE_2_0_3_TRANSACTIONAL_ROLLBACK_REHEARSAL_PASSED'

# Apply and verify each phase in dependency order so deny-by-default tests run
# before Phase 2.0.3.5 intentionally opens reviewed SELECT policies.
for ($index = 0; $index -lt $phaseMigrations.Count; $index++) {
    $migrationPath = Join-Path $supabaseDirectory "migrations\$($phaseMigrations[$index])"
    $migrationSql = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
    [void](Invoke-LocalPsqlText -Sql "begin;`n$migrationSql`ncommit;`n")
    Write-Output "FORWARD_APPLIED $($phaseMigrations[$index])"

    $testPath = Join-Path $supabaseDirectory "tests\$($phaseTests[$index])"
    $testOutput = Invoke-LocalPsqlFile -Path $testPath
    Write-Output $testOutput
}

$gateOutput = Invoke-LocalPsqlText -Sql @'
do $phase_gate$
declare
  v_table_count integer;
  v_rls_count integer;
  v_policy_count integer;
  v_permission_count integer;
begin
  select count(*) into v_table_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'products', 'skus', 'warehouses', 'locations',
      'inventory_commands', 'stock_movements',
      'inventory_balances', 'inventory_domain_events'
    );

  select count(*) into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relrowsecurity
    and c.relname in (
      'products', 'skus', 'warehouses', 'locations',
      'inventory_commands', 'stock_movements',
      'inventory_balances', 'inventory_domain_events'
    );

  select count(*) into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and policyname like '%permission_select'
    and tablename in (
      'products', 'skus', 'warehouses', 'locations',
      'inventory_commands', 'stock_movements',
      'inventory_balances', 'inventory_domain_events'
    );

  select count(*) into v_permission_count
  from public.permissions
  where code in (
    'product.read', 'product.manage',
    'warehouse.read', 'warehouse.manage',
    'inventory.read', 'inventory.receive',
    'inventory.adjust', 'inventory.transfer'
  );

  if v_table_count <> 8 or v_rls_count <> 8
     or v_policy_count <> 8 or v_permission_count <> 8 then
    raise exception 'phase_gate_count_mismatch tables=% rls=% policies=% permissions=%',
      v_table_count, v_rls_count, v_policy_count, v_permission_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.conrelid in (
        'public.products'::regclass, 'public.skus'::regclass,
        'public.warehouses'::regclass, 'public.locations'::regclass,
        'public.inventory_commands'::regclass, 'public.stock_movements'::regclass,
        'public.inventory_balances'::regclass, 'public.inventory_domain_events'::regclass
      )
      and not exists (
        select 1 from pg_catalog.pg_index i
        where i.indrelid = c.conrelid
          and i.indkey::smallint[] @> c.conkey
      )
  ) then
    raise exception 'phase_foreign_key_index_missing';
  end if;

  raise notice 'PHASE_2_0_3_MIGRATION_GATE_PASSED';
end
$phase_gate$;
'@
Write-Output $gateOutput

$fingerprintPath = Join-Path $supabaseDirectory 'production-baseline\schema-fingerprint.sql'
$fingerprintOutput = Invoke-LocalPsqlFile -Path $fingerprintPath -TuplesOnly
$fingerprintBytes = [System.Text.Encoding]::UTF8.GetBytes(
    ($fingerprintOutput -replace "`r`n", "`n").Trim()
)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $fingerprintHash = ([System.BitConverter]::ToString(
        $sha256.ComputeHash($fingerprintBytes)
    ) -replace '-', '').ToLowerInvariant()
}
finally {
    $sha256.Dispose()
}

Write-Output "PHASE_2_0_3_SCHEMA_FINGERPRINT_SHA256 $fingerprintHash"
Write-Output 'PHASE_2_0_3_CLEAN_VERIFICATION_COMPLETE'
