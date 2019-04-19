$PSVersionTable.PSVersion
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $args[0],$args[1])))
$headers = @{'Authorization'=("Basic {0}" -f $base64AuthInfo);'Accept'='application/json'}
$counter = 0
$planKey = $args[2]
function Write-WarningMessage ($err) {
    Write-Error -Message $err -ErrorAction Continue
    exit 0
}

$platResponse = Invoke-RestMethod -Headers $headers https://bamboo.someCorp.com/rest/api/latest/plan/$($planKey)

If ($platResponse.enabled -eq $false) {
    Write-WarningMessage "`n===================================================`n `nThe related testplan is disabled. Please enable it manually: https://bamboo.someCorp.com/browse/$($planKey)`n `n===================================================`n `n"
}

While ($platResponse.isActive -eq $true) {
    Write-Host "Another build is running. Stand in line..."
    Start-Sleep -Seconds 60
    $platResponse = Invoke-RestMethod -Headers $headers https://bamboo.someCorp.com/rest/api/latest/plan/$($planKey)
    $counter++
    if ($counter -ge 20) {
        Write-WarningMessage "`n===================================================`n `nTimeout expired. Tests've not finished after 20 minutes.`n `n===================================================`n `n"
    }
}

Try { 
    $startBuildResponse = Invoke-RestMethod -Method 'Post'-Headers $headers https://bamboo.someCorp.com/rest/api/latest/queue/$($planKey)
    Write-Host "Build is started:`n$($startBuildResponse)"
} Catch {
    Write-WarningMessage $_.Exception
}

$counter = 0

DO {
    $counter++
    Start-Sleep -Seconds 60
    $response = Invoke-RestMethod -Headers $headers https://bamboo.someCorp.com/rest/api/latest/result/$($planKey)-$($startBuildResponse.buildNumber)
    Write-Host "Testrun in progress..."
} While (($response.state -eq "Unknown") -and ($counter -lt 20))

If ($response.state -eq "Successful") {
    Write-Host "`n===================================================`n `nTests passed!`n `n===================================================`n"
} ElseIf ($counter -ge 20) {
    Write-WarningMessage "`n===================================================`n `nTimeout expired. Build's not finished after 20 minutes.`n `n===================================================`n `n"
} Else {
    Write-WarningMessage "`n===================================================`n `nBuild's status: $($response.state)`n `n===================================================`n `n"
}