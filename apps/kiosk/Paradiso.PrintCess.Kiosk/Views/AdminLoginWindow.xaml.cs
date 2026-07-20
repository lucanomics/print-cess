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
    private readonly PrintRecoveryReport _recoveryReport;
    private readonly IPrintSubmissionJournal? _journal;
    private readonly IKioskAdminRuntime? _runtime;

    public AdminLoginWindow(
        IAdminAuthenticator authenticator,
        PrintRecoveryReport recoveryReport,
        IPrintSubmissionJournal? journal,
        IKioskAdminRuntime? runtime)
    {
        InitializeComponent();
        _authenticator = authenticator;
        _recoveryReport = recoveryReport;
        _journal = journal;
        _runtime = runtime;
    }

    private async void OnAuthenticate(object sender, RoutedEventArgs e)
    {
        if (!_authenticator.IsConfigured)
        {
            ErrorMessage.Text = "관리자 인증이 구성되지 않았습니다. 오류 코드: ADMIN-NOT-CONFIGURED";
            PasswordInput.Clear();
            return;
        }

        using var securePassword = PasswordInput.SecurePassword;
        var password = CopyPassword(securePassword);
        PasswordInput.Clear();
        try
        {
            var result = await _authenticator.AuthenticateAsync(password, CancellationToken.None);
            if (!result.Succeeded)
            {
                ErrorMessage.Text = $"인증할 수 없습니다. 오류 코드: {result.SafeCode}";
                return;
            }

            var diagnostics = new AdminStatusWindow(_recoveryReport, _journal, _runtime)
            {
                Owner = Owner,
            };
            Close();
            diagnostics.ShowDialog();
        }
        finally
        {
            Array.Clear(password);
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
