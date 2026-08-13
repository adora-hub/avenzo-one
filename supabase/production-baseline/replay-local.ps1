param(
    [string]$DockerExecutable = 'C:\Users\Windows\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe',
    [string]$ContainerName = 'supabase_db_avenzo-one-local'
)

$ErrorActionPreference = 'Stop'
$baselineDirectory = $PSScriptRoot
$manifestPath = Join-Path $baselineDirectory 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$repositoryRoot = Split-Path (Split-Path $baselineDirectory -Parent) -Parent
$bridgeMigrations = @(
    [pscustomobject]@{
        BeforeVersion = '20260807084013'
        Name = 'git_bridge_phase_0_7_permission_aware_ui'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260806230000_phase_0_7_permission_aware_ui.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260807084013'
        Name = 'git_bridge_phase_0_7_restrict_organization_creation'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260806233000_phase_0_7_restrict_organization_creation.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260807084013'
        Name = 'git_bridge_phase_0_7_member_access_summary'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260806234500_phase_0_7_member_access_summary.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260807135259'
        Name = 'git_bridge_phase_1_0_2_plans_prices'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260807150000_phase_1_0_2_plans_prices.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260807135259'
        Name = 'git_bridge_phase_1_0_2_1_plan_lifecycle'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260807160000_phase_1_0_2_1_plan_lifecycle.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260809080324'
        Name = 'git_bridge_phase_1_1_3_3_stripe_test_checkout'
        Path = Join-Path $repositoryRoot 'supabase\migrations\20260808150000_phase_1_1_3_3_stripe_test_checkout.sql'
    },
    [pscustomobject]@{
        BeforeVersion = '20260811125537'
        Name = 'recovered_bridge_stripe_test_event_current_definition'
        Path = Join-Path $baselineDirectory 'bridges\recovered_stripe_test_event_current_definition.sql'
    }
)

if ($ContainerName -ne 'supabase_db_avenzo-one-local') {
    throw "Refusing non-isolated container: $ContainerName"
}

$runningContainer = & $DockerExecutable inspect --format '{{.State.Running}}' $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $runningContainer.Trim() -ne 'true') {
    throw "Local Supabase database container is not running: $ContainerName"
}

function Invoke-LocalPsql {
    param(
        [Parameter(Mandatory)]
        [string]$Sql
    )

    $temporarySqlPath = [System.IO.Path]::GetTempFileName()
    $containerSqlPath = '/tmp/avenzo-baseline-replay.sql'

    try {
        [System.IO.File]::WriteAllText(
            $temporarySqlPath,
            $Sql,
            [System.Text.UTF8Encoding]::new($false)
        )

        & $DockerExecutable cp $temporarySqlPath "${ContainerName}:$containerSqlPath"
        if ($LASTEXITCODE -ne 0) {
            throw "docker cp failed (exit $LASTEXITCODE)"
        }

        $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $DockerExecutable
        $startInfo.Arguments = "exec $ContainerName psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerSqlPath"
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
            throw "psql failed (exit $($process.ExitCode))`n$stdout`n$stderr"
        }

        return ($stdout + $stderr)
    }
    finally {
        if (Test-Path -LiteralPath $temporarySqlPath) {
            Remove-Item -LiteralPath $temporarySqlPath -Force
        }
    }
}

$preflight = Invoke-LocalPsql -Sql @'
select current_database(), current_user, inet_server_addr(), inet_server_port();
select count(*) as user_table_count
from pg_catalog.pg_tables
where schemaname = 'public';
'@

Write-Output $preflight.Trim()

$applied = 0
foreach ($migration in $manifest.migrations) {
    foreach ($bridge in ($bridgeMigrations | Where-Object BeforeVersion -eq $migration.version)) {
        $bridgeSql = Get-Content -LiteralPath $bridge.Path -Raw -Encoding UTF8
        [void](Invoke-LocalPsql -Sql "begin;`n$bridgeSql`ncommit;`n")
        Write-Output ("BRIDGE_APPLIED {0} before {1}" -f $bridge.Name, $migration.version)
    }

    $migrationPath = Join-Path $baselineDirectory $migration.file
    $sql = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
    $transactionalSql = "begin;`n$sql`ncommit;`n"

    try {
        [void](Invoke-LocalPsql -Sql $transactionalSql)
        $applied++
        Write-Output ("APPLIED {0}/{1} {2}_{3}" -f $applied, $manifest.migration_count, $migration.version, $migration.name)
    }
    catch {
        throw "Migration replay failed at $($migration.version)_$($migration.name)`n$($_.Exception.Message)"
    }
}

$postflight = Invoke-LocalPsql -Sql @'
select count(*) as public_table_count
from pg_catalog.pg_tables
where schemaname = 'public';
select count(*) as public_function_count
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
'@

Write-Output $postflight.Trim()
Write-Output ("BASELINE_REPLAY_COMPLETE {0}/{1}" -f $applied, $manifest.migration_count)
