from __future__ import annotations

from pathlib import Path

DATA_FETCHER = Path("/app/data_fetcher.py")
SENSOR_UPDATOR = Path("/app/sensor_updator.py")
CHROME_PROFILE_MARKER = "SGCC_CHROME_PROFILE_DIR"
DIRECT_QR_METHOD_MARKER = "def _direct_qr_login"
ROBUST_ACCOUNT_SELECT_MARKER = "def _get_visible_account_options"
ROBUST_USER_IDS_MARKER = "SGCC business page is not ready"
HA_SENSOR_ATTRS_MARKER = "present_date"
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
ACCOUNT_METHODS_TARGET = """    def _get_current_userid(self, driver):
        current_userid = driver.find_element(By.XPATH, '//*[@id="app"]/div/div/article/div/div/div[2]/div/div/div[1]/div[2]/div/div/div/div[2]/div/div[1]/div/ul/div/li[1]/span[2]').text
        return current_userid

    def _choose_current_userid(self, driver, userid_index):
        elements = driver.find_elements(By.CLASS_NAME, "button_confirm")
        if elements:
            self._click_button(driver, By.XPATH, f'''//*[@id="app"]/div/div[2]/div/div/div/div[2]/div[2]/div/button''')
        time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
        self._click_button(driver, By.CLASS_NAME, "el-input__suffix")
        time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
        self._click_button(driver, By.XPATH, f"/html/body/div[2]/div[1]/div[1]/ul/li[{userid_index+1}]/span")


"""
ACCOUNT_METHODS_REPLACEMENT = """    def _debug_dump_page(self, driver, label):
        try:
            debug_dir = "/data/errors/sgcc_debug"
            os.makedirs(debug_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            driver.save_screenshot(f"{debug_dir}/{label}_{timestamp}.png")
            with open(f"{debug_dir}/{label}_{timestamp}.html", "w", encoding="utf-8") as fp:
                fp.write(driver.page_source)
        except Exception as exc:
            logging.debug(f"Failed to dump SGCC debug page for {label}: {exc}")

    def _is_on_sgcc_business_page(self, driver):
        try:
            original_wait = self.DRIVER_IMPLICITY_WAIT_TIME
            driver.implicitly_wait(0)
        except Exception:
            original_wait = None
        try:
            current_url = (driver.current_url or "").lower()
        except Exception:
            current_url = ""
        try:
            if "login" in current_url:
                return False

            for selector in ("#login_box", ".sweepCodePic", ".tencent-captcha__mask-layer"):
                try:
                    for element in driver.find_elements(By.CSS_SELECTOR, selector):
                        if element.is_displayed():
                            return False
                except Exception:
                    continue

            for selector in (".el-dropdown", ".balance_title", ".cff8", ".total"):
                try:
                    for element in driver.find_elements(By.CSS_SELECTOR, selector):
                        if element.is_displayed():
                            return True
                except Exception:
                    continue
            return False
        finally:
            if original_wait is not None:
                try:
                    driver.implicitly_wait(original_wait)
                except Exception:
                    pass

    def _get_visible_userid_options(self, driver):
        options = []
        for selector in (
            "body .el-dropdown-menu.el-popper li",
            "body .el-dropdown-menu li",
            "body .el-popper li",
        ):
            try:
                for element in driver.find_elements(By.CSS_SELECTOR, selector):
                    if element.is_displayed() and re.search(r"\\d{10,}", element.text or ""):
                        options.append(element)
            except Exception:
                continue
        return options

    def _extract_userids_from_text(self, text):
        userids = []
        for match in re.findall(r"\\d{10,}", text or ""):
            if match not in userids:
                userids.append(match)
        return userids

    def _get_visible_account_options(self, driver):
        selectors = (
            "body .el-select-dropdown__item",
            "body .el-dropdown-menu__item",
            "body .el-popper li",
        )
        options = []
        for selector in selectors:
            for element in driver.find_elements(By.CSS_SELECTOR, selector):
                try:
                    if element.is_displayed() and element.text.strip():
                        options.append(element)
                except Exception:
                    continue
        return options

    def _get_current_userid(self, driver):
        text_sources = []
        for selector in (
            "#app li",
            "#app .el-select",
            "#app .el-input",
            "#app",
        ):
            try:
                text_sources.extend(
                    element.text for element in driver.find_elements(By.CSS_SELECTOR, selector)
                    if element.is_displayed() and element.text
                )
            except Exception:
                continue
        for text in text_sources:
            matches = re.findall(r"\\d{10,}", text)
            if matches:
                return matches[-1]
        return ""

    def _choose_current_userid(self, driver, userid_index, user_id=None):
        current_userid = self._get_current_userid(driver)
        if user_id and current_userid == user_id:
            return

        for element in driver.find_elements(By.CLASS_NAME, "button_confirm"):
            try:
                if element.is_displayed():
                    driver.execute_script("arguments[0].click();", element)
                    time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
                    break
            except Exception:
                continue

        open_candidates = []
        for selector in (
            ".el-select .el-input__suffix",
            ".el-select input",
            ".el-input__suffix",
            ".el-dropdown span",
        ):
            try:
                open_candidates.extend(
                    element for element in driver.find_elements(By.CSS_SELECTOR, selector)
                    if element.is_displayed()
                )
            except Exception:
                continue

        for element in open_candidates:
            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
                driver.execute_script("arguments[0].click();", element)
                WebDriverWait(driver, self.DRIVER_IMPLICITY_WAIT_TIME).until(
                    lambda d: len(self._get_visible_account_options(d)) > 0
                )
                break
            except Exception:
                continue

        options = self._get_visible_account_options(driver)
        if not options:
            if user_id and user_id in driver.find_element(By.TAG_NAME, "body").text:
                return
            self._debug_dump_page(driver, "account_options_missing")
            raise Exception("account selector options not found")

        target = None
        if user_id:
            for option in options:
                if user_id in option.text:
                    target = option
                    break
        if target is None:
            if userid_index >= len(options):
                self._debug_dump_page(driver, "account_option_index_out_of_range")
                raise Exception(
                    f"account selector option index {userid_index} out of range, options={len(options)}"
                )
            target = options[userid_index]

        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", target)
        driver.execute_script("arguments[0].click();", target)


"""

USER_IDS_METHOD_REPLACEMENT = """    def _get_user_ids(self, driver):
        try:
            logging.info("SGCC user id extraction start")
            try:
                driver.set_page_load_timeout(int(os.getenv("SGCC_PAGE_LOAD_TIMEOUT_SECONDS", "45")))
            except Exception:
                pass
            try:
                driver.execute_script("window.stop();")
            except Exception as exc:
                logging.debug(f"SGCC window.stop before user id extraction failed: {exc}")

            time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
            if not self._is_on_sgcc_business_page(driver):
                try:
                    logging.info("SGCC user id page is not ready, open balance page")
                    driver.get(BALANCE_URL)
                except Exception as exc:
                    logging.info(f"SGCC balance page did not fully load for user id extraction, continue with DOM: {exc}")
                    try:
                        driver.execute_script("window.stop();")
                    except Exception:
                        pass
                try:
                    WebDriverWait(
                        driver,
                        int(os.getenv("SGCC_USERID_WAIT_SECONDS", "30")),
                    ).until(lambda d: self._is_on_sgcc_business_page(d))
                except Exception:
                    pass

            if not self._is_on_sgcc_business_page(driver):
                self._debug_dump_page(driver, "userid_page_not_ready")
                raise Exception("SGCC business page is not ready; login or security verification is required")

            driver.implicitly_wait(0)
            try:
                body_text = driver.find_element(By.TAG_NAME, "body").text
                userid_list = self._extract_userids_from_text(body_text)
                if userid_list:
                    logging.info(f"SGCC user id list extracted from page text: {userid_list}")
                    return userid_list

                open_candidates = []
                for selector in (
                    ".el-dropdown > span",
                    ".el-dropdown span",
                    ".el-dropdown",
                ):
                    try:
                        open_candidates.extend(
                            element for element in driver.find_elements(By.CSS_SELECTOR, selector)
                            if element.is_displayed()
                        )
                    except Exception:
                        continue

                for element in open_candidates:
                    try:
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
                        driver.execute_script("arguments[0].click();", element)
                        WebDriverWait(
                            driver,
                            int(os.getenv("SGCC_USERID_WAIT_SECONDS", "30")),
                        ).until(lambda d: len(self._get_visible_userid_options(d)) > 0)
                        break
                    except Exception:
                        continue

                userid_list = []
                for element in self._get_visible_userid_options(driver):
                    for user_id in self._extract_userids_from_text(element.text):
                        if user_id not in userid_list:
                            userid_list.append(user_id)

                if not userid_list:
                    body_text = driver.find_element(By.TAG_NAME, "body").text
                    userid_list = self._extract_userids_from_text(body_text)
            finally:
                driver.implicitly_wait(self.DRIVER_IMPLICITY_WAIT_TIME)

            if not userid_list:
                self._debug_dump_page(driver, "userid_options_missing")
                raise Exception("user id list not found on SGCC page")
            logging.info(f"SGCC user id list extracted from dropdown: {userid_list}")
            return userid_list
        except Exception as e:
            logging.error(f"Webdriver quit abnormly, reason: {e}. get user_id list failed.")
            driver.quit()
            raise

"""


def replace_once(source: str, target: str, replacement: str, label: str) -> str:
    if target not in source:
        raise RuntimeError(f"Cannot patch SGCC upstream source: missing {label} marker")
    return source.replace(target, replacement, 1)


def replace_method_between(source: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f"Cannot patch SGCC upstream source: missing {label} start marker")
    end = source.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"Cannot patch SGCC upstream source: missing {label} end marker")
    return source[:start] + replacement + source[end:]


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
            chrome_options.page_load_strategy = os.getenv("SGCC_PAGE_LOAD_STRATEGY", "eager")
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
                try:
                    driver.set_page_load_timeout(int(os.getenv("SGCC_PAGE_LOAD_TIMEOUT_SECONDS", "45")))
                except Exception:
                    pass
                driver.get(BALANCE_URL)
                time.sleep(self.RETRY_WAIT_TIME_OFFSET_UNIT)
                if self._is_on_sgcc_business_page(driver):
                    logging.info("reuse existing SGCC browser session")
                    return True
                self._debug_dump_page(driver, "session_reuse_rejected")
            except Exception as exc:
                logging.debug(f"Direct QR login failed to reuse session, reason: {exc}.")
            logging.info("existing SGCC browser session is unavailable; QR login is required before fetching data")
            return False
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

    if ROBUST_ACCOUNT_SELECT_MARKER not in source:
        source = replace_once(
            source,
            "                self._choose_current_userid(driver,userid_index)\n",
            "                self._choose_current_userid(driver, userid_index, user_id)\n",
            "balance page account selector call",
        )
        source = replace_once(
            source,
            "        self._choose_current_userid(driver, userid_index)\n",
            "        self._choose_current_userid(driver, userid_index, user_id)\n",
            "usage page account selector call",
        )
        source = replace_method_between(
            source,
            "    def _get_current_userid(self, driver):\n",
            "    def _get_all_data(self, driver, user_id, userid_index):\n",
            ACCOUNT_METHODS_REPLACEMENT,
            "account selector methods",
        )

    if ROBUST_USER_IDS_MARKER not in source:
        source = replace_method_between(
            source,
            "    def _get_user_ids(self, driver):\n",
            "    def _get_electric_balance(self, driver):\n",
            USER_IDS_METHOD_REPLACEMENT,
            "user id list method",
        )

    missing_markers = [
        marker
        for marker in (
            CHROME_PROFILE_MARKER,
            DIRECT_QR_METHOD_MARKER,
            DIRECT_LOGIN_BRANCH_MARKER,
            ROBUST_ACCOUNT_SELECT_MARKER,
            ROBUST_USER_IDS_MARKER,
        )
        if marker not in source
    ]
    if missing_markers:
        raise RuntimeError(
            "SGCC direct QR patch did not apply expected markers: "
            + ", ".join(missing_markers)
        )

    DATA_FETCHER.write_text(source, encoding="utf-8")

    sensor_source = SENSOR_UPDATOR.read_text(encoding="utf-8")
    if HA_SENSOR_ATTRS_MARKER not in sensor_source:
        sensor_source = sensor_source.replace(
            '        if not self.should_update(sensorName, sensorState, {"last_reset": last_daily_date}):',
            '        if not self.should_update(sensorName, sensorState, {"present_date": last_daily_date}):',
            1,
        )
        sensor_source = sensor_source.replace(
            '                "last_reset": last_daily_date,\n'
            '                "unit_of_measurement": "kWh",\n'
            '                "icon": "mdi:lightning-bolt",\n'
            '                "device_class": "energy",\n'
            '                "state_class": "measurement",\n',
            '                "present_date": last_daily_date,\n'
            '                "unit_of_measurement": "kWh",\n'
            '                "icon": "mdi:lightning-bolt",\n'
            '                "device_class": "energy",\n'
            '                "state_class": "total",\n',
            1,
        )
        sensor_source = sensor_source.replace(
            '        last_reset = datetime.now().strftime("%Y-%m-%d, %H:%M:%S")\n',
            "",
            1,
        )
        sensor_source = sensor_source.replace(
            '                "last_reset": last_reset,\n'
            '                "unit_of_measurement": "CNY",\n',
            '                "unit_of_measurement": "CNY",\n',
            1,
        )
        sensor_source = sensor_source.replace(
            '        current_date = datetime.now()\n'
            '        first_day_of_current_month = current_date.replace(day=1)\n'
            '        last_day_of_previous_month = first_day_of_current_month - timedelta(days=1)\n'
            '        last_reset = last_day_of_previous_month.strftime("%Y-%m")\n'
            '        \n'
            '        if not self.should_update(sensorName, sensorState, {"last_reset": last_reset}):',
            '        if not self.should_update(sensorName, sensorState):',
            1,
        )
        sensor_source = sensor_source.replace(
            '                "last_reset": last_reset,\n'
            '                "unit_of_measurement": "kWh" if usage else "CNY",\n'
            '                "icon": "mdi:lightning-bolt" if usage else "mdi:cash",\n'
            '                "device_class": "energy" if usage else "monetary",\n'
            '                "state_class": "measurement",\n',
            '                "unit_of_measurement": "kWh" if usage else "CNY",\n'
            '                "icon": "mdi:lightning-bolt" if usage else "mdi:cash",\n'
            '                "device_class": "energy" if usage else "monetary",\n'
            '                "state_class": "total",\n',
            1,
        )
        sensor_source = sensor_source.replace(
            '        if datetime.now().month == 1:\n'
            '            last_year = datetime.now().year -1 \n'
            '            last_reset = datetime.now().replace(year=last_year).strftime("%Y")\n'
            '        else:\n'
            '            last_reset = datetime.now().strftime("%Y")\n'
            '            \n'
            '        if not self.should_update(sensorName, sensorState, {"last_reset": last_reset}):',
            '        if not self.should_update(sensorName, sensorState):',
            1,
        )
        sensor_source = sensor_source.replace(
            '                "last_reset": last_reset,\n'
            '                "unit_of_measurement": "kWh" if usage else "CNY",\n'
            '                "icon": "mdi:lightning-bolt" if usage else "mdi:cash",\n'
            '                "device_class": "energy" if usage else "monetary",\n'
            '                "state_class": "total_increasing",\n',
            '                "unit_of_measurement": "kWh" if usage else "CNY",\n'
            '                "icon": "mdi:lightning-bolt" if usage else "mdi:cash",\n'
            '                "device_class": "energy" if usage else "monetary",\n'
            '                "state_class": "total_increasing" if usage else "total",\n',
            1,
        )
        sensor_source = sensor_source.replace(
            '"Content-Type": "application-json"',
            '"Content-Type": "application/json"',
            1,
        )
        if HA_SENSOR_ATTRS_MARKER not in sensor_source:
            raise RuntimeError("SGCC HA sensor attribute patch did not apply expected marker")
        SENSOR_UPDATOR.write_text(sensor_source, encoding="utf-8")


if __name__ == "__main__":
    main()
