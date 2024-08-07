
import threading


class UnableToConnect(Exception):
    pass

class AuthenticationFailed(Exception):
    pass

class SSHException(Exception):
    """
    Exception raised by failures in SSH2 protocol negotiation or logic errors.
    """
    pass

class Singleton(type):
    _instances = {}
    _lock = threading.Lock()  # Ensure thread-safety during instance creation

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            with cls._lock:
                if cls not in cls._instances:  # Double-checked locking
                    print(f"Creating instance of {cls.__name__}")
                    cls._instances[cls] = super(Singleton, cls).__call__(*args, **kwargs)
        else:
            print(f"Instance of {cls.__name__} already created. Using existing object")
        return cls._instances[cls]