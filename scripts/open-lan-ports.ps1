# =============================================================
# Ejecutar como Administrador
# Abre los puertos 80, 5173 y 8080 en el firewall de Windows
# para acceso desde la red local (LAN) en todos los perfiles.
# =============================================================

$ports = @(80, 5173, 8080)

foreach ($p in $ports) {
    $name = "Todos LAN TCP $p"
    # Eliminar regla vieja si existe
    Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    # Crear nueva regla para todos los perfiles (Public, Private, Domain)
    New-NetFirewallRule `
        -DisplayName $name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $p `
        -Profile Any `
        -Enabled True | Out-Null
    Write-Host "OK: Puerto $p habilitado"
}

Write-Host ""
Write-Host "Verificando conectividad en 10.64.222.131..."
$ProgressPreference = 'SilentlyContinue'
foreach ($p in $ports) {
    try {
        $r = Invoke-WebRequest -Uri "http://10.64.222.131:$p" -UseBasicParsing -TimeoutSec 5
        Write-Host "  Puerto $p: ACCESIBLE (status $($r.StatusCode))"
    } catch {
        Write-Host "  Puerto $p: $($_.Exception.Message)"
    }
}
Write-Host ""
Write-Host "Listo. Abre http://10.64.222.131:80 desde el celular."
Read-Host "Presiona Enter para cerrar"
