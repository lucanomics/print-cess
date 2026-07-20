using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using System.Windows.Threading;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Infrastructure.Recovery;

namespace Paradiso.PrintCess.Kiosk.ViewModels;

public sealed class MainViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly DispatcherTimer _timer;
    private readonly string _productName = "Print-cess by Paradiso";
    private KioskUiState _state = KioskUiState.Preparing;
    private DateTimeOffset? _deadline;
    private ImageSource? _qrCodeImage;
    private string _statusLabel = "준비";
    private string _primaryInstruction = "새 인쇄 세션을 준비하고 있습니다";
    private string _secondaryInstruction = "잠시만 기다려 주세요";
    private string _countdownText = string.Empty;
    private string _safeErrorCode = string.Empty;
    private bool _disposed;

    public MainViewModel(bool isSimulator = false)
    {
        IsSimulator = isSimulator;
        _timer = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromSeconds(1),
        };
        _timer.Tick += OnTimerTick;
        _timer.Start();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public event EventHandler? FreshSessionRequested;

    public event EventHandler? CompletionAnnounced;

    public string ProductName => _productName;

    public bool IsSimulator { get; }

    public string StatusLabel
    {
        get => _statusLabel;
        private set => SetField(ref _statusLabel, value);
    }

    public string PrimaryInstruction
    {
        get => _primaryInstruction;
        private set => SetField(ref _primaryInstruction, value);
    }

    public string SecondaryInstruction
    {
        get => _secondaryInstruction;
        private set => SetField(ref _secondaryInstruction, value);
    }

    public string CountdownText
    {
        get => _countdownText;
        private set => SetField(ref _countdownText, value);
    }

    public string SafeErrorCode
    {
        get => _safeErrorCode;
        private set => SetField(ref _safeErrorCode, value);
    }

    public ImageSource? QrCodeImage
    {
        get => _qrCodeImage;
        private set => SetField(ref _qrCodeImage, value);
    }

    public KioskUiState State
    {
        get => _state;
        private set => SetField(ref _state, value);
    }

    public void ApplyRecovery(PrintRecoveryReport report)
    {
        if (!report.Succeeded)
        {
            Suspend("A-01");
            return;
        }

        PrepareForFreshSession();
    }

    public void RequestFreshSession() => PrepareForFreshSession();

    public void ShowWaiting(ImageSource qrCodeImage, DateTimeOffset expiresAt)
    {
        ArgumentNullException.ThrowIfNull(qrCodeImage);
        QrCodeImage = qrCodeImage;
        _deadline = expiresAt;
        SafeErrorCode = string.Empty;
        State = KioskUiState.Waiting;
        StatusLabel = "준비";
        PrimaryInstruction = "휴대전화 카메라로 QR코드를 스캔하세요";
        SecondaryInstruction = "Wi-Fi는 필요하지 않습니다. 휴대전화 모바일 데이터를 사용하세요";
        UpdateCountdown();
    }

    public void ShowClaimed()
    {
        ClearQr();
        SetProgress(KioskUiState.Claimed, "휴대전화 연결됨", "휴대전화에서 문서를 선택해 주세요", "PDF, JPG, PNG 파일 한 개를 보낼 수 있습니다", preserveDeadline: true);
    }

    public void ShowUploading() =>
        SetProgress(KioskUiState.Uploading, "파일 전송 중", "문서를 안전하게 전송하고 있습니다", "화면을 닫지 말아 주세요", preserveDeadline: true);

    public void ShowValidating() =>
        SetProgress(KioskUiState.Validating, "파일 검증 중", "인쇄할 수 있는 문서인지 확인하고 있습니다", "암호화된 문서를 이 컴퓨터에서만 열어 확인합니다");

    public void ShowPrinting() =>
        SetProgress(KioskUiState.Printing, "인쇄 중", "A4 한 부를 인쇄하고 있습니다", "프린터 출력구를 확인해 주세요");

    public void ShowCompleted(bool cleanupConfirmed = true)
    {
        ClearQr();
        State = KioskUiState.Completed;
        StatusLabel = "출력 완료";
        PrimaryInstruction = "출력물을 가져가세요  ↓";
        SecondaryInstruction = cleanupConfirmed
            ? "전송된 파일과 암호화 키를 삭제했습니다"
            : "암호화 키를 삭제했고 서버 파일 삭제를 예약했습니다";
        SafeErrorCode = string.Empty;
        _deadline = DateTimeOffset.UtcNow + ProtocolConstants.CompletionScreenDuration;
        UpdateCountdown();
        CompletionAnnounced?.Invoke(this, EventArgs.Empty);
    }

    public void ShowSessionError(string primary, string nextAction, bool cleanupConfirmed)
    {
        ClearQr();
        State = KioskUiState.SessionError;
        StatusLabel = "문서를 인쇄할 수 없음";
        PrimaryInstruction = primary;
        SecondaryInstruction = cleanupConfirmed
            ? $"{nextAction}\n전송된 파일을 삭제했습니다"
            : $"{nextAction}\n전송된 파일 삭제를 예약했습니다";
        SafeErrorCode = string.Empty;
        _deadline = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(10);
        UpdateCountdown();
    }

    public void Suspend(string safeErrorCode, bool? cleanupConfirmed = null)
    {
        ClearQr();
        State = KioskUiState.Suspended;
        StatusLabel = "서비스 일시 중단";
        PrimaryInstruction = "인쇄 서비스를 잠시 사용할 수 없습니다";
        SecondaryInstruction = cleanupConfirmed switch
        {
            true => "전송된 파일을 삭제했습니다",
            false => "암호화 키를 삭제했고 서버 파일 삭제를 예약했습니다",
            null => "직원에게 아래 오류 코드를 알려 주세요",
        };
        SafeErrorCode = $"오류 코드: {safeErrorCode}";
        CountdownText = string.Empty;
        _deadline = null;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _timer.Stop();
        _timer.Tick -= OnTimerTick;
        ClearQr();
    }

    private void SetProgress(
        KioskUiState state,
        string status,
        string primary,
        string secondary,
        bool preserveDeadline = false)
    {
        State = state;
        StatusLabel = status;
        PrimaryInstruction = primary;
        SecondaryInstruction = secondary;
        if (!preserveDeadline)
        {
            CountdownText = string.Empty;
            _deadline = null;
        }

        SafeErrorCode = string.Empty;
        UpdateCountdown();
    }

    private void OnTimerTick(object? sender, EventArgs e)
    {
        if (_deadline is null)
        {
            return;
        }

        if (_deadline > DateTimeOffset.UtcNow)
        {
            UpdateCountdown();
            return;
        }

        if (State is KioskUiState.Waiting or KioskUiState.Claimed or KioskUiState.Uploading or KioskUiState.Completed or KioskUiState.SessionError)
        {
            PrepareForFreshSession();
        }
    }

    private void PrepareForFreshSession()
    {
        ClearQr();
        State = KioskUiState.Preparing;
        StatusLabel = "준비";
        PrimaryInstruction = "새 인쇄 세션을 준비하고 있습니다";
        SecondaryInstruction = "이전 사용자의 화면과 데이터는 모두 초기화되었습니다";
        CountdownText = string.Empty;
        SafeErrorCode = string.Empty;
        _deadline = null;
        FreshSessionRequested?.Invoke(this, EventArgs.Empty);
    }

    private void UpdateCountdown()
    {
        if (_deadline is null)
        {
            CountdownText = string.Empty;
            return;
        }

        var seconds = Math.Max(0, (int)Math.Ceiling((_deadline.Value - DateTimeOffset.UtcNow).TotalSeconds));
        CountdownText = State switch
        {
            KioskUiState.Completed or KioskUiState.SessionError => $"{seconds}초 후 새 화면으로 돌아갑니다",
            KioskUiState.Waiting => $"QR 유효 시간 {seconds / 60}:{seconds % 60:00}",
            _ => $"세션 유효 시간 {seconds / 60}:{seconds % 60:00}",
        };
    }

    private void ClearQr()
    {
        QrCodeImage = null;
    }

    private bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        return true;
    }
}
