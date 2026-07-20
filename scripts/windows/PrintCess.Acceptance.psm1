Set-StrictMode -Version Latest

function Get-RequiredPropertyValue {
    param(
        [Parameter(Mandatory = $true)][AllowNull()][object]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path
    )

    if ($null -eq $InputObject) {
        throw "$Path is required."
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        throw "$Path.$Name is required."
    }
    return $property.Value
}

function Get-RequiredString {
    param(
        [Parameter(Mandatory = $true)][AllowNull()][object]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $value = Get-RequiredPropertyValue -InputObject $InputObject -Name $Name -Path $Path
    if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value)) {
        throw "$Path.$Name must be a non-empty string."
    }
    return $value
}

function Assert-StringEqual {
    param(
        [Parameter(Mandatory = $true)][string]$Actual,
        [Parameter(Mandatory = $true)][string]$Expected,
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$IgnoreCase
    )

    $comparison = if ($IgnoreCase) {
        [StringComparison]::OrdinalIgnoreCase
    } else {
        [StringComparison]::Ordinal
    }
    if (-not [string]::Equals($Actual, $Expected, $comparison)) {
        throw "$Path does not match the approved value."
    }
}

function Assert-TrueProperty {
    param(
        [Parameter(Mandatory = $true)][AllowNull()][object]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $value = Get-RequiredPropertyValue -InputObject $InputObject -Name $Name -Path $Path
    if ($value -isnot [bool] -or -not $value) {
        throw "$Path.$Name must be true."
    }
}

function Assert-RoundTripTimestamp {
    param(
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $parsed = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse(
        $Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$parsed
    )) {
        throw "$Path must be a round-trip timestamp."
    }
    return $parsed
}

function Normalize-CertificateThumbprint {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Value)

    $normalized = ($Value -replace '\s', '').ToUpperInvariant()
    if ($normalized -notmatch '^[0-9A-F]{40}$') {
        throw "Certificate thumbprints must contain exactly 40 hexadecimal characters."
    }
    return $normalized
}

function Assert-SigningManifestContract {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][AllowNull()][object]$Manifest,
        [Parameter(Mandatory = $true)][string]$ExpectedReleaseTag,
        [Parameter(Mandatory = $true)][string]$ExpectedCommitSha,
        [Parameter(Mandatory = $true)][string]$ExpectedSignerThumbprint
    )

    if ($ExpectedReleaseTag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
        throw "ExpectedReleaseTag must be an approved stable or prerelease SemVer tag."
    }
    if ($ExpectedCommitSha -notmatch '^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$') {
        throw "ExpectedCommitSha must be a full Git object ID."
    }

    $expectedCommit = $ExpectedCommitSha.ToLowerInvariant()
    $expectedThumbprint = Normalize-CertificateThumbprint $ExpectedSignerThumbprint
    $schemaVersion = Get-RequiredPropertyValue $Manifest "schemaVersion" "manifest"
    if ([int]$schemaVersion -ne 1) { throw "manifest.schemaVersion must be 1." }

    $product = Get-RequiredString $Manifest "product" "manifest"
    Assert-StringEqual $product "Print-cess by Paradiso" "manifest.product"
    $releaseTag = Get-RequiredString $Manifest "releaseTag" "manifest"
    Assert-StringEqual $releaseTag $ExpectedReleaseTag "manifest.releaseTag"
    $workflowSha = (Get-RequiredString $Manifest "workflowSha" "manifest").ToLowerInvariant()
    Assert-StringEqual $workflowSha $expectedCommit "manifest.workflowSha"
    $protocolVersion = Get-RequiredPropertyValue $Manifest "protocolVersion" "manifest"
    if ([int]$protocolVersion -ne 1) { throw "manifest.protocolVersion must be 1." }
    $generatedAt = Get-RequiredString $Manifest "generatedAtUtc" "manifest"
    $null = Assert-RoundTripTimestamp $generatedAt "manifest.generatedAtUtc"
    Assert-TrueProperty $Manifest "passed" "manifest"

    $application = Get-RequiredPropertyValue $Manifest "application" "manifest"
    $fileName = Get-RequiredString $application "fileName" "manifest.application"
    Assert-StringEqual $fileName "Print-cess Kiosk.exe" "manifest.application.fileName"
    $length = [long](Get-RequiredPropertyValue $application "length" "manifest.application")
    if ($length -le 0) { throw "manifest.application.length must be positive." }
    $applicationSha256 = (Get-RequiredString $application "sha256" "manifest.application").ToLowerInvariant()
    if ($applicationSha256 -notmatch '^[0-9a-f]{64}$') {
        throw "manifest.application.sha256 must be a full SHA-256 digest."
    }
    $productName = Get-RequiredString $application "productName" "manifest.application"
    Assert-StringEqual $productName "Print-cess by Paradiso" "manifest.application.productName"
    $productVersion = Get-RequiredString $application "productVersion" "manifest.application"
    $expectedProductVersion = $ExpectedReleaseTag.Substring(1) + "+" + $expectedCommit
    Assert-StringEqual $productVersion $expectedProductVersion "manifest.application.productVersion"
    $fileVersion = Get-RequiredString $application "fileVersion" "manifest.application"

    $signature = Get-RequiredPropertyValue $Manifest "signature" "manifest"
    $status = Get-RequiredString $signature "status" "manifest.signature"
    Assert-StringEqual $status "Valid" "manifest.signature.status"
    $signerSubject = Get-RequiredString $signature "signerSubject" "manifest.signature"
    $signerThumbprint = Normalize-CertificateThumbprint (
        Get-RequiredString $signature "signerThumbprint" "manifest.signature"
    )
    Assert-StringEqual $signerThumbprint $expectedThumbprint "manifest.signature.signerThumbprint"
    $signerNotBefore = Assert-RoundTripTimestamp (
        Get-RequiredString $signature "signerNotBeforeUtc" "manifest.signature"
    ) "manifest.signature.signerNotBeforeUtc"
    $signerNotAfter = Assert-RoundTripTimestamp (
        Get-RequiredString $signature "signerNotAfterUtc" "manifest.signature"
    ) "manifest.signature.signerNotAfterUtc"
    if ($signerNotBefore -ge $signerNotAfter) {
        throw "manifest signer certificate validity is inverted or empty."
    }
    Assert-TrueProperty $signature "timestampPresent" "manifest.signature"
    $timestampSubject = Get-RequiredString $signature "timestampSubject" "manifest.signature"
    $timestampThumbprint = Normalize-CertificateThumbprint (
        Get-RequiredString $signature "timestampThumbprint" "manifest.signature"
    )
    $timestampNotBefore = Assert-RoundTripTimestamp (
        Get-RequiredString $signature "timestampNotBeforeUtc" "manifest.signature"
    ) "manifest.signature.timestampNotBeforeUtc"
    $timestampNotAfter = Assert-RoundTripTimestamp (
        Get-RequiredString $signature "timestampNotAfterUtc" "manifest.signature"
    ) "manifest.signature.timestampNotAfterUtc"
    if ($timestampNotBefore -ge $timestampNotAfter) {
        throw "manifest timestamp certificate validity is inverted or empty."
    }

    $policy = Get-RequiredPropertyValue $Manifest "policy" "manifest"
    Assert-StringEqual (
        Get-RequiredString $policy "fileDigest" "manifest.policy"
    ) "SHA256" "manifest.policy.fileDigest"
    Assert-StringEqual (
        Get-RequiredString $policy "timestampDigest" "manifest.policy"
    ) "SHA256" "manifest.policy.timestampDigest"
    $expectedPublisherSubject = Get-RequiredString $policy "expectedPublisherSubject" "manifest.policy"
    Assert-StringEqual $expectedPublisherSubject $signerSubject "manifest.policy.expectedPublisherSubject" -IgnoreCase
    $policyThumbprint = Normalize-CertificateThumbprint (
        Get-RequiredString $policy "expectedSignerThumbprint" "manifest.policy"
    )
    Assert-StringEqual $policyThumbprint $expectedThumbprint "manifest.policy.expectedSignerThumbprint"
    Assert-TrueProperty $policy "expectedPublisherSubjectMatched" "manifest.policy"
    Assert-TrueProperty $policy "expectedSignerThumbprintMatched" "manifest.policy"
    Assert-TrueProperty $policy "signToolVerified" "manifest.policy"
    $flags = @(Get-RequiredPropertyValue $policy "verificationFlags" "manifest.policy")
    foreach ($requiredFlag in @("/pa", "/all", "/tw", "/v")) {
        if ($flags -cnotcontains $requiredFlag) {
            throw "manifest.policy.verificationFlags is missing $requiredFlag."
        }
    }

    return [pscustomobject]@{
        ReleaseTag = $releaseTag
        WorkflowSha = $workflowSha
        ProtocolVersion = [int]$protocolVersion
        ApplicationFileName = $fileName
        ApplicationLength = $length
        ApplicationSha256 = $applicationSha256
        ProductName = $productName
        ProductVersion = $productVersion
        FileVersion = $fileVersion
        SignerSubject = $signerSubject
        SignerThumbprint = $signerThumbprint
        TimestampSubject = $timestampSubject
        TimestampThumbprint = $timestampThumbprint
    }
}

function Assert-ApplicationMatchesSigningManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][object]$Contract,
        [Parameter(Mandatory = $true)][string]$ActualFileName,
        [Parameter(Mandatory = $true)][long]$ActualLength,
        [Parameter(Mandatory = $true)][string]$ActualSha256,
        [Parameter(Mandatory = $true)][string]$ActualProductName,
        [Parameter(Mandatory = $true)][string]$ActualProductVersion,
        [Parameter(Mandatory = $true)][string]$ActualFileVersion,
        [Parameter(Mandatory = $true)][string]$ActualSignatureStatus,
        [Parameter(Mandatory = $true)][string]$ActualSignerSubject,
        [Parameter(Mandatory = $true)][string]$ActualSignerThumbprint,
        [Parameter(Mandatory = $true)][string]$ActualTimestampSubject,
        [Parameter(Mandatory = $true)][string]$ActualTimestampThumbprint
    )

    Assert-StringEqual $ActualFileName $Contract.ApplicationFileName "application.fileName"
    if ($ActualLength -ne $Contract.ApplicationLength) {
        throw "application.length does not match the protected signing manifest."
    }
    Assert-StringEqual ($ActualSha256.ToLowerInvariant()) $Contract.ApplicationSha256 "application.sha256"
    Assert-StringEqual $ActualProductName $Contract.ProductName "application.productName"
    Assert-StringEqual $ActualProductVersion $Contract.ProductVersion "application.productVersion"
    Assert-StringEqual $ActualFileVersion $Contract.FileVersion "application.fileVersion"
    Assert-StringEqual $ActualSignatureStatus "Valid" "application.authenticodeStatus"
    Assert-StringEqual $ActualSignerSubject $Contract.SignerSubject "application.signerSubject" -IgnoreCase
    Assert-StringEqual (
        Normalize-CertificateThumbprint $ActualSignerThumbprint
    ) $Contract.SignerThumbprint "application.signerThumbprint"
    Assert-StringEqual $ActualTimestampSubject $Contract.TimestampSubject "application.timestampSubject" -IgnoreCase
    Assert-StringEqual (
        Normalize-CertificateThumbprint $ActualTimestampThumbprint
    ) $Contract.TimestampThumbprint "application.timestampThumbprint"
}

Export-ModuleMember -Function @(
    "Normalize-CertificateThumbprint",
    "Assert-SigningManifestContract",
    "Assert-ApplicationMatchesSigningManifest"
)
