"""Server tests for cbcountfield."""
from timApp.auth.accesstype import AccessType
from timApp.tests.browser.browsertest import BrowserTest
from timApp.timdb.sqa import db


class CbCountFieldTest(BrowserTest):
    def test_cbcountfield(self):
        self.login_test1()
        d = self.create_doc(initial_par="""
#- {#t plugin=cbcountfield}
        """)
        self.test_user_2.grant_access(d, AccessType.view)
        db.session.commit()
        db.session.refresh(d)
        self.post_answer(
            'cbcountfield', f'{d.id}.t',
            user_input={'c': '1'},
            expect_content={'savedNew': 1, 'web': {'count': 1, 'result': 'saved'}},
        )
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '1'},
            expect_content={'savedNew': None, 'web': {'count': 1, 'result': 'saved'}},
        )
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '0'},
            expect_content={'savedNew': 2, 'web': {'count': 0, 'result': 'saved'}},
        )
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '1'},
            expect_content={'savedNew': 3, 'web': {'count': 1, 'result': 'saved'}},
        )
        self.login_test2()
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '1'},
            expect_content={'savedNew': 4, 'web': {'count': 2, 'result': 'saved'}},
        )
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '1'},
            expect_content={'savedNew': None, 'web': {'count': 2, 'result': 'saved'}},
        )
        self.post_answer(
            'cbcountfield',
            f'{d.id}.t',
            user_input={'c': '0'},
            expect_content={'savedNew': 5, 'web': {'count': 1, 'result': 'saved'}},
        )
