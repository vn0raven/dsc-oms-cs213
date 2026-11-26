"""Additional real-frontend Chromium scenarios with synthetic API fixtures."""
import copy
from playwright.sync_api import sync_playwright
import m35_browser as browser_ui

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
        try:
            page,errors=browser_ui.make_page(browser,'dark',1440)
            page.evaluate('document.querySelector(\'[data-page="tasks"]\').click()')
            page.get_by_role('button',name='Sheet',exact=True).click()
            row=page.locator('.task-sheet-row').first
            row.click()
            assert page.get_by_role('dialog').count()==0,'A single Sheet click must select without opening details'
            assert row.get_attribute('aria-selected')=='true'
            row.locator('.sheet-row-number').dblclick()
            page.get_by_role('dialog').wait_for()
            assert page.get_by_role('dialog').count()==1,'Double click must inspect task'
            assert page.evaluate('document.activeElement.closest(".oms-dialog")!==null'),'Dialog must own focus'
            page.keyboard.press('Escape')
            assert page.get_by_role('dialog').count()==0
            assert not errors,errors
            page.close()
            print('PASS Sheet select/double click, focus and Escape')

            saved=copy.deepcopy(browser_ui.DATA)
            for role in ('Member','Executive','Co-Lead','Lead'):
                user=copy.deepcopy(saved['/api/auth/me']['user'])
                user['role']=role;user['id']=role.lower()
                browser_ui.DATA['/api/auth/me']={'user':user}
                page,errors=browser_ui.make_page(browser,'light',1440)
                page.evaluate('document.querySelector(\'[data-page="announcements"]\').click()')
                if role=='Member':assert page.locator('[data-notice-new]').count()==0
                else:assert page.locator('[data-notice-new]').count()==1
                assert not errors,errors
                page.close()
                print('PASS announcement publisher control',role)
            browser_ui.DATA.update(saved)
        finally:browser.close()
if __name__=='__main__':run()
