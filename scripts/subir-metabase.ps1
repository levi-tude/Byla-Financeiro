# BYLA - Sobe o Metabase com Docker
# Uso: clique com botao direito -> Executar com PowerShell
# Ou: .\subir-metabase.ps1

$ErrorActionPreference = "Stop"
$dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"

if (-not (Test-Path $dockerExe)) {
    Write-Host "Docker nao encontrado em $dockerExe" -ForegroundColor Red
    exit 1
}

Write-Host "BYLA - Subindo Metabase..." -ForegroundColor Cyan

# Inicia o Docker Desktop se nao estiver rodando
$proc = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Host "Iniciando Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    Write-Host "Aguardando o Docker ficar pronto (ate 90 segundos)..." -ForegroundColor Yellow
    $max = 18
    for ($i = 0; $i -lt $max; $i++) {
        Start-Sleep -Seconds 5
        $err = & $dockerExe info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker pronto." -ForegroundColor Green
            break
        }
        if ($i -eq $max - 1) {
            Write-Host "Docker nao respondeu. Abra o Docker Desktop manualmente, espere o icone ficar verde e rode este script de novo." -ForegroundColor Red
            exit 1
        }
    }
}

# Verifica se o daemon responde
$null = & $dockerExe info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop esta aberto? Espere o icone ficar verde (rodando) e execute este script novamente." -ForegroundColor Red
    exit 1
}

# Container ja existe?
$existing = & $dockerExe ps -a --filter "name=metabase" --format "{{.Names}}" 2>&1
if ($existing -match "metabase") {
    Write-Host "Container 'metabase' ja existe. Iniciando..." -ForegroundColor Yellow
    & $dockerExe start metabase 2>&1
} else {
    Write-Host "Baixando imagem e criando container Metabase (pode demorar na primeira vez)..." -ForegroundColor Green
    & $dockerExe run -d -p 3000:3000 --name metabase metabase/metabase 2>&1
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Metabase em execucao." -ForegroundColor Green
    Write-Host "Acesse: http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximo passo: conectar ao Supabase em docs\PASSO_1_BI_FAZER_AGORA.md (secao C)." -ForegroundColor Gray
    Start-Process "http://localhost:3000"
} else {
    Write-Host "Erro ao subir o container. Confira se o Docker Desktop esta rodando (icone verde)." -ForegroundColor Red
    exit 1
}
