using System.ComponentModel;
using System.Media;
using System.Windows;
using System.Windows.Input;
using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Core.Security;
using Paradiso.PrintCess.Infrastructure.Recovery;
using Paradiso.PrintCess.Kiosk.ViewModels;
using Paradiso.PrintCess.Kiosk.Views;

namespace Paradiso.PrintCess.Kiosk;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel;
    private readonly IAdminAuthenticator _adminAuthenticator;
    private readonly PrintRecoveryReport _recoveryReport;
    private readonly IKioskAdminRuntime? _runtime;
    private readonly IPrintSubmissionJournal? _journal;

    public MainWindow(
        MainViewModel viewModel,
        IAdminAuthenticator adminAuthenticator,
        PrintRecoveryReport recoveryReport,
        IKioskAdminRuntime? runtime,
        IPrintSubmissionJournal? journal)
    {
        InitializeComponent();
        _viewModel = viewModel;
        _adminAuthenticator = adminAuthenticator;
        _recoveryReport = recoveryReport;
        _runtime = runtime;
        _journal = journal;
        _viewModel.CompletionAnnounced += OnCompletionAnnounced;
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.P &&
            Keyboard.Modifiers.HasFlag(ModifierKeys.Control) &&
            Keyboard.Modifiers.HasFlag(ModifierKeys.Alt) &&
            Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
        {
            e.Handled = true;
            var login = new AdminLoginWindow(_adminAuthenticator, _recoveryReport, _journal, _runtime)
            {
                Owner = this,
            };
            login.ShowDialog();
        }
    }

    private static void OnCompletionAnnounced(object? sender, EventArgs e) => SystemSounds.Asterisk.Play();

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        _viewModel.CompletionAnnounced -= OnCompletionAnnounced;
        _runtime?.Dispose();
        _viewModel.Dispose();
    }
}
