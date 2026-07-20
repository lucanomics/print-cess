namespace Paradiso.PrintCess.Kiosk.ViewModels;

public enum KioskUiState
{
    Preparing,
    Waiting,
    Claimed,
    Uploading,
    Validating,
    Printing,
    Completed,
    SessionError,
    Suspended,
}
