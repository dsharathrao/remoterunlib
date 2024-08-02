import os
import traceback

wd = None


def get_web_driver(headless=False):
    '''
    Function to initialize and return a WebDriver instance for Chrome browser with specific configurations such as headless mode, 
    full-page screenshot, and Chrome profile path. Handles importing necessary modules and setting up Chrome options. If WebDriver is already initialized, 
    returns the existing instance. 
    '''
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service as ChromeService
    except ImportError:
        print("Selenium not installed. Please install it with pip install selenium")
        raise ImportError

    try:
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        print("webdriver_manager not installed. Please install it with pip install webdriver-manager")
        raise ImportError

    try:
        from selenium_stealth import stealth
    except ImportError:
        print("selenium_stealth not installed. Please install it with pip install selenium-stealth")
        raise ImportError
    
    global wd
    selenium_config = {
        "chrome_profile_path": None,
        "headless": headless,
        "full_page_screenshot": True,
    }


    if wd:
        return wd

    chrome_profile_path = selenium_config.get("chrome_profile_path", None)
    profile_directory = None
    user_data_dir = None
    if isinstance(chrome_profile_path, str) and os.path.exists(chrome_profile_path):
        profile_directory = os.path.split(chrome_profile_path)[-1].strip("\\").rstrip("/")
        user_data_dir = os.path.split(chrome_profile_path)[0].strip("\\").rstrip("/")
        print(f"Using Chrome profile: {profile_directory}")
        print(f"Using Chrome user data dir: {user_data_dir}")
        print(f"Using Chrome profile path: {chrome_profile_path}")

    chrome_options = webdriver.ChromeOptions()
    # Removed headless and other options for debugging purposes

    chrome_driver_path = "/usr/bin/chromedriver"
    # check if the chrome driver is installed
    if not os.path.exists(chrome_driver_path):
        chrome_driver_path = ChromeDriverManager().install()

    # chrome_options.binary_location = "/usr/bin/chromium"

    if selenium_config.get("headless", False):
        chrome_options.add_argument('--headless')
    if selenium_config.get("full_page_screenshot", False):
        chrome_options.add_argument("--start-maximized")
    else:
        chrome_options.add_argument("--window-size=960,1080")

    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--window-size=960,1080")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--remote-debugging-port=9222")  # Ensure remote debugging is enabled.
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-popup-blocking")
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")

    chrome_options.add_argument("--disable-web-security")
    chrome_options.add_argument("--allow-running-insecure-content")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    if user_data_dir and profile_directory:
        chrome_options.add_argument(f"user-data-dir={user_data_dir}")
        chrome_options.add_argument(f"profile-directory={profile_directory}")

    try:
        wd = webdriver.Chrome(service=ChromeService(chrome_driver_path), options=chrome_options)
        # Print the actual profile path being used
        if wd.capabilities['chrome']['userDataDir']:
            print(f"Profile path in use: {wd.capabilities['chrome']['userDataDir']}")
    except Exception as e:
        print(f"Error initializing WebDriver: {e}")
        raise e

    stealth(
        wd,
        languages=["en-US", "en"],
        vendor="Google Inc.",
        platform="Win32",
        webgl_vendor="Intel Inc.",
        renderer="Intel Iris OpenGL Engine",
        fix_hairline=True,
    )

    # wd.set_window_size(960, 1080)
    wd.implicitly_wait(10)

    return wd

def get_citrix_cloud_data():
    headless=True

    wd = get_web_driver(headless)
    try:
        print("Opening URL")
        wd.get("https://google.com/")
        print("opened url")

        return True
    
    except Exception as why:
        print(f"Unhandled exception occurred. Please examine logs. Exiting")
        print(f"{traceback.format_exc()}")
        print(f"{traceback.format_exception_only(type(why), why)}")
        return False

    finally:
        wd.close()
        wd.quit()

status = get_citrix_cloud_data()


print(f"Status: {status}")