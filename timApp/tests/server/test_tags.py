from timApp.item.tag import TagType
from timApp.tests.server.timroutetest import TimRouteTest
from timApp.user.special_group_names import TEACHERS_GROUPNAME
from timApp.user.user import User
from timApp.user.usergroup import UserGroup
from timApp.timdb.sqa import db


class TagTest(TimRouteTest):

    def test_tag_adding_without_manage(self):
        self.login_test1()
        d = self.create_doc()
        self.login_test2()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2', 'expires': None, 'type': TagType.Regular}]},
                       expect_status=403)

    def test_tag_adding_with_manage(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2', 'expires': None, 'type': TagType.Regular}]})

    def test_tag_adding_with_special_chars(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2#¤%&/()=', 'expires': None,
                                                         'type': TagType.Regular}]},
                       expect_status=400,
                       expect_content={
                           'error': 'Tags can only contain letters a-z, numbers, underscores, spaces and dashes.'}
                       )

    def test_special_tag_adding_without_rights(self):
        teachers_group = UserGroup.get_by_name("teachers")
        if not teachers_group:
            db.session.add(UserGroup(name=TEACHERS_GROUPNAME))
            db.session.commit()
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}',
                       {'tags': [{'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode},
                                 {'name': 'testing subject', 'expires': None, 'type': TagType.Subject}]},
                       expect_status=400,
                       expect_content={
                           'error': 'Managing this tag requires teachers rights.'}
                       )

    def test_special_tag_adding_with_rights(self):
        u = User.get_by_name('testuser3')
        teachers_group = UserGroup.get_by_name("teachers")
        if not teachers_group:
            db.session.add(UserGroup(name=TEACHERS_GROUPNAME))
            db.session.commit()
            teachers_group = UserGroup.get_by_name("teachers")
        if u not in teachers_group.users:
            u.groups.append(teachers_group)
            db.session.commit()
        admin_group = UserGroup.get_admin_group()
        if u not in admin_group.users:
            u.groups.append(admin_group)
            db.session.commit()
        self.login_test3()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}',
                       {'tags': [{'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode},
                                 {'name': 'testing subject', 'expires': None, 'type': TagType.Subject}]})

    def test_get_docs_by_tag(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}',
                       {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular.value},
                                 {'name': 'test2', 'expires': None, 'type': TagType.Regular.value}]})
        self.get(f'/tags/getTags/{d.path}',
                 expect_content=[{'name': 'test', 'expires': None, 'block_id': d.id, 'type': TagType.Regular.value},
                                 {'name': 'test2', 'expires': None, 'block_id': d.id, 'type': TagType.Regular.value}])

    def test_adding_duplicate_tag(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test', 'expires': None, 'type': TagType.Regular}]},
                       expect_status=400,
                       expect_content={
                           'error': 'Tag name is already in use.'}
                       )

    def test_get_all_tags(self):
        self.login_test1()
        d = self.create_doc()
        d2 = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2', 'expires': None, 'type': TagType.Regular}]})
        self.json_post(f'/tags/add/{d2.path}', {'tags': [{'name': 'test3', 'expires': None, 'type': TagType.Regular}]})
        self.get(f'/tags/getAllTags')

    def test_tag_removal_without_manage(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2', 'expires': None, 'type': TagType.Regular}]})
        self.login_test2()
        self.json_post(f'/tags/remove/{d.path}',
                       {'tagObject': {'block_id': d.id, 'name': 'test', 'expires': None, 'type': TagType.Regular}},
                       expect_status=403)

    def test_tag_removal_with_manage(self):
        self.login_test1()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}', {'tags': [{'name': 'test', 'expires': None, 'type': TagType.Regular},
                                                        {'name': 'test2', 'expires': None, 'type': TagType.Regular}]})
        self.json_post(f'/tags/remove/{d.path}',
                       {'tagObject': {'block_id': d.id, 'name': 'test', 'expires': None, 'type': TagType.Regular}})

    def test_special_tag_removal_without_rights(self):
        u = User.get_by_name('testuser3')
        admin_group = UserGroup.get_admin_group()
        if u not in admin_group.users:
            u.groups.append(admin_group)
            db.session.commit()
        self.login_test3()

        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}',
                       {'tags': [{'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode},
                                 {'name': 'testing subject', 'expires': None, 'type': TagType.Subject}]})
        self.login_test1()
        self.json_post(f'/tags/remove/{d.path}',
                       {'tagObject': {'block_id': d.id, 'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode}},
                       expect_status=403)

    def test_special_tag_removal_with_rights(self):
        u = User.get_by_name('testuser3')
        teachers_group = UserGroup.get_by_name("teachers")
        if not teachers_group:
            db.session.add(UserGroup(name=TEACHERS_GROUPNAME))
            db.session.commit()
            teachers_group = UserGroup.get_by_name("teachers")
        if u not in teachers_group.users:
            u.groups.append(teachers_group)
            db.session.commit()
        admin_group = UserGroup.get_admin_group()
        if u not in admin_group.users:
            u.groups.append(admin_group)
            db.session.commit()
        self.login_test3()
        d = self.create_doc()
        self.json_post(f'/tags/add/{d.path}',
                       {'tags': [{'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode},
                                 {'name': 'testing subject', 'expires': None, 'type': TagType.Subject}]})
        self.login_test1()
        self.json_post(f'/tags/remove/{d.path}',
                       {'tagObject': {'block_id': d.id, 'name': 'TEST123', 'expires': None, 'type': TagType.CourseCode}},
                       expect_status=403)