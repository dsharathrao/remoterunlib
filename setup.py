from setuptools import setup, find_packages

setup(
    name="remoterunlib",
    version="1.0.0",
    packages=find_packages(),
    install_requires=["paramiko"],
    author="Sharath Kumar",
    author_email="dsharathrao@gmail.com",
    description="`remoterunlib` is a Python library that facilitates remote command execution",
    long_description="`remoterunlib` is a Python library that facilitates remote command execution, Python function invocation, and PowerShell command execution over SSH. It is built on top of the Paramiko library and provides a simple interface for managing SSH connections and running commands or functions on remote machines.",
    long_description_content_type="text/markdown",
    url="https://github.com/dsharathrao/remoterunlib",
    classifiers=[
        "Programming Language :: Python :: 3",
        "Development Status :: 1 - Planning",
        "License :: MIT License",
        "Intended Audience :: Developers",
        "Operating System :: Microsoft :: Windows",
    ],
    python_requires=">=3.8",
)
