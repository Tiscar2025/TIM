from timApp.tests.server.timroutetest import TimRouteTest
from timApp.document.docentry import DocEntry
from timApp.folder.folder import Folder


class BookmarkTest(TimRouteTest):

    def get_bookmarks(self, expect_status=200):
        bms = self.get('/bookmarks/get', expect_status=expect_status)
        return bms

    def test_bookmarks(self):
        self.login_test1()
        bookmarks = self.get_bookmarks()

        # Test to make sure an invalid folder with empty name is not created
        f = Folder.find_by_location(self.current_user.get_personal_folder().path, '')
        self.assertIsNone(f)

        d = DocEntry.query.filter_by(name=self.current_user.get_personal_folder().path + '/Bookmarks').first()
        self.assertIsNotNone(d)
        self.assertListEqual([], bookmarks)
        group_name = 'mygroup'
        group_name2 = 'mygroup2'
        item = 'test item'
        item_path = 'some/path/to/item'
        bookmarks = self.post(f'/bookmarks/createGroup/{group_name}')
        self.assertListEqual([{'name': 'mygroup', 'items': [], 'editable': True}], bookmarks)
        bookmarks = self.json_post('/bookmarks/add', {'group': group_name2, 'name': item, 'link': item_path})
        self.assertListEqual([{'items': [], 'name': group_name, 'editable': True},
                              {'items': [{'name': item, 'link': item_path}],
                               'name': group_name2, 'editable': True}], bookmarks)

        bookmarks = self.json_post('/bookmarks/deleteGroup', {'group': group_name})
        self.assertListEqual([{'items': [{'name': item, 'link': item_path}],
                               'name': group_name2, 'editable': True}], bookmarks)
        bookmarks = self.json_post('/bookmarks/deleteGroup', {'group': group_name})
        self.assertListEqual([{'items': [{'name': item, 'link': item_path}],
                               'name': group_name2, 'editable': True}], bookmarks)

        bookmarks = self.json_post('/bookmarks/delete', {'group': group_name2, 'name': item})
        self.assertListEqual([{'items': [], 'name': group_name2, 'editable': True}], bookmarks)
        bookmarks = self.json_post('/bookmarks/delete', {'group': group_name2, 'name': item})
        self.assertListEqual([{'items': [], 'name': group_name2, 'editable': True}], bookmarks)

        bookmarks = self.json_post('/bookmarks/add', {'group': group_name2, 'name': item, 'link': item_path})
        self.assertListEqual([{'items': [{'name': item, 'link': item_path}],
                               'name': group_name2, 'editable': True}], bookmarks)
        bookmarks = self.json_post('/bookmarks/edit',
                                   {'old': {'group': group_name2, 'name': item},
                                    'new': {'group': group_name2, 'name': item, 'link': 'test'}})
        self.assertListEqual([{'items': [{'name': item, 'link': 'test'}],
                               'name': group_name2, 'editable': True}], bookmarks)
        self.logout()
        self.get_bookmarks(expect_status=403)

    def test_recently_edited(self):
        self.login_test2()
        d = self.create_doc()
        view = '/view/'
        self.assertListEqual([{'name': 'Last edited',
                               'items': [{'name': d.title, 'link': view + d.path}],
                               'editable': False}],
                             self.get_bookmarks())
        d2 = self.create_doc()
        self.assertListEqual([{'name': 'Last edited',
                               'items': [{'name': d2.title, 'link': view + d2.path},
                                         {'name': d.title, 'link': view + d.path}],
                               'editable': False}],
                             self.get_bookmarks())
        d3 = self.create_doc()
        self.assertListEqual([{'name': 'Last edited',
                               'items': [{'name': d3.title, 'link': view + d3.path},
                                         {'name': d2.title, 'link': view + d2.path},
                                         {'name': d.title, 'link': view + d.path}],
                               'editable': False}],
                             self.get_bookmarks())
        self.new_par(d.document, 'test')
        self.assertListEqual([{'name': 'Last edited',
                               'items': [{'name': d.title, 'link': view + d.path},
                                         {'name': d3.title, 'link': view + d3.path},
                                         {'name': d2.title, 'link': view + d2.path}],
                               'editable': False}],
                             self.get_bookmarks())
        d4 = self.create_doc()
        # LAST_EDITED_BOOKMARK_LIMIT = 3 when testing
        self.assertListEqual([{'name': 'Last edited',
                               'items': [{'name': d4.title, 'link': view + d4.path},
                                         {'name': d.title, 'link': view + d.path},
                                         {'name': d3.title, 'link': view + d3.path}],
                               'editable': False}],
                             self.get_bookmarks())
