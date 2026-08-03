namespace Paradiso.PrintCess.Core.Security;

public interface IAdminAuthenticator
{
    bool IsConfigured { get; }

    ValueTask<AdminAuthenticationResult> AuthenticateAsync(
        ReadOnlyMemory<char> password,
        CancellationToken cancellationToken);
}

public sealed record AdminAuthenticationResult(bool Succeeded, string SafeCode)
{
    public static AdminAuthenticationResult Success() => new(true, "ADMIN-OK");

    public static AdminAuthenticationResult Denied(string code = "ADMIN-DENIED") => new(false, code);
}

public sealed class AdminAuthenticationThrottle
{
    private const int DefaultFailureLimit = 5;
    private static readonly TimeSpan DefaultLockoutDuration = TimeSpan.FromSeconds(30);

    private readonly object _sync = new();
    private readonly TimeProvider _timeProvider;
    private readonly int _failureLimit;
    private readonly TimeSpan _lockoutDuration;
    private int _failureCount;
    private DateTimeOffset? _lockedUntil;

    public AdminAuthenticationThrottle(
        TimeProvider? timeProvider = null,
        int failureLimit = DefaultFailureLimit,
        TimeSpan? lockoutDuration = null)
    {
        if (failureLimit < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(failureLimit));
        }

        var duration = lockoutDuration ?? DefaultLockoutDuration;
        if (duration <= TimeSpan.Zero || duration > TimeSpan.FromHours(1))
        {
            throw new ArgumentOutOfRangeException(nameof(lockoutDuration));
        }

        _timeProvider = timeProvider ?? TimeProvider.System;
        _failureLimit = failureLimit;
        _lockoutDuration = duration;
    }

    public bool TryBegin(out TimeSpan retryAfter)
    {
        lock (_sync)
        {
            var now = _timeProvider.GetUtcNow();
            if (_lockedUntil is { } lockedUntil)
            {
                if (lockedUntil > now)
                {
                    retryAfter = lockedUntil - now;
                    return false;
                }

                _lockedUntil = null;
                _failureCount = 0;
            }

            retryAfter = TimeSpan.Zero;
            return true;
        }
    }

    public void RecordFailure()
    {
        lock (_sync)
        {
            var now = _timeProvider.GetUtcNow();
            if (_lockedUntil is { } lockedUntil)
            {
                if (lockedUntil > now)
                {
                    return;
                }

                _lockedUntil = null;
                _failureCount = 0;
            }

            _failureCount++;
            if (_failureCount >= _failureLimit)
            {
                _failureCount = 0;
                _lockedUntil = now + _lockoutDuration;
            }
        }
    }

    public void RecordSuccess()
    {
        lock (_sync)
        {
            _failureCount = 0;
            _lockedUntil = null;
        }
    }
}
