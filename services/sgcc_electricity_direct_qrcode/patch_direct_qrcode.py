from __future__ import annotations

from pathlib import Path

DATA_FETCHER = Path("/app/data_fetcher.py")
CHROME_PROFILE_MARKER = "SGCC_CHROME_PROFILE_DIR"
DIRECT_QR_METHOD_MARKER = "def _direct_qr_login"
CHROME_OPTIONS_TARGET = '            chrome_options.add_argument("--start-maximized")\n'
FETCH_METHOD_TARGET = "    def fetch(self):\n"
LOGIN_BRANCH_TARGET = """            if os.getenv("DEBUG_MODE", "false").lower() == "true":
                if self._login(driver,phone_code=True):
                    logging.info("login successed !")
                else:
                    logging.info("login unsuccessed !")
                    raise Exception("login unsuccessed")
            else:
                if self._login(driver):
                    logging.info("login successed !")
                else:
                    logging.info("login unsuccessed !")
                    raise Exception("login unsuccessed")
"""
DIRECT_LOGIN_BRANCH_MARKER = 'DIRECT_QRCODE_LOGIN", "false"'


def replace_once(source: str, target: str, replacement: str, label: str) -> str:
    if target not in source:
        raise RuntimeError(f"Cannot patch SGCC upstream source: missing {label} marker")
    return source.replace(target, replacement, 1)


def main() -> None:
    source = DATA_FETCHER.read_text(encoding="utf-8")

    if CHROME_PROFILE_MARKER not in source:
        source = replace_once(
            source,
            CHROME_OPTIONS_TARGET,
            """            chrome_options.add_argument("--start-maximized")
            chrome_profile_dir = os.getenv("SGCC_CHROME_PROFILE_DIR", "/data/chrome-profile")
            if chrome_profile_dir:
                chrome_options.add_argument(f"--user-data-dir={chrome_profile_dir}")
""",
            "chrome options insertion point",
        )

    if DIRECT_QR_METHOD_MARKER not in source:
        source = replace_once(
            source,
            FETCH_METHOD_TARGET,
            """    def _direct_qr_login(self, driver) -> bool:
        logging.info("direct qrcode login start")
        if os.getenv("SGCC_SESSION_FIRST", "false").lower() == "true":
            try:
                driver.get(BALANCE_URL)
                time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
                if driver.current_url != LOGIN_URL and "login" not in driver.current_url.lower():
                    logging.info("reuse existing SGCC browser session")
                    return True
            except Exception as exc:
                logging.debug(f"Direct QR login failed to reuse session, reason: {exc}.")
        try:
            driver.get(LOGIN_URL)
            WebDriverWait(driver, self.DRIVER_IMPLICITY_WAIT_TIME * 3).until(
                EC.presence_of_element_located((By.CLASS_NAME, "qr_code"))
            )
        except Exception as exc:
            logging.debug(f"Direct QR login failed to open URL: {LOGIN_URL}, reason: {exc}.")
        logging.info(f"Open LOGIN_URL:{LOGIN_URL}.\\r")
        return self._qr_login(driver)

    def fetch(self):
""",
            "fetch method insertion point",
        )

    if DIRECT_LOGIN_BRANCH_MARKER not in source:
        source = replace_once(
            source,
            LOGIN_BRANCH_TARGET,
            """            if os.getenv("DIRECT_QRCODE_LOGIN", "false").lower() == "true":
                if self._direct_qr_login(driver):
                    logging.info("login successed !")
                else:
                    logging.info("login unsuccessed !")
                    raise Exception("login unsuccessed")
            elif os.getenv("DEBUG_MODE", "false").lower() == "true":
                if self._login(driver,phone_code=True):
                    logging.info("login successed !")
                else:
                    logging.info("login unsuccessed !")
                    raise Exception("login unsuccessed")
            else:
                if self._login(driver):
                    logging.info("login successed !")
                else:
                    logging.info("login unsuccessed !")
                    raise Exception("login unsuccessed")
""",
            "login branch",
        )

    missing_markers = [
        marker
        for marker in (CHROME_PROFILE_MARKER, DIRECT_QR_METHOD_MARKER, DIRECT_LOGIN_BRANCH_MARKER)
        if marker not in source
    ]
    if missing_markers:
        raise RuntimeError(
            "SGCC direct QR patch did not apply expected markers: "
            + ", ".join(missing_markers)
        )

    DATA_FETCHER.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
