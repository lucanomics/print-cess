using System.Diagnostics;
using System.IO;
using System.Media;
using System.Windows;
using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Infrastructure.Admin;
using Paradiso.PrintCess.Infrastructure.Recovery;

namespace Paradiso.PrintCess.Kiosk.Views;

public partial class AdminStatusWindow : Window
{
    private const int OrphanSweepLimit = 25;
    private readonly IPrintSubmissionJournal? _journal;
    private readonly IKioskAdminRuntime? _runtime;
    private readonly bool _recoverySucceeded;
    private string? _currentPrinterName;

    public AdminStatusWindow(
        PrintRecoveryReport recoveryReport,
        IPrintSubmissionJournal? journal,
        IKioskAdminRuntime? runtime)
    {
        InitializeComponent();
        _journal = journal;
        _runtime = runtime;
        _recoverySucceeded = recoveryReport.Succeeded;
        RecoveryStatus.Text = recoveryReport.Succeeded
            ? $"정상 · 자동 재출력 차단 {recoveryReport.BlockedSubmissions}건"
            : $"확인 필요 · {recoveryReport.SafeCode}";
        ResolveRecoveryButton.IsEnabled = recoveryReport.BlockedSubmissions > 0 && journal is not null;
        RefreshDiagnostics();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_recoverySucceeded && _journal is not null)
        {
            await RefreshRecoveryStatusAsync();
        }

        if (_runtime?.GetDiagnostics().AdminServerOperationsConfigured == true)
        {
            await RefreshServiceHealthAsync(showProgress: false);
        }
    }

    private void RefreshDiagnostics()
    {
        if (_runtime is null)
        {
            RuntimeStatus.Text = "구성 오류 또는 복구 실패로 런타임이 시작되지 않음";
            PrinterStatus.Text = "상태 확인 불가";
            PrinterSelector.ItemsSource = null;
            SelectPrinterButton.IsEnabled = false;
            SessionStatus.Text = "활성 세션 없음";
            ServerHealthStatus.Text = "확인 불가";
            SessionStoreStatus.Text = "관측 기록 없음";
            BlobStatus.Text = "관측 기록 없음";
            CleanupStatus.Text = "관측 기록 없음";
            HealthCheckedStatus.Text = "관리자 서버 작업을 사용할 수 없습니다.";
            RefreshHealthButton.IsEnabled = false;
            SweepOrphansButton.IsEnabled = false;
            TestPrintButton.IsEnabled = false;
            ForceDiscardButton.IsEnabled = false;
            return;
        }

        var diagnostics = _runtime.GetDiagnostics();
        RuntimeStatus.Text = diagnostics.IsRunning
            ? diagnostics.UsesMockPrinter ? "동작 중 · 명시적으로 활성화된 MockPrintEngine" : "동작 중 · WindowsPrintEngine"
            : "중지됨";
        _currentPrinterName = diagnostics.PrinterName;
        PrinterStatus.Text = $"{diagnostics.PrinterName} · {PrinterStateText(diagnostics.PrinterState)}";
        PrinterSelector.ItemsSource = diagnostics.AvailablePrinterNames;
        PrinterSelector.SelectedItem = diagnostics.PrinterName;
        SessionStatus.Text = diagnostics.HasActiveSession
            ? diagnostics.CurrentSessionConsumed ? "활성 · 암호화 파일 소비됨" : "활성 · 파일 소비 전"
            : "활성 세션 없음";
        ServerHealthStatus.Text = HealthText(
            diagnostics.ServiceHealth.Server,
            diagnostics.LastServerSuccessUtc,
            "최근 세션 API 성공");
        SessionStoreStatus.Text = HealthText(
            diagnostics.ServiceHealth.SessionStore,
            diagnostics.LastServerSuccessUtc,
            "최근 세션 저장소 경유 API 성공");
        BlobStatus.Text = HealthText(
            diagnostics.ServiceHealth.Blob,
            diagnostics.LastBlobSuccessUtc,
            "최근 암호화 Blob 다운로드 성공");
        CleanupStatus.Text = HealthText(
            diagnostics.ServiceHealth.Cleanup,
            diagnostics.LastCleanupAcknowledgedUtc,
            "최근 서버 정리 승인");
        HealthCheckedStatus.Text = diagnostics.ServiceHealth.CheckedAtUtc == DateTimeOffset.MinValue
            ? diagnostics.AdminServerOperationsConfigured
                ? "아직 관리자 health endpoint를 확인하지 않았습니다."
                : "관리자 서버 자격증명이 구성되지 않아 live health와 고아 정리를 사용할 수 없습니다."
            : $"마지막 health 확인 · {diagnostics.ServiceHealth.CheckedAtUtc.ToLocalTime():yyyy-MM-dd HH:mm:ss}";
        RefreshHealthButton.IsEnabled = diagnostics.IsRunning && diagnostics.AdminServerOperationsConfigured;
        SweepOrphansButton.IsEnabled = diagnostics.IsRunning && diagnostics.AdminServerOperationsConfigured;
        TestPrintButton.IsEnabled = diagnostics.IsRunning &&
            !diagnostics.HasActiveSession &&
            diagnostics.PrinterState == PrinterState.Ready;
        ForceDiscardButton.IsEnabled = diagnostics.IsRunning && diagnostics.HasActiveSession;
        UpdatePrinterSelectionButton(diagnostics.CurrentSessionConsumed);
    }

    private async void OnResolveRecovery(object sender, RoutedEventArgs e)
    {
        if (_journal is null)
        {
            return;
        }

        ResolveRecoveryButton.IsEnabled = false;
        try
        {
            var resolved = await _journal.ResolveBlockedAsync(CancellationToken.None);
            RecoveryStatus.Text = $"관리자가 확인한 복구 차단 기록 {resolved}건 · 자동 재출력 없음";
            ResolveRecoveryButton.IsEnabled = false;
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            RecoveryStatus.Text = "복구 기록을 갱신할 수 없음 · RECOVERY-FAILED";
        }
    }

    private async void OnRefresh(object sender, RoutedEventArgs e) =>
        await RefreshServiceHealthAsync(showProgress: true);

    private void OnPrinterSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        var consumed = _runtime?.GetDiagnostics().CurrentSessionConsumed ?? true;
        UpdatePrinterSelectionButton(consumed);
    }

    private async void OnSelectPrinter(object sender, RoutedEventArgs e)
    {
        if (_runtime is null || PrinterSelector.SelectedItem is not string selectedPrinter ||
            string.Equals(selectedPrinter, _currentPrinterName, StringComparison.Ordinal))
        {
            return;
        }

        if (MessageBox.Show(
                this,
                $"승인된 프린터를 ‘{selectedPrinter}’(으)로 바꿀까요? 대기 중인 QR 세션은 폐기하고 새 QR로 교체합니다.",
                "프린터 선택 변경",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            PrinterSelector.SelectedItem = _currentPrinterName;
            return;
        }

        SelectPrinterButton.IsEnabled = false;
        ActionStatus.Text = "대기 세션을 정리하고 프린터 선택을 저장하고 있습니다…";
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try
        {
            var result = await _runtime.SelectPrinterAsync(selectedPrinter, timeout.Token);
            ActionStatus.Text = result.CleanupConfirmed
                ? $"프린터를 ‘{result.PrinterName}’(으)로 변경했고 새 QR 세션을 준비했습니다."
                : $"프린터를 ‘{result.PrinterName}’(으)로 변경했습니다. 이전 세션 정리는 서버 TTL과 지연 작업으로 계속됩니다.";
        }
        catch (OperationCanceledException)
        {
            ActionStatus.Text = "프린터 변경 확인 시간이 초과되었습니다 · N-02";
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or ArgumentException)
        {
            ActionStatus.Text = "프린터를 변경할 수 없습니다. 승인 목록, 설치 상태, 세션 상태를 확인하세요 · P-02";
        }
        finally
        {
            RefreshDiagnostics();
        }
    }

    private async void OnSweepOrphans(object sender, RoutedEventArgs e)
    {
        if (_runtime is null || MessageBox.Show(
                this,
                $"기한이 지난 암호문 고아 기록을 최대 {OrphanSweepLimit}건 정리할까요? 활성 consume/인쇄 lease는 서버가 보존합니다.",
                "고아 정리 실행",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            return;
        }

        SweepOrphansButton.IsEnabled = false;
        ActionStatus.Text = $"기한이 지난 고아 기록을 최대 {OrphanSweepLimit}건 확인하고 있습니다…";
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            var result = await _runtime.SweepDueOrphansAsync(OrphanSweepLimit, timeout.Token);
            ActionStatus.Text = result.Failed == 0
                ? $"고아 정리 완료 · 확인 {result.Attempted}건, 삭제 {result.Deleted}건, lease 보류 {result.Deferred}건"
                : $"고아 정리 일부 실패 · 확인 {result.Attempted}건, 삭제 {result.Deleted}건, 보류 {result.Deferred}건, 실패 {result.Failed}건 · S-02";
        }
        catch (OperationCanceledException)
        {
            ActionStatus.Text = "고아 정리 확인 시간이 초과되었습니다 · S-02";
        }
        catch (AdminOperationsException)
        {
            ActionStatus.Text = "고아 정리 요청을 승인받지 못했습니다 · S-02";
        }
        finally
        {
            RefreshDiagnostics();
        }
    }

    private async void OnTestPrint(object sender, RoutedEventArgs e)
    {
        if (_runtime is null)
        {
            return;
        }

        TestPrintButton.IsEnabled = false;
        ActionStatus.Text = "A4 흑백 테스트 페이지를 스풀러에 제출하고 있습니다…";
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(1));
        try
        {
            var result = await _runtime.PrintTestPageAsync(timeout.Token);
            ActionStatus.Text = result.Outcome switch
            {
                PrintOutcome.Submitted => "스풀러가 테스트 페이지를 승인했습니다. 실제 출력은 출력구에서 확인하세요.",
                PrintOutcome.Completed => "MockPrintEngine 테스트 기록이 생성되었습니다.",
                _ => $"테스트 인쇄가 승인되지 않았습니다 · {result.Code}",
            };
        }
        catch (OperationCanceledException)
        {
            ActionStatus.Text = "테스트 인쇄 확인 시간이 초과되었습니다 · P-04";
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or ArgumentException or DocumentValidationException)
        {
            ActionStatus.Text = "테스트 인쇄를 시작할 수 없습니다 · P-03";
        }
        finally
        {
            RefreshDiagnostics();
        }
    }

    private async void OnForceDiscard(object sender, RoutedEventArgs e)
    {
        if (_runtime is null || MessageBox.Show(
                this,
                "현재 세션을 중단하고 서버 정리를 요청할까요? 인쇄 제출이 이미 시작된 경우 재출력하지 않습니다.",
                "현재 세션 강제 폐기",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            return;
        }

        ForceDiscardButton.IsEnabled = false;
        ActionStatus.Text = "현재 세션을 중단하고 있습니다…";
        try
        {
            var result = await _runtime.ForceDiscardCurrentSessionAsync();
            ActionStatus.Text = !result.HadActiveSession
                ? "폐기할 활성 세션이 없었습니다. 새 세션을 준비했습니다."
                : result.CleanupConfirmed
                    ? "현재 세션을 폐기했고 서버가 정리 요청을 승인했습니다."
                    : "현재 세션을 폐기했습니다. 서버 정리는 지연 작업과 TTL로 계속됩니다.";
        }
        catch (ObjectDisposedException)
        {
            ActionStatus.Text = "런타임이 이미 중지되었습니다 · A-01";
        }
        finally
        {
            RefreshDiagnostics();
        }
    }

    private void OnAudioTest(object sender, RoutedEventArgs e)
    {
        SystemSounds.Asterisk.Play();
        ActionStatus.Text = "완료 알림음을 재생했습니다.";
    }

    private void OnRestart(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(
                this,
                "앱을 안전하게 다시 시작할까요? 미확정 인쇄 기록은 다음 시작에서 자동 재출력되지 않습니다.",
                "Print-cess by Paradiso 다시 시작",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question) != MessageBoxResult.Yes)
        {
            return;
        }

        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable))
        {
            ActionStatus.Text = "실행 파일 경로를 확인할 수 없습니다 · A-01";
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(executable) { UseShellExecute = true });
            Application.Current.Shutdown();
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            ActionStatus.Text = "앱을 다시 시작할 수 없습니다 · A-01";
        }
    }

    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private async Task RefreshRecoveryStatusAsync()
    {
        try
        {
            var records = await _journal!.ReadAllAsync(CancellationToken.None);
            var blocked = records.Count(static record => record.State == PrintJournalState.RecoveryBlocked);
            RecoveryStatus.Text = $"정상 · 자동 재출력 차단 {blocked}건";
            ResolveRecoveryButton.IsEnabled = blocked > 0;
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            RecoveryStatus.Text = "복구 기록을 읽을 수 없음 · RECOVERY-FAILED";
            ResolveRecoveryButton.IsEnabled = false;
        }
    }

    private async Task RefreshServiceHealthAsync(bool showProgress)
    {
        if (_runtime is null)
        {
            return;
        }

        RefreshHealthButton.IsEnabled = false;
        if (showProgress)
        {
            ActionStatus.Text = "서버와 공급자 health를 확인하고 있습니다…";
        }

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try
        {
            var health = await _runtime.RefreshServiceHealthAsync(timeout.Token);
            if (showProgress)
            {
                ActionStatus.Text = health.Server == AdminProviderStatus.VerifiedReady &&
                    health.SessionStore == AdminProviderStatus.VerifiedReady &&
                    health.Blob != AdminProviderStatus.Unavailable &&
                    health.Cleanup != AdminProviderStatus.Unavailable
                    ? "health 확인을 완료했습니다. ‘구성 확인’은 live 공급자 작업 검증이 아닙니다."
                    : "하나 이상의 필수 서비스가 응답하지 않습니다 · N-02";
            }
        }
        catch (OperationCanceledException)
        {
            ActionStatus.Text = "health 확인 시간이 초과되었습니다 · N-02";
        }
        catch (AdminOperationsException)
        {
            ActionStatus.Text = "관리자 health endpoint를 확인할 수 없습니다 · N-02";
        }
        finally
        {
            RefreshDiagnostics();
        }
    }

    private void UpdatePrinterSelectionButton(bool currentSessionConsumed)
    {
        SelectPrinterButton.IsEnabled = _runtime is not null &&
            !currentSessionConsumed &&
            PrinterSelector.SelectedItem is string selected &&
            !string.Equals(selected, _currentPrinterName, StringComparison.Ordinal);
    }

    private static string HealthText(
        AdminProviderStatus status,
        DateTimeOffset? lastOperationalSuccess,
        string observationLabel) => status switch
        {
            AdminProviderStatus.VerifiedReady => "정상 · live 확인됨",
            AdminProviderStatus.ConfiguredUnverified => "구성 확인 · 공급자 live 작업은 검증하지 않음",
            AdminProviderStatus.Unavailable => "사용 불가 · 운영 확인 필요",
            _ when lastOperationalSuccess is not null =>
                $"health 확인 전 · {observationLabel} {lastOperationalSuccess.Value.ToLocalTime():yyyy-MM-dd HH:mm:ss}",
            _ => "health 확인 전 · 최근 성공 관측 없음",
        };

    private static string PrinterStateText(PrinterState state) => state switch
    {
        PrinterState.Ready => "준비됨",
        PrinterState.Offline => "오프라인",
        PrinterState.OutOfPaper => "용지 없음",
        PrinterState.Paused => "일시 중지",
        PrinterState.Error => "확인 필요",
        _ => "상태 알 수 없음",
    };
}
