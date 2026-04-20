from __future__ import annotations

from pathlib import Path

DATA_FETCHER = Path("/app/data_fetcher.py")
DIRECT_QR_METHOD_MARKER = "def _direct_qr_login"


def main() -> None:
    source = DATA_FETCHER.read_text(encoding="utf-8")

    if DIRECT_QR_METHOD_MARKER not in source:
        source = source.replace(
            "    def fetch(self):\n",
            """    def _direct_qr_login(self, driver) -> bool:
        logging.info("direct qrcode login start")
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
        )

    source = source.replace(
        """            if os.getenv("DEBUG_MODE", "false").lower() == "true":
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
    )

    DATA_FETCHER.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
