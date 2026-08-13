param(
    [string]$DockerExecutable = 'C:\Users\Windows\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe',
    [string]$ContainerName = 'supabase_db_avenzo-one-local'
)

$ErrorActionPreference = 'Stop'
$verificationDirectory = $PSScriptRoot
$supabaseDirectory = Split-Path $verificationDirectory -Parent
$repositoryRoot = Split-Path $supabaseDirectory -Parent

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
        [Parameter(Mandatory)] [string]$Path,
        [switch]$TuplesOnly
    )
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $containerPath = '/tmp/avenzo-phase-2-0-release-gate.sql'
    & $DockerExecutable cp $resolvedPath "${ContainerName}:$containerPath" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp failed for $resolvedPath" }

    $arguments = @('exec', $ContainerName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1')
    if ($TuplesOnly) { $arguments += @('-A', '-t') }
    $arguments += @('-U', 'postgres', '-d', 'postgres', '-f', $containerPath)
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $DockerExecutable
    $startInfo.Arguments = ($arguments -join ' ')
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "psql failed for $resolvedPath`n$stdout`n$stderr" }
    return ($stdout + $stderr).Trim()
}

function Invoke-LocalPsqlText {
    param(
        [Parameter(Mandatory)] [string]$Sql,
        [switch]$TuplesOnly
    )
    $temporaryPath = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($temporaryPath, $Sql, [System.Text.UTF8Encoding]::new($false))
        return Invoke-LocalPsqlFile -Path $temporaryPath -TuplesOnly:$TuplesOnly
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

$publicTableCount = Invoke-LocalPsqlText -TuplesOnly -Sql @'
select count(*) from pg_catalog.pg_tables where schemaname = 'public';
'@
if ($publicTableCount.Trim() -ne '0') {
    throw "Release gate requires a clean Local Supabase database; public table count=$publicTableCount"
}

$baselineVerifier = Join-Path $supabaseDirectory 'production-baseline\verify.mjs'
& node $baselineVerifier
if ($LASTEXITCODE -ne 0) { throw 'Production baseline integrity verification failed' }

$baselineReplay = Join-Path $supabaseDirectory 'production-baseline\replay-local.ps1'
& $baselineReplay -DockerExecutable $DockerExecutable -ContainerName $ContainerName

$phaseDatabaseVerify = Join-Path $verificationDirectory 'phase-2-0-3-verify-local.ps1'
& $phaseDatabaseVerify -DockerExecutable $DockerExecutable -ContainerName $ContainerName

$forwardMigrations = @(
    '20260813135745_phase_2_0_4_server_application_foundation.sql',
    '20260813162443_phase_2_0_6_warehouse_command_trigger_security.sql'
)
$forwardTests = @(
    'phase_2_0_4_server_application_foundation.sql',
    'phase_2_0_6_warehouse_command_trigger_security.sql'
)

$rollbackSql = [System.Text.StringBuilder]::new()
[void]$rollbackSql.AppendLine('begin;')
foreach ($migrationName in $forwardMigrations) {
    $migrationPath = Join-Path $supabaseDirectory "migrations\$migrationName"
    [void]$rollbackSql.AppendLine((Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8))
}
[void]$rollbackSql.AppendLine(@'
do $release_objects_exist$
begin
  if to_regprocedure('public.server_execute_foundation_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)') is null
     or to_regprocedure('public.server_resolve_foundation_branch_ids(uuid,text,uuid[])') is null then
    raise exception 'release_objects_missing_before_rollback';
  end if;
end
$release_objects_exist$;
rollback;
'@)
[void](Invoke-LocalPsqlText -Sql $rollbackSql.ToString())

$rollbackCheck = Invoke-LocalPsqlText -TuplesOnly -Sql @'
select
  (to_regprocedure('public.server_execute_foundation_command(uuid,uuid,text,jsonb,text,uuid,timestamptz)') is null)
  and (to_regprocedure('public.server_resolve_foundation_branch_ids(uuid,text,uuid[])') is null);
'@
if ($rollbackCheck.Trim() -ne 't') { throw 'Release transactional rollback rehearsal left server objects' }
Write-Output 'PHASE_2_0_RELEASE_TRANSACTIONAL_ROLLBACK_REHEARSAL_PASSED'

for ($index = 0; $index -lt $forwardMigrations.Count; $index++) {
    $migrationPath = Join-Path $supabaseDirectory "migrations\$($forwardMigrations[$index])"
    $migrationSql = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
    [void](Invoke-LocalPsqlText -Sql "begin;`n$migrationSql`ncommit;`n")
    Write-Output "FORWARD_APPLIED $($forwardMigrations[$index])"
    $testPath = Join-Path $supabaseDirectory "tests\$($forwardTests[$index])"
    Write-Output (Invoke-LocalPsqlFile -Path $testPath)
}

$releaseGate = Invoke-LocalPsqlText -Sql @'
do $release_gate$
declare
  v_rls_count integer;
begin
  select count(*) into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relrowsecurity
    and c.relname in (
      'products', 'skus', 'warehouses', 'locations',
      'inventory_commands', 'stock_movements', 'inventory_balances', 'inventory_domain_events'
    );
  if v_rls_count <> 8 then raise exception 'release_rls_count_invalid %', v_rls_count; end if;

  if has_function_privilege('anon', 'public.server_resolve_foundation_branch_ids(uuid,text,uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.server_resolve_foundation_branch_ids(uuid,text,uuid[])', 'execute')
     or not has_function_privilege('service_role', 'public.server_resolve_foundation_branch_ids(uuid,text,uuid[])', 'execute') then
    raise exception 'release_scope_resolver_privilege_invalid';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.inventory_domain_events'::regclass
      and tgname = 'audit_inventory_domain_event' and not tgisinternal
  ) then raise exception 'release_inventory_audit_trigger_missing'; end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
  ) then raise exception 'release_security_definer_search_path_missing'; end if;

  raise notice 'FOUNDATION_RELEASE_GATE_PASSED';
end
$release_gate$;
'@
Write-Output $releaseGate

$fingerprintPath = Join-Path $supabaseDirectory 'production-baseline\schema-fingerprint.sql'
$fingerprintOutput = Invoke-LocalPsqlFile -Path $fingerprintPath -TuplesOnly
$fingerprintBytes = [System.Text.Encoding]::UTF8.GetBytes(($fingerprintOutput -replace "`r`n", "`n").Trim())
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $fingerprintHash = ([System.BitConverter]::ToString($sha256.ComputeHash($fingerprintBytes)) -replace '-', '').ToLowerInvariant()
}
finally { $sha256.Dispose() }

Write-Output "PHASE_2_0_RELEASE_SCHEMA_FINGERPRINT_SHA256 $fingerprintHash"
Write-Output 'PHASE_2_0_LOCAL_RELEASE_GATE_COMPLETE'

