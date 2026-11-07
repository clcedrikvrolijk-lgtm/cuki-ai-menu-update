# Optional, on-device voice command recognition using the Windows speech engine.
# Listens only for short screen-navigation phrases; no recording is stored or uploaded.
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Speech
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $phrases = @(
        'hey cuki show payment',
        'hey cuki show the club',
        'hey cuki show the menu'
    )
    $choices = New-Object System.Speech.Recognition.Choices
    $choices.Add([string[]]$phrases)
    $grammarBuilder = New-Object System.Speech.Recognition.GrammarBuilder
    $grammarBuilder.Culture = $recognizer.RecognizerInfo.Culture
    $grammarBuilder.Append($choices)
    $grammar = New-Object System.Speech.Recognition.Grammar($grammarBuilder)
    $recognizer.LoadGrammar($grammar)
    $recognizer.SetInputToDefaultAudioDevice()
    [Console]::Out.WriteLine('READY')
    [Console]::Out.Flush()
    while ($true) {
        $result = $recognizer.Recognize([TimeSpan]::FromSeconds(3))
        if ($null -ne $result -and $result.Confidence -ge 0.64) {
            [Console]::Out.WriteLine('CMD:' + $result.Text)
            [Console]::Out.Flush()
        }
    }
} catch {
    [Console]::Out.WriteLine('ERROR:' + $_.Exception.Message)
    [Console]::Out.Flush()
    exit 1
}
