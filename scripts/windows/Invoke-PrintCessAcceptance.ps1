[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$ApplicationPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PrinterName,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$SigningManifestPath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-fA-F]{64}$")]
    [string]$ExpectedSigningManifestSha256,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$")]
    [string]$ExpectedReleaseTag,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$")]
    [string]$ExpectedCommitSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-fA-F]{40}$")]
    [string]$ExpectedSignerThumbprint,

    [string]$OutputPath = "artifacts/acceptance/windows-printer-acceptance.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "This acceptance collector must run on the target Windows device."
}

Import-Module (Join-Path $PSScriptRoot "PrintCess.Acceptance.psm1") -Force -DisableNameChecking

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$Evidence
    )
    [pscustomobject]@{ name = $Name; passed = $Passed; evidence = $Evidence }
}

function Test-SecretShape {
    param([AllowNull()][string]$Value, [int]$MinimumLength)
    return -not [string]::IsNullOrWhiteSpace($Value) -and $Value.Length -ge $MinimumLength
}

$resolvedApplicationPath = (Resolve-Path $ApplicationPath).Path
$resolvedSigningManifestPath = (Resolve-Path $SigningManifestPath).Path
$signingManifestHash = (Get-FileHash $resolvedSigningManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not [string]::Equals(
    $signingManifestHash,
    $ExpectedSigningManifestSha256.ToLowerInvariant(),
    [StringComparison]::Ordinal
)) {
    throw "The signing manifest hash does not match the independently approved digest."
}
$signingManifest = Get-Content $resolvedSigningManifestPath -Raw | ConvertFrom-Json
$signingContract = Assert-SigningManifestContract `
    -Manifest $signingManifest `
    -ExpectedReleaseTag $ExpectedReleaseTag `
    -ExpectedCommitSha $ExpectedCommitSha `
    -ExpectedSignerThumbprint $ExpectedSignerThumbprint

$application = Get-Item $resolvedApplicationPath
$signature = Get-AuthenticodeSignature $resolvedApplicationPath
$hash = Get-FileHash $resolvedApplicationPath -Algorithm SHA256
$version = $application.VersionInfo
$operatingSystem = Get-CimInstance Win32_OperatingSystem
$computerSystem = Get-CimInstance Win32_ComputerSystem
$spooler = Get-Service Spooler
$printer = Get-Printer -Name $PrinterName -Full
$printerConfiguration = Get-PrintConfiguration -PrinterName $PrinterName
$printerCim = Get-CimInstance Win32_Printer | Where-Object { $_.Name -ceq $PrinterName } | Select-Object -First 1
if ($null -eq $printerCim) {
    throw "The exact configured printer was not found through Win32_Printer."
}

$serverUrlValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_SERVER_BASE_URL", "Machine")
if ([string]::IsNullOrWhiteSpace($serverUrlValue)) {
    $serverUrlValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_SERVER_BASE_URL", "Process")
}
$serverUri = $null
$serverUrlValid = [Uri]::TryCreate($serverUrlValue, [UriKind]::Absolute, [ref]$serverUri) -and
    $serverUri.Scheme -eq "https" -and -not $serverUri.IsLoopback -and
    [string]::IsNullOrEmpty($serverUri.Query) -and [string]::IsNullOrEmpty($serverUri.Fragment)

$mockValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_USE_MOCK_PRINT_ENGINE", "Machine")
$environmentValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_ENVIRONMENT", "Machine")
$configuredPrinter = [Environment]::GetEnvironmentVariable("PRINT_CESS_PRINTER_NAME", "Machine")
$allowedPrintersValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_ALLOWED_PRINTERS", "Machine")
if ($null -eq $allowedPrintersValue) { $allowedPrintersValue = "" }
$allowedPrinters = @($allowedPrintersValue.Split(
    ',',
    [StringSplitOptions]::RemoveEmptyEntries
) | ForEach-Object { $_.Trim() })
$allowedBlobHostsValue = [Environment]::GetEnvironmentVariable("PRINT_CESS_ALLOWED_BLOB_HOSTS", "Machine")
if ($null -eq $allowedBlobHostsValue) { $allowedBlobHostsValue = "" }
$allowedBlobHosts = @($allowedBlobHostsValue.Split(
    ',',
    [StringSplitOptions]::RemoveEmptyEntries
) | ForEach-Object { $_.Trim() })
$registrationSecret = [Environment]::GetEnvironmentVariable(
    "PRINT_CESS_KIOSK_REGISTRATION_SECRET",
    "Machine"
)
$adminApiSecret = [Environment]::GetEnvironmentVariable("PRINT_CESS_ADMIN_API_SECRET", "Machine")
$adminPasswordHash = [Environment]::GetEnvironmentVariable("PRINT_CESS_ADMIN_PASSWORD_HASH", "Machine")

$signerCertificate = $signature.SignerCertificate
$timestampCertificate = $signature.TimeStamperCertificate
if ($null -eq $signerCertificate) {
    throw "The target executable does not expose an Authenticode signer certificate."
}
if ($null -eq $timestampCertificate) {
    throw "The target executable does not expose an Authenticode timestamp certificate."
}

Assert-ApplicationMatchesSigningManifest `
    -Contract $signingContract `
    -ActualFileName $application.Name `
    -ActualLength $application.Length `
    -ActualSha256 $hash.Hash `
    -ActualProductName $version.ProductName `
    -ActualProductVersion $version.ProductVersion `
    -ActualFileVersion $version.FileVersion `
    -ActualSignatureStatus ([string]$signature.Status) `
    -ActualSignerSubject $signerCertificate.Subject `
    -ActualSignerThumbprint $signerCertificate.Thumbprint `
    -ActualTimestampSubject $timestampCertificate.Subject `
    -ActualTimestampThumbprint $timestampCertificate.Thumbprint

$a4Configured = $printerConfiguration.PaperSize -match "A4"
$oneSidedConfigured = $printerConfiguration.DuplexingMode -match "OneSided"
$grayscaleConfigured = $printerConfiguration.Color -eq $false
$printerAvailable = -not $printerCim.WorkOffline -and [int]$printerCim.PrinterStatus -notin @(6, 7)
$signerSubject = $signerCertificate.Subject
$signerThumbprint = Normalize-CertificateThumbprint $signerCertificate.Thumbprint
$timeStamperSubject = $timestampCertificate.Subject
$timeStamperThumbprint = Normalize-CertificateThumbprint $timestampCertificate.Thumbprint

$checks = @(
    New-Check "application-product" ($version.ProductName -eq "Print-cess by Paradiso") "Exact product metadata"
    New-Check "authenticode-valid" ($signature.Status -eq "Valid") ([string]$signature.Status)
    New-Check "release-identity-approved" $true "Release tag, commit, protocol, and product version matched"
    New-Check "application-hash-approved" $true "Executable length and SHA-256 matched the protected manifest"
    New-Check "publisher-approved-exact" $true "Signer subject matched the protected manifest exactly"
    New-Check "signer-thumbprint-approved" $true "Signer thumbprint matched the independent approval"
    New-Check "timestamp-present" $true "Timestamp certificate matched the protected manifest"
    New-Check "windows-version" ([version]$operatingSystem.Version -ge [version]"10.0.19041") $operatingSystem.Version
    New-Check "x64-device" ($computerSystem.SystemType -match "x64") $computerSystem.SystemType
    New-Check "spooler-running" ($spooler.Status -eq "Running") ([string]$spooler.Status)
    New-Check "printer-online" $printerAvailable "Windows printer availability flags"
    New-Check "paper-a4" $a4Configured ([string]$printerConfiguration.PaperSize)
    New-Check "duplex-one-sided" $oneSidedConfigured ([string]$printerConfiguration.DuplexingMode)
    New-Check "grayscale" $grayscaleConfigured ([string]$printerConfiguration.Color)
    New-Check "mock-disabled" ($mockValue -notmatch "^(?i:true|1|yes)$") "Mock engine is not enabled"
    New-Check "production-environment" ($environmentValue -eq "Production") "Production environment selected"
    New-Check "exact-printer" ($configuredPrinter -ceq $PrinterName) "Configured printer matched"
    New-Check "printer-allow-list" ($allowedPrinters -ccontains $PrinterName) "Printer is explicitly allowed"
    New-Check "server-https-origin" $serverUrlValid "Exact non-loopback HTTPS server origin"
    New-Check "blob-host-allow-list" ($allowedBlobHosts.Count -gt 0) "At least one Blob hostname is allowed"
    New-Check "registration-secret-shape" (Test-SecretShape $registrationSecret 32) "Present with minimum length"
    New-Check "admin-api-secret-shape" (Test-SecretShape $adminApiSecret 32) "Present with minimum length"
    New-Check "admin-password-hash-present" (-not [string]::IsNullOrWhiteSpace($adminPasswordHash)) "Hash is configured"
)

$failedChecks = @($checks | Where-Object { -not $_.passed })
$evidence = [ordered]@{
    schemaVersion = 1
    product = "Print-cess by Paradiso"
    collectedAtUtc = [DateTimeOffset]::UtcNow.ToString("O")
    syntheticDocumentsOnly = $true
    release = [ordered]@{
        tag = $signingContract.ReleaseTag
        commit = $signingContract.WorkflowSha
        protocolVersion = $signingContract.ProtocolVersion
        signingManifestSha256 = $signingManifestHash
    }
    application = [ordered]@{
        fileName = $application.Name
        length = $application.Length
        sha256 = $hash.Hash.ToLowerInvariant()
        productName = $version.ProductName
        productVersion = $version.ProductVersion
        fileVersion = $version.FileVersion
        authenticodeStatus = [string]$signature.Status
        signerSubject = $signerSubject
        signerThumbprint = $signerThumbprint
        signerNotBeforeUtc = $signerCertificate.NotBefore.ToUniversalTime().ToString("O")
        signerNotAfterUtc = $signerCertificate.NotAfter.ToUniversalTime().ToString("O")
        timeStamperSubject = $timeStamperSubject
        timeStamperThumbprint = $timeStamperThumbprint
        timeStamperNotBeforeUtc = $timestampCertificate.NotBefore.ToUniversalTime().ToString("O")
        timeStamperNotAfterUtc = $timestampCertificate.NotAfter.ToUniversalTime().ToString("O")
    }
    windows = [ordered]@{
        caption = $operatingSystem.Caption
        version = $operatingSystem.Version
        buildNumber = $operatingSystem.BuildNumber
        systemType = $computerSystem.SystemType
        spoolerStatus = [string]$spooler.Status
        spoolerStartType = [string]$spooler.StartType
    }
    printer = [ordered]@{
        name = $printer.Name
        driverName = $printer.DriverName
        portName = $printer.PortName
        type = [string]$printer.Type
        shared = $printer.Shared
        workOffline = [bool]$printerCim.WorkOffline
        printerStatus = [int]$printerCim.PrinterStatus
        paperSize = [string]$printerConfiguration.PaperSize
        duplexingMode = [string]$printerConfiguration.DuplexingMode
        color = [bool]$printerConfiguration.Color
    }
    configurationShape = [ordered]@{
        environment = $environmentValue
        mockPrintEngineEnabled = $mockValue -match "^(?i:true|1|yes)$"
        serverIsExactHttpsOrigin = $serverUrlValid
        configuredPrinterMatches = $configuredPrinter -ceq $PrinterName
        allowedPrinterCount = $allowedPrinters.Count
        allowedBlobHostCount = $allowedBlobHosts.Count
        registrationSecretConfigured = Test-SecretShape $registrationSecret 32
        adminApiSecretConfigured = Test-SecretShape $adminApiSecret 32
        adminPasswordHashConfigured = -not [string]::IsNullOrWhiteSpace($adminPasswordHash)
    }
    checks = $checks
    passed = $failedChecks.Count -eq 0
}

$parent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Force $parent | Out-Null
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding utf8

Write-Output "Sanitized acceptance evidence: $OutputPath"
Write-Output "Checks passed: $($checks.Count - $failedChecks.Count)/$($checks.Count)"
if ($failedChecks.Count -gt 0) {
    Write-Error "Windows/printer acceptance preflight failed: $($failedChecks.name -join ', ')"
    exit 1
}
