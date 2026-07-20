[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "PrintCess.Acceptance.psm1") -Force -DisableNameChecking

$script:passed = 0
$commit = "a" * 40
$signerThumbprint = "1" * 40
$timestampThumbprint = "2" * 40

function New-ValidManifest {
    return [pscustomobject]@{
        schemaVersion = 1
        product = "Print-cess by Paradiso"
        releaseTag = "v1.2.3-rc.4"
        workflowSha = $commit
        protocolVersion = 1
        generatedAtUtc = "2026-07-20T08:00:00.0000000+00:00"
        application = [pscustomobject]@{
            fileName = "Print-cess Kiosk.exe"
            length = 4096
            sha256 = "b" * 64
            productName = "Print-cess by Paradiso"
            productVersion = "1.2.3-rc.4+$commit"
            fileVersion = "1.2.3.0"
        }
        signature = [pscustomobject]@{
            status = "Valid"
            signerSubject = "CN=Paradiso Test"
            signerThumbprint = $signerThumbprint
            signerNotBeforeUtc = "2026-01-01T00:00:00.0000000+00:00"
            signerNotAfterUtc = "2027-01-01T00:00:00.0000000+00:00"
            timestampPresent = $true
            timestampSubject = "CN=Timestamp Test"
            timestampThumbprint = $timestampThumbprint
            timestampNotBeforeUtc = "2026-01-01T00:00:00.0000000+00:00"
            timestampNotAfterUtc = "2030-01-01T00:00:00.0000000+00:00"
        }
        policy = [pscustomobject]@{
            fileDigest = "SHA256"
            timestampDigest = "SHA256"
            verificationFlags = @("/pa", "/all", "/tw", "/v")
            expectedPublisherSubject = "CN=Paradiso Test"
            expectedSignerThumbprint = $signerThumbprint
            expectedPublisherSubjectMatched = $true
            expectedSignerThumbprintMatched = $true
            signToolVerified = $true
        }
        passed = $true
    }
}

function Copy-Manifest {
    param([Parameter(Mandatory = $true)][object]$Manifest)
    return $Manifest | ConvertTo-Json -Depth 8 | ConvertFrom-Json
}

function Assert-Passes {
    param([Parameter(Mandatory = $true)][scriptblock]$Action)
    & $Action
    $script:passed += 1
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$Pattern
    )
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "Expected error matching '$Pattern', got '$($_.Exception.Message)'."
        }
        $script:passed += 1
        return
    }
    throw "Expected an error matching '$Pattern'."
}

$valid = New-ValidManifest
Assert-Passes {
    $script:contract = Assert-SigningManifestContract `
        -Manifest $valid `
        -ExpectedReleaseTag "v1.2.3-rc.4" `
        -ExpectedCommitSha $commit `
        -ExpectedSignerThumbprint $signerThumbprint
}

Assert-Passes {
    Assert-ApplicationMatchesSigningManifest `
        -Contract $script:contract `
        -ActualFileName "Print-cess Kiosk.exe" `
        -ActualLength 4096 `
        -ActualSha256 ("b" * 64) `
        -ActualProductName "Print-cess by Paradiso" `
        -ActualProductVersion "1.2.3-rc.4+$commit" `
        -ActualFileVersion "1.2.3.0" `
        -ActualSignatureStatus "Valid" `
        -ActualSignerSubject "CN=Paradiso Test" `
        -ActualSignerThumbprint $signerThumbprint `
        -ActualTimestampSubject "CN=Timestamp Test" `
        -ActualTimestampThumbprint $timestampThumbprint
}

$wrongCommit = Copy-Manifest $valid
$wrongCommit.workflowSha = "c" * 40
Assert-Throws {
    Assert-SigningManifestContract $wrongCommit "v1.2.3-rc.4" $commit $signerThumbprint
} "workflowSha"

$wrongVersion = Copy-Manifest $valid
$wrongVersion.application.productVersion = "1.2.3-rc.4+$("c" * 40)"
Assert-Throws {
    Assert-SigningManifestContract $wrongVersion "v1.2.3-rc.4" $commit $signerThumbprint
} "productVersion"

$wrongSigner = Copy-Manifest $valid
$wrongSigner.signature.signerThumbprint = "3" * 40
Assert-Throws {
    Assert-SigningManifestContract $wrongSigner "v1.2.3-rc.4" $commit $signerThumbprint
} "signerThumbprint"

$missingTimestamp = Copy-Manifest $valid
$missingTimestamp.signature.timestampPresent = $false
Assert-Throws {
    Assert-SigningManifestContract $missingTimestamp "v1.2.3-rc.4" $commit $signerThumbprint
} "timestampPresent"

$missingTimestampWarning = Copy-Manifest $valid
$missingTimestampWarning.policy.verificationFlags = @("/pa", "/all", "/v")
Assert-Throws {
    Assert-SigningManifestContract $missingTimestampWarning "v1.2.3-rc.4" $commit $signerThumbprint
} "/tw"

$unverified = Copy-Manifest $valid
$unverified.policy.signToolVerified = $false
Assert-Throws {
    Assert-SigningManifestContract $unverified "v1.2.3-rc.4" $commit $signerThumbprint
} "signToolVerified"

Assert-Throws {
    Assert-ApplicationMatchesSigningManifest `
        -Contract $script:contract `
        -ActualFileName "Print-cess Kiosk.exe" `
        -ActualLength 4096 `
        -ActualSha256 ("c" * 64) `
        -ActualProductName "Print-cess by Paradiso" `
        -ActualProductVersion "1.2.3-rc.4+$commit" `
        -ActualFileVersion "1.2.3.0" `
        -ActualSignatureStatus "Valid" `
        -ActualSignerSubject "CN=Paradiso Test" `
        -ActualSignerThumbprint $signerThumbprint `
        -ActualTimestampSubject "CN=Timestamp Test" `
        -ActualTimestampThumbprint $timestampThumbprint
} "sha256"

Write-Output "Acceptance policy tests passed: $script:passed"
