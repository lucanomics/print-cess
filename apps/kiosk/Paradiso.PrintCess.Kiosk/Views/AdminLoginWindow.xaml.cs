using System.Runtime.InteropServices;
using System.Security;
using System.Windows;
using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Core.Security;
using Paradiso.PrintCess.Infrastructure.Recovery;

namespace Paradiso.PrintCess.Kiosk.Views;

public partial class AdminLoginWindow : Window
{
    private readonly IAdminAuthenticator _authenticator;
    private readonly AdminAuthenticationThrottle _throttle;
    private readonly PrintRecoveryReport _recoveryReport;
    private readonly IPrintSubmissionJournal? _journal;
    private readonly IKioskAdminRuntime? _runtime;
    private bool _authenticationInProgress;

    public AdminLoginWindow(
        IAdminAuthenticator authenticator,
        AdminAuthenticationThrottle throttle,
        PrintRecoveryReport recoveryReport,
        IPrintSubmissionJournal? journal,
        IKioskAdminRuntime? runtime)
    {
        InitializeComponent();
        _authenticator = authenticator;
        _throttle = throttle;
        _recoveryReport = recoveryReport;
        _journal = journal;
        _runtime = runtime;
    }

    private async void OnAuthenticate(object sender, RoutedEventArgs e)
    {
        if (_authenticationInProgress)
        {
            return;
        }

        if (!_authenticator.IsConfigured)
        {
            ErrorMessage.Text = "관리자 인증이 구성되지 않았습니다. 오류 코드: ADMIN-NOT-CONFIGURED";
            PasswordInput.Clear();
            return;
        }

        if (!_throttle.TryBegin(out _))
        {
            ErrorMessage.Text = "인증 시도가 너무 많습니다. 잠시 후 다시 시도하세요. 오류 코드: ADMIN-RATE-LIMITED";
            PasswordInput.Clear();
            return;
        }

        _authenticationInProgress = true;
        char[]? password = null;
        try
        {
            using var securePassword = PasswordInput.SecurePassword;
            password = CopyPassword(securePassword);
            PasswordInput.Clear();
            var result = await _authenticator.AuthenticateAsync(password, CancellationToken.None);
            if (!result.Succeeded)
            {
                _throttle.RecordFailure();
                ErrorMessage.Text = _throttle.TryBegin(out _)
                    ? $"인증할 수 없습니다. 오류 코드: {result.SafeCode}"
                    : "인증 시도가 너무 많습니다. 잠시 후 다시 시도하세요. 오류 코드: ADMIN-RATE-LIMITED";
                return;
            }

            _throttle.RecordSuccess();
            var diagnostics = new AdminStatusWindow(_recoveryReport, _journal, _runtime)
            {
                Owner = Owner,
            };
            Close();
            diagnostics.ShowDialog();
        }
        finally
        {
            if (password is not null)
            {
                Array.Clear(password);
            }
            _authenticationInProgress = false;
        }
    }

    private void OnCancel(object sender, RoutedEventArgs e) => Close();

    private static char[] CopyPassword(SecureString securePassword)
    {
        var characters = new char[securePassword.Length];
        var pointer = IntPtr.Zero;
        try
        {
            pointer = Marshal.SecureStringToGlobalAllocUnicode(securePassword);
            Marshal.Copy(pointer, characters, 0, characters.Length);
            return characters;
        }
        finally
        {
            if (pointer != IntPtr.Zero)
            {
                Marshal.ZeroFreeGlobalAllocUnicode(pointer);
            }
        }
    }
}
