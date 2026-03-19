# BYLA - Script para subir o Metabase (BI)
# Uso: .\run-metabase.ps1
# Depois acesse http://localhost:3000

$ErrorActionPreference = "Stop"

Write-Host "BYLA - Iniciando Metabase..." -ForegroundColor Cyan

# Tenta Docker primeiro
try {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        Write-Host "Docker encontrado. Subindo container Metabase..." -ForegroundColor Green
        docker run -d -p 3000:3000 --name metabase metabase/metabase 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Metabase em execucao. Acesse: http://localhost:3000" -ForegroundColor Green
            exit 0
        }
        # Container já existe? Tenta iniciar
        docker start metabase 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Container Metabase iniciado. Acesse: http://localhost:3000" -ForegroundColor Green
            exit 0
        }
    }
} catch {
    # Docker não disponível
}

Write-Host "Docker nao encontrado ou indisponivel." -ForegroundColor Yellow
Write-Host ""
Write-Host "Use a Opcao B (JAR):" -ForegroundColor White
Write-Host "1. Baixe metabase.jar em: https://github.com/metabase/metabase/releases/latest" -ForegroundColor White
Write-Host "2. Nesta pasta (ou na pasta do JAR), execute:" -ForegroundColor White
Write-Host "   java -jar metabase.jar" -ForegroundColor White
Write-Host "3. Acesse: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Guia completo: docs\PASSO_1_BI_FAZER_AGORA.md" -ForegroundColor Gray
exit 1
