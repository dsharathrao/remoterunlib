
class UnableToConnect(Exception):
    pass

class AuthenticationFailed(Exception):
    pass

class SSHException(Exception):
    """
    Exception raised by failures in SSH2 protocol negotiation or logic errors.
    """
    pass